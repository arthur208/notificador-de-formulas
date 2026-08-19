# Canal de Envio whatsmeow — Configurações, Cidades, Convênios e Usuários

**Data:** 2026-08-18
**Status:** especificação — nenhuma implementação feita
**Substitui:** `2026-08-18-canal-envio-botoes-spec.md`

> **[FATO]** = verificado no código, no banco de produção ou no OpenAPI da API.
> **[PERGUNTA]** = não determinável; registrado em vez de assumido.

**Premissa fixada:** este sistema **apenas envia**. A resposta do cliente cai no
MultiAtendWeb e é tratada por atendente humano. Não há callback, máquina de
estados nem interpretação de resposta. Botão é **formato visual**, nada mais.
O fluxo por webhook está descontinuado e não aparece nesta spec como solução.

---

## Fase 0 — Levantamento

### 0.1 Como o envio é acionado hoje

**[FATO]** Manual, iniciado pela atendente. Não há gatilho automático, fila nem
agendamento.

```
digita código → GET /api/cliente/:codigo
   · Firebird: nome + 4 telefones      · Mongo: já foi avisado?
   · existe em RECROMANEIO? → entrega  · se entrega: ViaCEP (será removido, D1)
   · monta mensagemSugerida
→ atendente escolhe telefone e edita o texto livremente
→ POST /api/enviar → formatPhoneNumber → axios.post(API_URL) → log no Mongo
```

**[FATO]** Tratamento de erro (`controllers/messageController.js:60`): `try/catch`
grava log de erro no Mongo e devolve 500. **Não há retry e não há timeout no
axios** — uma API lenta pendura a requisição indefinidamente.

**[FATO]** O destino atual é o webhook `API_URL`. Como ele está descontinuado,
**o envio precisa migrar para `POST /api/v1/messages/whatsmeow/send`** — que exige
Bearer JWT e o campo `token` da conexão, nenhum dos dois existente hoje.

### 0.2 whatsmeow suporta botões?

**[FATO]** Sim. Confirmado no OpenAPI (`/api/v1/docs.json`, 29 endpoints):

| Endpoint | Uso |
|---|---|
| `POST /api/v1/messages/whatsmeow/send` | texto simples |
| `POST /api/v1/messages/whatsmeow/buttons` | 1 a 3 botões |
| `POST /api/v1/messages/whatsmeow/list` | lista de opções |
| `POST /api/v1/messages/{channel}/upload-send` | mídia (multipart) |

**[FATO]** Tipos suportados no whatsmeow: `reply`, `cta_url`, `cta_call`,
`cta_copy`. **Máximo 3 botões** (`maxItems: 3`).

**[FATO]** Campos: `number`, `token`, `title`, `body`, `buttons[]` obrigatórios;
`imageUrl` opcional. Em cada botão `title` e `type` sempre; `id` obrigatório para
`reply`; `url` para `cta_url`; `phone_number` para `cta_call`; `copy_code` para
`cta_copy`.

**[FATO]** A especificação **não declara `maxLength` para o texto do botão**. O
WhatsApp impõe limite próprio, não documentado pelo fornecedor — precisa ser
descoberto empiricamente (cenário 7 do plano de teste).

### 0.3 Credenciais hoje

**[FATO]**

| Onde | O quê | Situação |
|---|---|---|
| `.env` → `API_URL` | webhook com UUID — descontinuado | sai de cena |
| `.env` → `FB_*`, `MONGO_URI` | bancos | permanece |
| `config.json` → `apiToken` | **versionado no git**, nenhum código usa | órfão |

**[FATO]** Não existe nada para guardar token de conexão — nem tabela, nem
coleção, nem tela, nem endpoint.

### 0.4 Entrega x retirada

**[FATO]** Binário e automático (`services/firebirdService.js:55`):
`SELECT T1.CODIGOR FROM RECROMANEIO T1 WHERE T1.CODIGOREC = ?`. Achou → entrega.

**[FATO]** Só duas coisas dependem dessa flag hoje: qual texto é usado, e se
busca endereço. Nada mais.

### 0.5 Endereço e cidade

