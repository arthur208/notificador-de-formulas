# Notificador de Fórmulas — Design da Evolução

**Data:** 2026-08-18
**Status:** aguardando revisão

## 1. Contexto

PWA interno da Farmácia Bioessência para avisar clientes que a fórmula manipulada está pronta. Hoje a atendente digita o código da receita, o sistema busca nome e telefones no Firebird (ERP SmartPharmacy), monta uma mensagem sugerida, ela revisa e dispara via webhook do MultiAtend. Cada envio é logado no MongoDB.

Trafegam nome, telefone, endereço residencial e o fato de a pessoa ter uma fórmula manipulada — dado pessoal e dado sensível de saúde (LGPD art. 5º, II).

**Stack atual:** Express 5 + Materialize CSS 1.0.0 (via CDN, projeto parado desde 2018) + JS vanilla. Firebird via `node-firebird`, logs em MongoDB.

## 2. O que motivou

1. Digitar o código à mão é o único jeito de começar um envio.
2. O front está datado e é um layout mobile esticado no desktop.
3. Os textos das mensagens estão escritos dentro de um controller.

## 3. Achados da investigação

Levantados contra o banco de produção em 2026-08-18. São a base das decisões.

### 3.1 Schema do status

```
CADSTATUS (5 linhas)     3=PESADO  4=FINALIZADO  12=CONFERIDO  13=ENTREGUE
STATUSRECEITA (959.802)  histórico: 1 linha por transição de status
    CODIGORF  -> RECFORMULAS.CODIGORF     (a fórmula)
    CODIGOCST -> CADSTATUS.CODIGOCST      (o status)
    DATA + HOTA                           (quando mudou)
RECFORMULAS (510.316)  CODIGOREC -> RECCLIENTE -> PESSOAS
```

O gatilho pedido, "conferido", é `CODIGOCST = 12`.

### 3.2 O status é por fórmula, não por receita

23% das receitas têm 2+ fórmulas (2.652 com duas, 911 com três, uma com 14). Medido nas receitas conferidas em 18/08: **24 completas, 2 parciais**.

Avisar por "tem alguma fórmula conferida" chamaria o cliente com o pedido incompleto numa fração relevante dos casos.

### 3.3 Volume diário

Entre 20 e 90 receitas conferidas por dia (13/08: 89 · 14/08: 61 · 15/08: 23 · 17/08: 69). Cabe numa tela sem paginação complexa.

### 3.4 Sujeira de data

156 eventos CONFERIDO (de 144.859) têm ano **2120** — `2120-08-30` e `2120-08-31`. Ordenam no topo de qualquer `ORDER BY DATA DESC`.

**Toda query precisa de `DATA <= CURRENT_DATE`.**

### 3.5 Performance: `IN (SELECT ...)` é proibido aqui

Medido no banco real:

| Abordagem | Tempo |
|---|---|
| IDs do dia isolados (usa `STATUSRECEITA_IDXDATA`) | 29 ms |
| Contagens + nome com `IN` de lista literal | 48 ms |
| **Mesma coisa com `IN (subquery)`** | **6.455 ms** |

O otimizador do Firebird não empurra o filtro de data para dentro do `IN`; materializa e varre as 510k linhas de `RECFORMULAS`. **Duas idas ao banco (77 ms) contra uma (6.486 ms) — 84x.** Os índices necessários já existem.

### 3.6 Segurança (fora do escopo desta entrega, registrado)

- `trust proxy: 1` + whitelist de faixas privadas = **bypass provado**: `curl -H "X-Forwarded-For: 10.0.0.1"` retorna 200 e a lista de clientes.
- `.env` tem `SYSDBA` com senha de desenvolvimento.
- `config.json` está versionado com um `apiToken` que nenhum código usa.

Tratar em conversa separada. Não bloqueia esta entrega.

## 4. Decisões