**[FATO]** Vem de `ROMANEIO`. O código lê só `ENDERECO`, `NUMERO`, `BAIRRO`,
`CEP` — e **ignora a coluna `CODIGOCID`**, que é FK para `CIDADES` (5.651 linhas,
com `NOMECID`, `UFCID`, `COD_MUNICIPIOIBGE`).

**[FATO]** Medido em 6.052 entregas de 12 meses: `CEP` 100% preenchido,
`CODIGOCID` 100% preenchido. **Decidido (D1 da spec anterior): ViaCEP sai,
`CODIGOCID` vira fonte única.**

### 0.6 Convênio — onde o dado realmente está

**Estruturas descartadas** (vazias ou com outro significado):

| Estrutura | Linhas | Veredito |
|---|---|---|
| `CONVENIOS` | **0** | vazia — não é aqui |
| `ROMANEIO.CONVENIO` | — | **100% vazio**; é flag de *pagamento* |
| `ROMANEIO.LOJADESTINO` / `LOJAORIGEM` | — | **100% vazios** |
| `UBS` | **0** | **0 de 22.161 receitas** têm `CODIGOPEDIDO_UBS` |
| `PEDIDO_APP` | **0** | 0 receitas vinculadas |
| `LIBERACAOREMOTA`, `ENTREGAVALEVERDE` | **0** | vazias |
| `RECEITAS`, `RECCLIENTE` | — | nenhuma coluna de convênio |
| **`RECFORMULAS`** | — | **nenhuma coluna de convênio**; suas FKs vão para `PESSOAS`, `RECEITAS`, `TIPORECEITAS`, `PEDIDOFORMULA_APP` |

**[FATO] O convênio está em `TABELASIMPLES` com `TIPO = 'CONVENIO'`** — uma
tabela de domínio genérica de 401 linhas, das quais **97 são convênios ativos**.
`PESSOACONVENIO.CODIGOCONVENIO` e `MOVCONVENIOS.CODIGOTS` (176.852 linhas)
apontam para o `CODIGOTS` dela.

Cadeia completa, verificada:

```
STATUSRECEITA → RECFORMULAS → RECCLIENTE → PESSOACONVENIO → TABELASIMPLES
   (CODIGORF)     (CODIGOREC)   (CODIGOPES)  (CODIGOCONVENIO = CODIGOTS)
```

### 0.6.1 A lista de 97 convênios é sobrecarregada

**[FATO]** `TIPO='CONVENIO'` mistura quatro coisas incompatíveis:

| Natureza | Exemplos |
|---|---|
| **Local de retirada** (o que o Escopo D quer) | FARMACIA PORTO RICO, FARMACIA UNIAO, FARMACIA FARMAVIDA LOANDA, FARMA SAUDE, FARMACIA ALQUIMIA — ~19 farmácias |
| **Instituição** | PREFEITURA DE LOANDA, PREFEITURA DE PORTO RICO, HPNL, SINDICATO DOS METALURGICOS, CASA DE ABRIGO LOANDA (ASILO) |
| **Categoria de desconto** | FUNCIONÁRIO, CLINICAS 20%, ASSINA NF C/ 20%, ASSINA CP S/ DESC., **SEM CONVENIO** |
| **Pessoa física / lixo** | dezenas de nomes; e `F`, `.`, `XXXX`, `PERDIDO`, `NÃO EXISTE SAO LUCAS Q` |

**Não é possível derivar automaticamente quais são locais de retirada.** Exige
curadoria manual — ver Escopo D.

### 0.6.2 O vínculo é por CLIENTE, não por receita

**[FATO]** Medido nas 114 receitas conferidas em 17–18/08:

| | Receitas |
|---|---|
| Total conferidas | 114 |
| Cliente **tem** vínculo de convênio | **42 (37%)** |

Convênios que apareceram nesses 42:

| CODIGOTS | Nome | Receitas | É local de retirada? |
|---|---|---|---|
| 141 | ASSINA CP S/ DESC. | **15** | ❌ é categoria de desconto |
| 339 | ELVIRA BETIM | 5 | ❌ pessoa física |
| **336** | **FARMACIA PORTO RICO** | **5** | ✅ |
| 317 | LIDIO | 3 | ❌ |
| 530 | PATRICIA SCHAIDER | 3 | ❌ |
| **293** | **PREFEITURA MUN. SAO PEDRO PARANÁ** | **3** | ✅ |
| *(demais)* | vários | 8 | maioria ❌ |

**Só 8 das 42 são plausivelmente local de retirada.** Tratar "tem convênio" como
"vai para o convênio" erraria em ~80% dos casos.

**[FATO]** E o vínculo é do **cliente**, não da receita: um cliente conveniado
tem o vínculo em *todas* as suas receitas. Nada no banco distingue a receita que
foi para o convênio daquela que ele mesmo buscou na farmácia.

**[FATO]** 17 pessoas têm **dois** convênios simultâneos (15.106 têm um) —
exige regra de desempate.

**Conclusão:** o dado existe e é rico, mas **não basta sozinho** para decidir a
modalidade — daí a decisão **D10** (sugere marcado, atendente confirma).

### 0.7 Templates hoje

**[FATO]** Não há engine. Dois literais em `controllers/recipeController.js:48` e
`:51`, com interpolação de JavaScript. Mudar uma palavra exige commit e restart.

### 0.8 Usuários e autenticação

**[FATO]** **Não existe absolutamente nada.** Busca por `session`, `passport`,
`jwt`, `bcrypt`, `login`, `logout`, `usuario`, `req.user`, `authenticate`,
`authorization` em todo o código: **zero ocorrências**. Nenhuma dependência de
auth no `package.json`.

**[FATO]** O único controle é o filtro de IP — que está furado (bypass provado
com `X-Forwarded-For`, registrado na spec anterior).

**[FATO]** Mongo tem só duas coleções: `notificador_logs` (8.493 docs, a em uso)
e `logs_envio` (1.166 docs, **não referenciada por nenhum código** — resíduo).

---

## Escopo A — Envio pelo whatsmeow

### A.1 Formato da mensagem

Dois modos, escolhidos por configuração:

**Texto simples** — `POST /api/v1/messages/whatsmeow/send`
```json
{ "number": "5544997028340", "token": "<conexão>", "body": "<texto renderizado>" }
```

**Com botões** — `POST /api/v1/messages/whatsmeow/buttons`
```json
{ "number": "5544997028340", "token": "<conexão>",
  "title": "<título>", "body": "<corpo renderizado>",
  "buttons": [ { "id": "opt_1", "title": "Confirmar", "type": "reply" } ] }
```

**Uso pretendido dos botões, dado que não lemos resposta:**

| Tipo | Serve? | Por quê |
|---|---|---|
| `cta_call` | ✅ | "Ligar para a farmácia" — ação completa no aparelho |
| `cta_url` | ✅ | localização, WhatsApp da loja |
| `cta_copy` | ✅ | copiar o número da receita |
| `reply` | ⚠️ | o cliente clica e **a resposta cai no MultiAtendWeb** para o atendente humano. Funciona, mas gera ticket — decisão operacional, não técnica |

O `body` continua sendo o texto renderizado do template. Botões são acréscimo.

### A.2 Persistência do token

MongoDB, coleção `canal_config`, junto das demais configurações (Escopo B).
**Nunca no `.env`** — o requisito é ser editável por tela.

### A.3 Plano de teste isolado

Número de teste do time, nunca cliente real. Nada toca `messageController.js`.

| # | Cenário | Critério |
|---|---|---|
| 1 | `POST /auth/token` com client_credentials | recebe `access_token` + `refresh_token` |
| 2 | Renovação via `refresh_token` | novo token sem novo secret |
| 3 | Expiração do Bearer no meio do uso | renova e reenvia sozinho |
| 4 | `whatsmeow/send` texto simples | chega no aparelho |
| 5 | `buttons` com 1 botão | chega e é clicável |
| 6 | `buttons` com 3 botões | chega íntegro |
| 7 | `buttons` com 4 botões | **espera-se erro** — confirma o limite |
| 8 | Texto de botão com 30+ caracteres | **descobre o limite real**, ausente da doc |
| 9 | `cta_call` e `cta_url` | acionam ligação / abrem link |
| 10 | Token de conexão inválido | erro tratável, não 500 genérico |
| 11 | API fora do ar | falha em tempo aceitável — **hoje não há timeout** |
| 12 | Emoji e acento no corpo | chegam sem corromper |

### A.4 Variáveis de `.env` a solicitar na fase de testes

```env
MULTIATEND_BASE_URL=https://api2.multiatendweb.com.br
WHATSAPP_NUMERO_TESTE=          # número do time, só para a fase de testes
```

**Só isso.** Por **D6**, `client_id`, `client_secret` e o token da conexão vivem
todos no Mongo (`canal_config`), editáveis pela tela — nenhum deles no `.env`.

**Consequência que isso cria:** as três credenciais do canal passam a estar num
banco que hoje não tem criptografia em repouso, numa tela hoje protegida só pelo
filtro de IP (que tem bypass provado). Por isso a Fase 4 (usuários) vem **antes**
da Fase 8 (tela de configurações) no plano — e a criptografia dos campos
sensíveis de `canal_config` é requisito da Fase 3, não um extra.

Para a fase de testes eu vou pedir `client_id`, `client_secret` e o token
**diretamente a você**, sem passar por arquivo — eles entram no Mongo pela
rotina de seed.

---

## Escopo B — Página de configurações

Tela única (`/configuracoes`), tudo persistido no Mongo.

**1. Conexão** — token (mascarado, ver abaixo), `client_id`/`client_secret`,
número remetente, botão "testar conexão", indicador de status.

**2. Modalidade** — template de retirada, de entrega e de convênio.

**3. Cidades e prazos** — grade do Escopo C.

**4. Botões** — ligar/desligar por modalidade; até 3, com tipo e texto.

**Mascaramento do token:** obrigatório. A API de leitura devolve só os 4 últimos
caracteres (`••••••••a3f9`). O valor cheio nunca sai do servidor depois de salvo.

**Global ou por conexão?** A farmácia tem **uma** conexão. Proposta: documento
único de configuração global, mas com o campo `codigoFilial` reservado desde já —
`RECEITAS` tem `CODIGOFILIAL` e `CODIGOFILIAL_CAD`, então o ERP já prevê
multi-loja. Criar a estrutura preparada custa pouco agora e evita migração depois.
Por **D5** existe **uma** unidade; o campo fica reservado, sem uso.

---

## Escopo C — Cidades e prazos

**[FATO] Não é necessário cadastro de variações de escrita.**
`ROMANEIO.CODIGOCID` é FK inteira, 100% preenchida em 6.052 entregas. O
casamento é exato, por inteiro.

### Distribuição real (12 meses)

| Cidade | UF | Entregas | % |
|---|---|---|---|
| Querência do Norte | PR | 1.777 | 29,4% |
| **Loanda** | PR | 1.438 | 23,8% |
| Santa Cruz do Monte Castelo | PR | 744 | 12,3% |
| Porto Rico | PR | 609 | 10,1% |
| São Pedro do Paraná | PR | 606 | 10,0% |
| Santa Isabel do Ivaí | PR | 451 | 7,5% |
| Santa Mônica | PR | 107 | 1,8% |
| Porto São José | PR | 60 | 1,0% |
| Nova Londrina | PR | 39 | 0,6% |
| Santa Esmeralda | PR | 34 | 0,6% |
| *(cauda longa)* | | ~187 | 3,1% |

**Loanda é 24%, não é a maioria.** A regra "se não for Loanda, usa alternativo"
cairia no alternativo em **76% das entregas**. Por **D11**, Loanda ganha template próprio e as demais usam o padrão — ambos com variáveis.

### Cidades implausíveis