| Tema | Decisão |
|---|---|
| Gatilho da lista | status CONFERIDO (`CODIGOCST = 12`) |
| Recorte temporal | filtro por dia; o passado fica no passado |
| Receitas parciais | duas seções: "Prontas" e "Aguardando outras fórmulas" |
| Busca manual | permanece, para o caso "cliente ligou perguntando" |
| Já avisado | aparece marcado, não some |
| Framework | Vue 3.5.41 + Vite 8.2.1 |
| Linguagem | TypeScript 7.0.2 |
| Biblioteca visual | PrimeVue 5.0.1 |
| Backend | Express atual intacto; SPA compilada servida como estático |
| Mensagens | templates editáveis por tela, com variáveis, no Mongo |

Versões conferidas no npm registry em 2026-08-18, não presumidas.

## 5. Decomposição

Três projetos. Ordem recomendada: **A → C1 → B (+ C2)**, para nenhuma tela ser construída duas vezes.

O Projeto C se divide, porque parte dele independe de front e parte dele *é* front:

- **C1 — motor de templates** (Mongo, renderização das variáveis, fallback, correção dos bugs de mensagem). Não depende de framework nenhum, entra junto com A.
- **C2 — tela de edição dos templates.** É uma tela; nasce dentro do front novo, no Projeto B.

### Projeto A — Endpoint da lista de conferidas

`GET /api/conferidas?data=YYYY-MM-DD`

Duas queries em `services/firebirdService.js`:

```sql
-- 1) IDs do dia — 29ms
SELECT DISTINCT F.CODIGOREC FROM STATUSRECEITA S
JOIN RECFORMULAS F ON F.CODIGORF = S.CODIGORF
WHERE S.CODIGOCST = 12 AND S.DATA = ?

-- 2) contagens + nome — 48ms, IN com lista literal
SELECT F.CODIGOREC, COUNT(*) AS TOTAL,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM STATUSRECEITA S
             WHERE S.CODIGORF = F.CODIGORF AND S.CODIGOCST = 12)
           THEN 1 ELSE 0 END) AS CONFERIDAS,
       MAX(P.NOME) AS NOME
FROM RECFORMULAS F
LEFT JOIN RECCLIENTE RC ON RC.CODIGOREC = F.CODIGOREC
LEFT JOIN PESSOAS    P  ON P.CODIGOPES  = RC.CODIGOPES
WHERE F.CODIGOREC IN (...) GROUP BY F.CODIGOREC
```

Regras: IDs coagidos com `Number()`; lotes de 1000 no `IN` (limite do Firebird é 1500, pico diário é 89); `DATA <= CURRENT_DATE` sempre; o controller separa `prontas` de `aguardando` e cruza com `mongoService.checkExistingLog`.

Resposta:

```json
{ "data": "2026-08-18",
  "prontas":    [{ "codigoRec": 441433, "nome": "...", "conferidas": 4,
                   "total": 4, "hora": "08:30", "jaAvisado": false }],
  "aguardando": [{ "codigoRec": 441618, "nome": "...", "conferidas": 1, "total": 2 }] }
```

Também nesta fase: **timeout no `queryFb`**. Hoje a busca pendura 21 segundos calada quando o Firebird não responde (comportamento reproduzido).

### Projeto C1 — Motor de templates de mensagem

Hoje os dois textos são literais em `controllers/recipeController.js:48` e `:51`. A escolha entre eles é automática: `RECROMANEIO` tem a receita → entrega; não tem → retirada. Essa automação **permanece**; o que muda é que os textos passam a ser editáveis.

- Coleção nova no Mongo, um documento por situação (`retirada`, `entrega`).
- Variáveis: `{saudacao}`, `{nome}`, `{codigo}`, `{qtdFormulas}`, `{endereco}`.
- Função de renderização isolada e testável, independente de HTTP e de front.
- `GET /api/templates` e `PUT /api/templates/:situacao` para a tela de C2 consumir.
- Fallback: se o template estiver ausente ou quebrado, cai no texto atual embutido no código — nunca envia mensagem vazia.

Bugs corrigidos junto:

1. **Saudação calculada na hora errada.** Hoje sai na busca; buscar 11h58 e enviar 12h05 manda "Bom dia" no almoço. Passa a ser resolvida no envio.
2. **Endereço quebrado.** `${endereco || ''}, ${numero || ''} - ${bairro || ''}` produz literalmente `", - "` quando os campos vêm nulos.
3. **Falha do ViaCEP é silenciosa** — só um `console.warn`; a mensagem sai sem cidade/UF sem ninguém notar.
4. **A mensagem ignora múltiplas fórmulas** — daí a variável `{qtdFormulas}`.

### Projeto B — Front novo

```
web/                      Vite + Vue + TS  (build.outDir = '../public')
  src/{views,components,composables,api}/
public/                   passa a ser saída de build
index.js, routes/, ...    intactos
```

Dev: Vite em `:5173` com proxy de `/api` para `:3008`. Produção: `npm run build` e o Express serve como sempre. Sem servidor a mais, sem mudança de deploy.

| Rota | Tela | PrimeVue |
|---|---|---|
| `/` | Lista do dia — DatePicker + duas seções | DatePicker, Card, Tag, Skeleton |
| `/receita/:codigo` | Envio | SelectButton, Textarea, ConfirmDialog |
| `/buscar` | Busca manual | InputNumber |
| `/historico` | Histórico | DataTable |
| `/templates` | Edição de mensagens (**Projeto C2**) — consome a API de C1 | Textarea, preview |

Corrigidos por terem sido observados com o app rodando:

- **Skeleton no lugar do spinner de 8px**, hoje praticamente invisível.
- **Telefone formatado** `(44) 99702-8340` em vez de `5544997028340`.
- **Layout de desktop de verdade** — hoje é o mobile esticado numa coluna.
- **403 em JSON para `/api/*`** — o corpo atual é `text/html`, e `public/app.js:106` faz `response.json()` nele, então a atendente vê `Unexpected token 'A'` em vez de "acesso negado".

#### Entrada por código de barras

**O código de barras contém apenas o `CODIGOREC`** — confirmado pelo cliente em
2026-08-18. Não traz o `INDICE`. **Não há parser a escrever:** a string lida é o
próprio código da receita, exatamente o que a busca já espera.

**[FATO] O leitor físico do balcão já funciona hoje.** `public/app.js:64-69` já
trata `Enter` no campo do código:

```js
inputCodigoReceita.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { buscarCliente(); }
});
```

Leitor USB/Bluetooth comporta-se como teclado: digita e envia `Enter`. A única
fricção é que **o campo não tem `autofocus`** (`public/index.html:29`), então a
atendente precisa tocar nele antes de bipar. Acrescentar `autofocus` é a mudança
completa desse caminho.

**Três origens, um único campo.** A farmácia usa Android, iPhone e leitor físico:

| Origem | Como funciona | Custo |
|---|---|---|
| **Leitor físico** | vira teclado: digita + `Enter` | **já funciona**; falta só `autofocus` |
| **Android** | `BarcodeDetector` nativo do Chrome | baixo |
| **iPhone** | Safari não tem `BarcodeDetector` → biblioteca por câmera | médio |

Um campo só, com foco automático, que aceita digitação humana, leitor físico e —
pelo botão de câmera ao lado — leitura por foto. Distinguir "scanner ou gente
digitando" **não é necessário**: ambos terminam em `Enter`.

**Ganho além do previsto:** a leitura vira **consulta de status**, não só atalho
de busca. A atendente aponta para um frasco na bancada e vê
`███ ███ ░░░ — falta 1`, mesmo que a receita não esteja na lista do dia. A tela
de destino deve portanto funcionar para **qualquer** receita, não só as
conferidas hoje.

**Validação pendente, menor:** confirmar se a string vem com zeros à esquerda ou
dígito verificador (EAN-13 acrescenta ambos; Code 128 costuma trazer o número
cru). Uma amostra real resolve, mas não bloqueia — o caminho do leitor físico
pode ser testado no sistema atual antes de qualquer mudança.

#### PWA — o que existe hoje e o que precisa mudar

O sistema **é um PWA instalável** e isso não pode se perder na troca de stack.
Estado atual, verificado:

| Item | Situação |
|---|---|
| `public/manifest.json` | existe, aponta para `images/icon-192.png` e `icon-512.png` |
| **`public/images/`** | **não existe** — os dois ícones estão faltando |
| `public/sw.js` | cache-first, `CACHE_NAME = 'notificador-v1'` fixo |
| `activate` / `skipWaiting` / `clients.claim` no SW | **nenhum dos três** |
| Registro do SW | `public/index.html:138` |

**Risco 1 — a atendente pode ficar presa na versão velha.** O service worker é
cache-first, o nome do cache nunca muda, não há handler de `activate` para
limpar cache antigo e não há `skipWaiting`. Num aparelho com o PWA instalado,
`/`, `/index.html`, `/style.css` e `/app.js` são servidos do cache
indefinidamente. **Publicar o front novo pode não chegar a quem já instalou.**

*Correção:* o novo `sw.js` chama `self.skipWaiting()` no próprio `install` e
`clients.claim()` no `activate`, apagando todo cache cujo nome não seja o atual.
Isso funciona independentemente de o SW antigo não ter `skipWaiting` — quem
manda é o SW novo. Precisa ser testado **num aparelho com a versão antiga já
instalada**, não só em aba anônima.

**Risco 2 — o build apaga o PWA.** Com `build.outDir = '../public'`, o Vite
esvazia o diretório de saída. `manifest.json`, `sw.js` e os ícones precisam
morar em `web/public/` (assets estáticos do Vite) para serem copiados no build.
Se ficarem onde estão hoje, **somem no primeiro `npm run build`**.

**Risco 3 — `cache.addAll` é atômico e depende de CDN.** A lista inclui quatro
URLs externas (Materialize e Google Fonts). Se a internet da farmácia oscilar
durante a instalação, o `addAll` inteiro falha e o SW não instala. Com a stack
nova o Materialize sai de cena; as fontes, se usadas, devem ser servidas
localmente em vez de CDN.

**Ícones faltando:** o manifest referencia dois PNGs que não estão no
repositório. Chrome exige 192 e 512 para oferecer instalação — vale confirmar se
o PWA realmente instala hoje ou se está degradado. Os ícones precisam ser
gerados a partir da marca antes da Fase 8.

**Ferramenta:** `vite-plugin-pwa` (Workbox) gera o precache com hash de
conteúdo, versiona o cache sozinho, e já traz `skipWaiting`/`clientsClaim`
configuráveis — resolve os riscos 1 e 3 sem SW escrito à mão. A versão a usar
deve ser consultada no registry na hora, não presumida.

**Estratégia de cache:** manter a regra atual de **nunca cachear `/api/`** — ela
está correta em `public/sw.js:30`. Casca do app em cache, dados sempre da rede.
Sem isso, a lista do dia mostraria receitas de ontem.

**Offline:** o app depende de Firebird e Mongo para tudo que importa. Offline
real não é viável nem desejável aqui — o valor do PWA é abrir em tela cheia no
celular e carregar rápido, não funcionar sem rede. A tela deve dizer com clareza
que está sem conexão, em vez de mostrar lista vazia.

Direção visual (tipografia, cor, hierarquia) não é decidida aqui — entra em processo de design próprio antes da implementação das telas.

## 6. Riscos

| Risco | Mitigação |
|---|---|
| **Aparelho com PWA instalado continuar na versão antiga** | novo `sw.js` com `skipWaiting` + limpeza de cache; **testar em aparelho que já tem a versão velha instalada** |
| **Build do Vite apagar `manifest.json`, `sw.js` e ícones** | movê-los para `web/public/` antes do primeiro build |
| Datas ano 2120 poluindo a lista | `DATA <= CURRENT_DATE` em toda query |
| Regressão de performance com `IN (subquery)` | teste que falha acima de 500 ms |
| Template quebrado gerando mensagem vazia | fallback para o texto embutido |
| Envio duplicado com dois atendentes na mesma lista | selo "já avisado" via `checkExistingLog` |
| Bypass de IP continua aberto durante a obra | tratar antes de expor qualquer tela nova |

## 7. Em aberto

- Direção visual das telas.
- Quem pode editar template — o sistema não tem conceito de usuário hoje.
- Se `/templates` deve exigir alguma trava a mais que o resto.