~52 entregas/ano para Querência/**MT**, Monte Castelo/**SP**, Santa Isabel/**SP**,
Monte Castelo/**SC** — operador selecionando a linha errada numa lista nacional
de 5.651 nomes parecidos. Por isso o cadastro **lista apenas cidades ativadas
explicitamente** e cai no fallback para o resto, em vez de adivinhar.

### Matching e fallback

```
ROMANEIO.CODIGOCID → cidade ativa cadastrada?
    sim → prazo e template dela
    não → template padrão de entrega, SEM promessa de prazo
```

O fallback **nunca inventa prazo**. A tela deve listar cidades que apareceram em
entregas recentes e não estão cadastradas, para o buraco ser visível.

---

## Escopo D — Modalidade Convênio

### D.1 Origem do dado — existe, mas é sinal parcial

Ver 0.6. O ERP **tem** o convênio (`TABELASIMPLES TIPO='CONVENIO'`, ligado ao
cliente por `PESSOACONVENIO`), mas ele **não basta** para decidir a modalidade,
por três motivos medidos:

1. A lista de 97 mistura local de retirada, categoria de desconto, pessoa física
   e lixo — só ~19 farmácias e ~5 instituições são destinos reais.
2. O vínculo é do **cliente**, não da receita — não distingue a receita que foi
   ao convênio daquela que o cliente buscou na farmácia.
3. 37% das receitas conferidas têm vínculo, mas só ~19% desses são destino real.

**Desenho proposto: o ERP dá o candidato, o humano confirma.**

```
receita → cliente tem PESSOACONVENIO?
   → o CODIGOTS está na nossa allowlist de locais de retirada?
        sim → a tela SUGERE "convênio: FARMACIA PORTO RICO", já marcado
        não → nenhuma sugestão
   → a atendente confirma ou desmarca antes de enviar
```

Isso usa o dado real sem confiar cegamente nele, e resolve o caso do cliente
conveniado que desta vez veio buscar na loja. A allowlist é curadoria manual
única: das 97, marcar quais são destino. Confirmado em **D2** e **D10**.

### D.2 Modelo do convênio

**A existência da config É a allowlist.** Não há flag separada: criar uma config
para `FARMACIA PORTO RICO` marca esse convênio como local de retirada. Convênios
sem config — como `ASSINA CP S/ DESC.` ou `SEM CONVENIO` — nunca disparam a
modalidade, e o cliente segue o caminho normal de entrega/retirada. Isso elimina
a necessidade de bloquear envio por falta de cadastro.

**Seleção por list picker**, alimentado direto do ERP:

```sql
SELECT CODIGOTS, NOME FROM TABELASIMPLES
WHERE TIPO = 'CONVENIO' AND STATUS = 'A' ORDER BY NOME     -- 97 opções
```

| Campo | Origem | Observação |
|---|---|---|
| `codigoTs` | **ERP**, via picker | chave de casamento |
| `nomeErp` | **ERP** (`TABELASIMPLES.NOME`) | só para exibição na tela de config |
| `nomeExibicao` | nosso | **inclui a preposição** — ver D.2.1 |
| `dias` | nosso | vira `{{dias}}` |
| `variaveis[]` | nosso | pares `chave`/`valor` livres — ver D.2.2 |
| `templateId` | nosso | opcional; ausente = template padrão de convênio |
| `ativo` | nosso | permite desligar sem apagar |

**Desempate:** 17 clientes têm dois convênios. Se ambos tiverem config, a tela
pergunta em vez de escolher sozinha.

### D.2.1 `nomeExibicao` carrega a preposição — e por quê

O ERP guarda os nomes em caixa alta e sem artigo. Uma preposição fixa no
template erra em boa parte da lista real:

| Convênio no ERP | Template com "na {{local}}" |
|---|---|
| FARMACIA PORTO RICO | "retirada **na** Farmácia Porto Rico" ✅ |
| PREFEITURA DE LOANDA | "retirada **na** Prefeitura de Loanda" ✅ |
| HPNL | "retirada **na** HPNL" ❌ — seria "no HPNL" |
| SINDICATO DOS METALURGICOS | "retirada **na** Sindicato..." ❌ |

Por isso `nomeExibicao` guarda o texto pronto — `na Farmácia Porto Rico`,
`no HPNL`, `no Sindicato dos Metalúrgicos` — e o template escreve apenas
`retirada {{local}}`. Sem lógica de gênero, e de quebra resolve a
capitalização (o cliente não recebe FARMACIA PORTO RICO gritando).

### D.2.2 Variáveis: nomeadas, com campos livres por convênio

**Decidido: variáveis nomeadas** (não posicionais). Posicional quebra ao
reordenar a frase e obriga a decorar o que era cada número.

Três camadas, resolvidas nesta ordem:

| Camada | Variáveis | Origem |
|---|---|---|
| **Globais** | `{{saudacao}}` `{{nome}}` `{{codigo}}` `{{qtdFormulas}}` | receita e cliente |
| **Da modalidade** | `{{dias}}` `{{local}}` | config do convênio |
| **Livres** | as que você criar: `{{horario}}` `{{contato}}` `{{observacao}}` | `variaveis[]` da config |

Exemplo com a config de FARMACIA PORTO RICO (`dias=3`,
`nomeExibicao="na Farmácia Porto Rico"`, livre `horario="Seg a Sex, 8h às 18h"`):

```
{{saudacao}}, {{nome}}! 👋

Sua fórmula estará pronta em {{dias}} dias e disponível
para retirada {{local}}.
Atendimento: {{horario}}
```
```
Bom dia, Roger Oliveira de Moraes! 👋

Sua fórmula estará pronta em 3 dias e disponível
para retirada na Farmácia Porto Rico.
Atendimento: Seg a Sex, 8h às 18h
```

**Regras de validação — nenhuma delas é opcional:**

1. **Variável livre não pode sombrear nome reservado.** Criar `{{nome}}` como
   livre é recusado no salvamento.
2. **Template não salva se referenciar variável inexistente** para aquele
   convênio. O editor lista as disponíveis como chips clicáveis.
3. **Na renderização, variável não resolvida bloqueia o envio.** Jamais enviar
   `retirada {{local}}` literal ao cliente — falha visível para a atendente é
   muito melhor que mensagem quebrada em nome da farmácia.
4. **Pré-visualização obrigatória na tela**, com os valores reais da config.

### D.3 Precedência — proposta

Convênio **sobrepõe** entrega/retirada e cidade. Justificativa: os três respondem
"onde o cliente busca", e convênio é a resposta mais específica. Um prazo de
cidade não faz sentido quando o destino é um convênio com prazo próprio.

```
receita conferida
│
├─ cliente tem PESSOACONVENIO cujo CODIGOTS possui CONFIG ativa?
│    │   (a existência da config é a allowlist — sem config, não é convênio)
│    │   dois convênios com config → a tela pergunta
│    │
│    sim → tela SUGERE a modalidade, já marcada, e a atendente confirma
│           └─ confirmou → TEMPLATE CONVÊNIO
│                 {{local}}, {{dias}} e as variáveis livres da config
│                 (ignora cidade e a flag entrega/retirada)
│           └─ desmarcou → segue pelo ramo de baixo
│
└─ não (ou desmarcado) → existe em RECROMANEIO?
         │
         ├─ sim → ENTREGA
         │    └─ CODIGOCID tem cidade ativa cadastrada?
         │         sim → template da cidade (ou padrão) + {{dias}} dela
         │         não → template padrão de entrega, SEM prazo
         │
         └─ não → RETIRADA NA FARMÁCIA (sem cidade, sem prazo)
```

Confirmado em **D3**: convênio sobrepõe cidade e a flag entrega/retirada.

### D.4 Casos de borda

| Situação | Comportamento |
|---|---|
| Convênio **sem config** | **não é convênio** — cai em entrega/retirada normalmente. Sem bloqueio, sem aviso. É o caso de `ASSINA CP S/ DESC.`, `FUNCIONÁRIO`, `SEM CONVENIO` e das pessoas físicas |
| Config existe e está completa | template de convênio |
| Config existe, mas o template usa variável que ela não define | **bloqueia o envio** e aponta a variável faltante (regra 3 de D.2.2) |
| Config desativada (`ativo: false`) | tratada como sem config |
| Cliente com **dois** convênios com config | a tela pergunta qual, sem escolher sozinha |
| Atendente desmarca a sugestão | segue por entrega/retirada |

A única situação que bloqueia é **variável não resolvida**, e é deliberado:
mandar `retirada {{local}}` literal para o cliente é pior que não mandar.

Note que "convênio não cadastrado" **deixou de ser um problema**. No desenho
anterior ele bloqueava; agora simplesmente significa "esse cliente não retira em
convênio", que é a leitura correta em ~80% dos vínculos (0.6.2).

---

## Escopo E — Usuários

Partindo do zero absoluto (0.8).

### E.1 Cadastro e autenticação

Usuário com `nome`, `email` (login), `senhaHash` (bcrypt ou argon2), `papel`,
`ativo`. Sessão por cookie `httpOnly` + `SameSite=Strict`, com expiração.
Sem auto-cadastro: o primeiro usuário nasce por script de seed, os demais são
criados por um administrador.

### E.2 Papéis

| Papel | Pode |
|---|---|
| **atendente** | ver lista do dia, buscar receita, enviar mensagem, ver histórico |
| **gestor** | tudo do atendente + editar templates, cidades, prazos e convênios |
| **admin** | tudo do gestor + token da conexão, credenciais e usuários |

Três papéis porque as três coisas têm risco diferente: enviar mensagem é
rotina; mudar template altera o que sai em nome da farmácia; token é credencial.

### E.3 Auditoria

Coleção `auditoria`, append-only: `usuarioId`, `acao`, `entidade`, `quando`,
`valorAnterior`, `valorNovo`. **Token nunca é gravado em texto** — registra-se
apenas "token alterado", com os 4 últimos caracteres.

Eventos obrigatórios: alteração de token/credenciais, de template, de prazo de
cidade, de convênio, criação/desativação de usuário e mudança de papel.

### E.4 Relação com conexão/unidade

Por **D5** há uma só unidade. Fica reservado o campo
`codigoFilial` opcional no usuário, sem uso enquanto houver uma unidade.

### E.5 Relação com o filtro de IP

Usuários **não substituem** o filtro de IP; são camadas diferentes (rede x
identidade). Mas com login funcionando, o bypass do `X-Forwarded-For` deixa de
dar acesso total — passa a dar acesso à tela de login. **Este módulo é a
correção mais efetiva para o problema de acesso.**

---

## Modelo de dados

Tudo no Mongo. O Firebird é **lido, nunca escrito**.

```
canal_config          documento único (codigoFilial reservado)
  canal:'whatsmeow', token, clientId, clientSecret, numeroRemetente,
  botoesAtivos, ativo, atualizadoEm, atualizadoPor

templates             um por modalidade
  modalidade: 'retirada' | 'entrega' | 'convenio'
  titulo, corpo, botoes[], versao, atualizadoEm, atualizadoPor

cidades_entrega       um por cidade atendida
  codigoCid (único, do ERP), nome, uf, prazoEntrega, templateId, ativo

convenios             a existência do documento É a allowlist
  codigoTs (único, do ERP), nomeErp, nomeExibicao (com preposição),
  dias, variaveis: [{ chave, valor }], templateId?, ativo

usuarios
  nome, email (único), senhaHash, papel, ativo, ultimoAcesso

auditoria             append-only
  usuarioId, acao, entidade, entidadeId, quando, valorAnterior, valorNovo
```

**Sintaxe de variável: `{{nome}}`**, nomeada, nunca posicional.

| Camada | Variáveis |
|---|---|
| Globais (toda modalidade) | `{{saudacao}}` `{{nome}}` `{{codigo}}` `{{qtdFormulas}}` |
| Entrega | `{{endereco}}` `{{cidade}}` `{{dias}}` |
| Convênio | `{{local}}` `{{dias}}` |
| Livres | definidas por convênio em `variaveis[]` |

`{{dias}}` é a mesma variável nas duas modalidades, resolvida por precedência:
config do convênio vence cadastro da cidade (ver D.3).

---

## Decisões tomadas (2026-08-18)

| Ref | Decisão |
|---|---|
| **D1** | ViaCEP removido; `CODIGOCID` é fonte única de cidade |
| **D2** | **[P1b]** A allowlist É a config: convênio selecionado na tela = local de retirada; os demais, não |
| **D3** | **[P2]** Convênio **sobrepõe tudo** — cidade e flag entrega/retirada. Justificativa do cliente: "se a pessoa é de Porto Rico e temos entrega em Porto Rico, mas ela pediu no convênio, entregamos no convênio" |
| **D4** | **[P4]** Prazo em **dias úteis** |
| **D5** | **[P5]** **Uma** unidade apenas — `codigoFilial` fica reservado no modelo, sem uso |
| **D6** | **[P6]** `client_id` e `client_secret` no **Mongo**, junto do token da conexão. Consequência: o `.env` deixa de conter credencial do canal, e a criptografia em repouso vira requisito da coleção `canal_config` |
| **D7** | **[P7]** **Gestor e admin** podem alterar prazo de entrega |
| **D8** | **[P8]** Botões `reply` são desejáveis — aceito que o clique gere ticket no MultiAtendWeb para atendimento humano |
| **D9** | **[P9]** `logs_envio` **mantida** para acesso legado; não migrar, não descartar. Nenhum código novo escreve nela |
| **D10** | **[P1]** A tela **sugere a modalidade já marcada** e a atendente confirma ou desmarca. Resolve o fato de o vínculo ser por cliente e não por receita: a mesma cliente que hoje pede no convênio, mês que vem busca na loja, e no banco as duas receitas são idênticas |
| **D11** | **[P3]** **Loanda tem template próprio**; as demais cidades usam o padrão de entrega. Ambos com variáveis. Implementado como **override por cidade** (`cidades_entrega.templateId`) — hoje só Loanda usa, mas qualquer cidade pode ganhar texto próprio depois sem mudança de código |

---

## Perguntas em aberto

**Nenhuma bloqueante.** As dez perguntas originais foram respondidas em
2026-08-18 e viraram as decisões D1–D11 acima.

**Adiado por escolha: direção visual das telas.** Cor, tipografia, claro/escuro,
densidade e uso da marca. Não se decide por escrito — será resolvido na Fase 8,
com telas reais para comparação. Não bloqueia nenhuma fase anterior.

**Pendência técnica, não de desenho:** a autenticação do Firebird falhou de forma
intermitente ~6 vezes durante o levantamento, sempre com o mesmo erro de
credencial, voltando sozinha em seguida. Contornado com retry nos scripts de
investigação; **causa não determinada**. Em produção isso apareceria como falha
aparentemente aleatória na busca do cliente. Investigar antes de dar qualquer
fase por concluída.

---

## Plano de fases

| Fase | Conteúdo | Depende de |
|---|---|---|
| **1** | `CODIGOCID` + `CIDADES` no lugar do ViaCEP | nada (D1 decidido) |
| **2** | Migrar envio do webhook para `whatsmeow/send` + Bearer + timeout | credenciais |
| **3** | Motor de templates + `canal_config` no Mongo | Fase 2 |
| **4** | **Usuários, papéis e auditoria** | nada — pode correr em paralelo |
| **5** | Cadastro de cidades e prazos | Fase 3 |
| **6** | Prova de conceito de botões em número de teste | Fase 2 |
| **7** | Modalidade convênio | Fase 3 + curadoria da allowlist (D2) |
| **8** | Tela de configurações consolidando tudo | Fases 3–7, front novo |

**A Fase 4 vem antes da tela de configurações de propósito.** Sem login, a tela
que expõe o token da conexão fica protegida apenas pelo filtro de IP — que tem
bypass provado. Construir a tela primeiro seria criar exposição nova sobre um
controle que já falhou.

Fases 1, 2 e 4 não dependem de nenhuma pergunta em aberto.

---

## Restrições respeitadas

- Nenhum código de produção escrito.
- Nada inventado — o não verificável virou [PERGUNTA].
- Nada projetado depende de ler resposta do cliente.
- Webhook tratado como descontinuado.
