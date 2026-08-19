> ⚠️ **SUPERSEDIDA** por `2026-08-18-canal-whatsmeow-spec.md` (2026-08-18).
> Canal confirmado como whatsmeow, resposta do cliente não é lida por este
> sistema, e o fluxo por webhook foi descontinuado. Mantida apenas como
> histórico da investigação da API.

# Canal de Envio WhatsApp — Botões, Configurações e Cidades

**Data:** 2026-08-18
**Status:** especificação — nenhuma implementação feita
**Escopo desta etapa:** documentar e planejar

> Tudo marcado como **[FATO]** foi verificado no código, no banco de produção ou
> na especificação OpenAPI da API. Tudo marcado como **[PERGUNTA]** não pôde ser
> determinado e depende de resposta — não foi assumido.

---

## Fase 0 — Levantamento do que existe hoje

### 0.1 Como o disparo funciona hoje

**[FATO]** O envio é **manual e iniciado pela atendente**. Não existe gatilho
automático, agendamento ou fila. O fluxo inteiro:

```
atendente digita o código da receita
  → GET /api/cliente/:codigo
      · Firebird: nome + 4 telefones (FONERES, FONECEL, FONECOM, FONEREC)
      · Mongo: checkExistingLog — já foi avisado?
      · Firebird: existe em RECROMANEIO? → é entrega
      · se entrega: ViaCEP para cidade/UF
      · monta mensagemSugerida
  → atendente escolhe telefone, edita o texto livremente
  → POST /api/enviar
      · formatPhoneNumber: só dígitos, remove 55 duplicado,
        aplica 9º dígito, valida 11 dígitos, prefixa 55
      · axios.post(process.env.API_URL, payload)
      · grava log no Mongo (sucesso ou erro)
```

**[FATO]** Payload enviado hoje (`controllers/messageController.js:25`):

```json
{ "numero": "5544997028340", "mensagem": "texto final",
  "codigoReceita": 441694, "nomeCliente": "Roger Oliveira de Moraes" }
```

**[FATO]** O destino é `API_URL` = um **webhook**
(`https://api2.multiatendweb.com.br/api/webhooks/<uuid>`), que **não faz parte
da API v1 documentada**. São dois mecanismos distintos do mesmo fornecedor.

**[FATO]** Não há retry, não há timeout configurado no axios, e a resposta do
webhook é apenas logada — o sistema não sabe se a mensagem chegou ao cliente.

### 0.2 Onde ficam credenciais hoje

**[FATO]**

| Onde | O quê | Situação |
|---|---|---|
| `.env` → `API_URL` | webhook com UUID no path — é a credencial de fato | fora do git |
| `.env` → `FB_*`, `MONGO_URI` | banco | fora do git |
| `config.json` → `apiToken` | **versionado no git**, e nenhum código o usa | órfão |

**[FATO]** Não existe nenhuma estrutura para guardar token de conexão. Não há
tabela, coleção, tela ou endpoint para isso.

### 0.3 Como o sistema diferencia entrega de retirada

**[FATO]** Binário e automático, sem intervenção da atendente
(`services/firebirdService.js:55`):

```sql
SELECT T1.CODIGOR FROM RECROMANEIO T1 WHERE T1.CODIGOREC = ?
```

Achou → entrega. Não achou → retirada.

**[FATO]** Decisões que hoje dependem dessa flag — são só duas:

1. Qual dos dois textos literais é usado.
2. Se busca endereço no `ROMANEIO` e chama o ViaCEP.

Nada mais no sistema muda por causa dela.

### 0.4 De onde vem o endereço e a cidade — **achado importante**

**[FATO]** O endereço vem da tabela `ROMANEIO`, mas o código lê **apenas quatro
colunas**: `ENDERECO`, `NUMERO`, `BAIRRO`, `CEP`.

**[FATO]** A tabela `ROMANEIO` **tem uma coluna `CODIGOCID`**, chave estrangeira
para a tabela `CIDADES` (5.651 linhas, com `NOMECID`, `UFCID`,
`COD_MUNICIPIOIBGE`). **O código atual ignora essa coluna.**

**[FATO]** Em vez disso, a cidade é obtida chamando o **ViaCEP**
(`controllers/recipeController.js:30`) a partir do CEP. Se o ViaCEP falhar, o
`catch` só emite `console.warn` e a mensagem sai sem cidade, silenciosamente.

**[FATO]** Qualidade do dado, medida em 6.052 entregas dos últimos 12 meses:

```
CODIGOCID preenchido:  6.052 de 6.052   (zero nulos)
```

**Ou seja: o sistema descarta um dado interno 100% preenchido e confiável para
depender de uma API externa que pode falhar em silêncio.** Isso é a base do
Escopo C.

### 0.5 Como os templates estão estruturados hoje

**[FATO]** Não existe engine de template. São dois literais em
`controllers/recipeController.js:48` e `:51`, com interpolação direta de
JavaScript. Variáveis efetivas: saudação (por hora do servidor), nome
(`toTitleCase`), código da receita e — só na entrega — o endereço concatenado.

**[FATO]** Mudar qualquer palavra exige editar código, commit e restart.

---

## Escopo A — Botões interativos

### A.1 O que a API oferece

**[FATO]** Extraído de `https://api2.multiatendweb.com.br/api/v1/docs.json`
(OpenAPI 3.0.0, 29 endpoints). A doc HTML é uma SPA e não pode ser lida
diretamente — o JSON está em `/api/v1/docs.json`.

Existem endpoints de botão para **três canais distintos**:

| Endpoint | Tipos de botão suportados |
|---|---|
| `POST /api/v1/messages/whatsmeow/buttons` | reply, cta_url, cta_call, cta_copy |
| `POST /api/v1/messages/baileys/buttons` | reply, cta_url, cta_call, cta_copy |
| `POST /api/v1/messages/oficialapi/buttons` | **apenas** reply, cta_url |

Também existem `/list` (lista de opções) nos três canais e `/template` +
`GET /templates` exclusivos do canal Oficial API.

**[FATO]** Limite: **máximo 3 botões** (`maxItems: 3`) em todos os canais.

**[FATO]** Payload:

```json
{ "number": "5544997028340",
  "token":  "<token da conexão>",
  "title":  "Título da mensagem interativa",
  "body":   "Corpo do texto exibido acima dos botões",
  "buttons": [
    { "id": "opt_1", "title": "Sim", "type": "reply" },
    { "id": "link_1", "title": "Abrir site", "type": "cta_url", "url": "https://..." }
  ],
  "imageUrl": "https://... (opcional)" }
```

Campos obrigatórios: `number`, `token`, `title`, `body`, `buttons`. Em cada
botão, `title` e `type` sempre; `id` obrigatório para `reply`; `url` para
`cta_url`; `phone_number` para `cta_call`; `copy_code` para `cta_copy`.

**[FATO]** A especificação **não declara `maxLength` para o texto do botão**. O
WhatsApp impõe limite próprio (na ordem de 20 caracteres para botões de
resposta), mas isso não está na doc do fornecedor e precisa ser verificado
empiricamente antes de definir os textos.

### A.2 Duas credenciais diferentes — a distinção que importa

**[FATO]** A API tem **um único esquema de segurança**: `BearerJWT`, obtido em
`POST /api/v1/auth/token` com `grant_type=client_credentials` (`client_id` +
`client_secret`) ou `grant_type=refresh_token`.

**[FATO]** Mas **todo endpoint de mensagem exige, além do Bearer, um campo
`token` no corpo** — descrito como "Token da conexão WhatsApp (obrigatório)".
Isso vale inclusive para `POST /api/v1/messages/send` (texto simples).

São coisas distintas:

| | Obtém como | Serve para |
|---|---|---|
| **Bearer JWT** | `POST /auth/token` com client_id/secret | autenticar a chamada na API |
| **Token da conexão** | **não há endpoint na API v1** | dizer *de qual conexão WhatsApp* sai a mensagem |

**Confirmada a limitação que você levantou:** não existe endpoint para
cadastrar, listar ou recuperar o token da conexão. Ele precisa ser obtido fora
da API e guardado por nós.

### A.3 Bloqueio: não há caminho documentado para a resposta do botão

**[FATO]** Busca textual na especificação OpenAPI inteira:

```
"webhook"    → 0 ocorrências
"callback"   → 0 ocorrências
"subscribe"  → 0 ocorrências
"event"      → 0 ocorrências
```

**[FATO]** `GET /api/v1/tickets` aceita **apenas** `page` e `pageSize` — sem
filtro por data, número, status ou conteúdo.

Botão existe para o cliente responder. Se não há callback documentado e a
listagem de tickets não tem filtro, **não há caminho conhecido para saber que o
cliente clicou**. Isso precisa ser resolvido antes de qualquer implementação —
ver [PERGUNTA 1].

### A.4 Endpoint a criar no nosso sistema

Proposta, **para implementação futura**:

```
GET    /api/canal/conexao         → devolve a config (token mascarado)
PUT    /api/canal/conexao         → grava/atualiza
POST   /api/canal/conexao/testar  → valida contra a API antes de salvar
```

Campos:

| Campo | Tipo | Validação |
|---|---|---|
| `canal` | enum | `whatsmeow` \| `baileys` \| `oficialapi` — define quais tipos de botão ficam disponíveis |
| `token` | string | obrigatório; nunca devolvido em texto puro pela API de leitura |
| `clientId` / `clientSecret` | string | para `POST /auth/token` |
| `numeroRemetente` | string | informativo, para exibir na tela |
| `ativo` | boolean | permite desligar botões sem apagar a config |

Persistência: coleção nova no Mongo. **[PERGUNTA 6]** trata da criptografia.

Referência no envio: o serviço de envio lê a config ativa, obtém/renova o Bearer
e injeta o `token` no corpo. O `.env` deixa de ser o lugar do segredo de canal.

### A.5 Plano de teste isolado

Antes de encostar no fluxo de produção:

| # | Cenário | Critério |
|---|---|---|
| 1 | `POST /auth/token` com as credenciais | recebe `access_token` e `refresh_token` |
| 2 | Renovação por `refresh_token` | novo token sem novo client_secret |
| 3 | `messages/send` texto simples para número de teste | chega no aparelho |
| 4 | `buttons` com 1 botão `reply` | chega e é clicável |
| 5 | `buttons` com 3 botões (o máximo) | chega íntegro |
| 6 | `buttons` com 4 botões | **espera-se erro** — confirma o limite |
| 7 | Texto de botão longo (30+ chars) | **descobre o limite real** ausente da doc |
| 8 | `cta_url` com link | abre no navegador |
| 9 | Token de conexão inválido | erro tratável, não 500 genérico |
| 10 | Clicar num botão `reply` | **descobrir onde a resposta aparece** — ver [PERGUNTA 1] |

Ambiente: número de teste do próprio time, nunca cliente real. Nenhum destes
testes toca `messageController.js`.

### A.6 Variáveis de `.env` a solicitar na fase de testes

Quando chegarmos aos testes, vou pedir exatamente estas:

```env
MULTIATEND_BASE_URL=https://api2.multiatendweb.com.br
MULTIATEND_CLIENT_ID=
MULTIATEND_CLIENT_SECRET=
MULTIATEND_CANAL=            # whatsmeow | baileys | oficialapi
MULTIATEND_CONEXAO_TOKEN=
WHATSAPP_NUMERO_TESTE=       # número do time para os testes
```

O `API_URL` do webhook atual **permanece intocado** — os dois caminhos convivem
durante toda a transição.

---

## Escopo B — Página de configurações do canal

Tela nova (`/configuracoes`), agrupada em quatro blocos:

**1. Conexão** — canal, token, credenciais, botão "testar conexão", indicador de
status. Campos de segredo nunca exibem o valor salvo.

**2. Modalidade** — template de retirada e template de entrega. A escolha entre
eles continua automática por `RECROMANEIO`; o que se configura é o texto.

**3. Cidades e prazos** — a grade do Escopo C.

**4. Botões** — ligar/desligar, e a definição dos botões por situação. Os tipos
disponíveis mudam conforme o canal escolhido no bloco 1: escolher `oficialapi`
desabilita `cta_call` e `cta_copy` na interface.

> **Regra de "template por cidade":** o enunciado original era "se o endereço não
> for de Loanda, usar template alternativo". Os dados dizem que isso não se
> sustenta como binário — ver Escopo C, [PERGUNTA 3].

---

## Escopo C — Cadastro de cidades e prazos

### C.1 O problema é diferente do imaginado

O pedido pressupunha nomes de cidade em texto livre nas receitas, exigindo
matching aproximado e cadastro de variações de escrita.

**[FATO] Não é o caso.** `ROMANEIO.CODIGOCID` é chave estrangeira inteira para
`CIDADES`, **100% preenchida** em 6.052 entregas de 12 meses. O casamento é por
inteiro, exato, sem ambiguidade. **Não é necessário matching textual nem cadastro
de variações.**

### C.2 Distribuição real das entregas (12 meses)

| Cidade | UF | Entregas | % |
|---|---|---|---|
| Querência do Norte | PR | 1.777 | 29,4% |
| **Loanda** | **PR** | **1.438** | **23,8%** |
| Santa Cruz do Monte Castelo | PR | 744 | 12,3% |
| Porto Rico | PR | 609 | 10,1% |
| São Pedro do Paraná | PR | 606 | 10,0% |
| Santa Isabel do Ivaí | PR | 451 | 7,5% |
| Santa Mônica | PR | 107 | 1,8% |
| Porto São José | PR | 60 | 1,0% |
| Nova Londrina | PR | 39 | 0,6% |
| Santa Esmeralda | PR | 34 | 0,6% |
| *(cauda longa)* | | ~187 | 3,1% |

**Loanda não é a cidade principal — é a segunda, com 24%.** A regra "se não for
Loanda, use o template alternativo" cairia no caminho alternativo em **76% das
entregas**. O caso "alternativo" é, na verdade, o caso comum.

### C.3 Registros com cidade implausível

**[FATO]** Aparecem na cauda longa:

| Cidade registrada | UF | Entregas | Provável intenção |
|---|---|---|---|
| Querência | **MT** | 22 | Querência do Norte / PR |
| Monte Castelo | **SP** | 14 | Santa Cruz do Monte Castelo / PR |
| Santa Isabel | **SP** | 10 | Santa Isabel do Ivaí / PR |
| Monte Castelo | **SC** | 6 | Santa Cruz do Monte Castelo / PR |

São ~52 entregas/ano para cidades a centenas de quilômetros. Como `CIDADES` é a
tabela nacional com 5.651 linhas e nomes parecidos, o operador seleciona a linha
errada. **Não é erro de digitação — é seleção errada numa lista longa.**

Consequência para o desenho: prazo de entrega vinculado a cidade errada produz
promessa errada ao cliente. O cadastro deve **listar apenas cidades explicitamente
ativadas** e cair no fallback para todas as outras, em vez de tentar adivinhar.

### C.4 Cadastro proposto

Coleção própria, referenciando `CODIGOCID` do ERP:

| Campo | Descrição |
|---|---|
| `codigoCid` | inteiro do ERP — **a chave de casamento** |
| `nome` | rótulo para exibição na tela |
| `uf` | conferência visual, evita ativar a cidade homônima errada |
| `prazoEntrega` | valor dinâmico injetado no template |
| `templateId` | opcional; ausente = herda o padrão de entrega |
| `ativo` | boolean |

**Não há campo de variações de escrita** — o casamento é por inteiro.

### C.5 Estratégia de casamento e fallback

```
ROMANEIO.CODIGOCID
   → existe cidade ativa com esse codigoCid?
        sim → usa prazo e template dela
        não → template padrão de entrega, SEM promessa de prazo
```

O fallback **nunca inventa prazo**. Se a cidade não está cadastrada, a mensagem
sai sem a frase de prazo — não com um prazo genérico. A tela deve mostrar quais
cidades apareceram em entregas recentes e ainda não estão cadastradas, para o
buraco ser visível em vez de silencioso.

O prazo entra no template como variável (`{prazoEntrega}`), nunca como texto fixo.

---

## Modelo de dados proposto

Três coleções novas no Mongo. Nada no Firebird é alterado — o ERP é lido, nunca
escrito.

```
canal_config          (documento único)
  canal, token, clientId, clientSecret, numeroRemetente,
  ativo, botoesAtivos, atualizadoEm

cidades_entrega       (um por cidade atendida)
  codigoCid (único), nome, uf, prazoEntrega, templateId, ativo

templates             (um por situação — vem do spec anterior)
  situacao: 'retirada' | 'entrega'
  titulo, corpo, botoes[], versao, atualizadoEm
```

Variáveis de template consolidadas: `{saudacao}`, `{nome}`, `{codigo}`,
`{qtdFormulas}`, `{endereco}`, `{cidade}`, `{prazoEntrega}`.

---

## Decisões tomadas

### D1 — O ViaCEP sai; `CODIGOCID` é a fonte única de cidade

**Decidido em 2026-08-18.**

O ViaCEP fornecia **apenas** dois campos, `cidade` e `estado`
(`controllers/recipeController.js:32-33`) — exatamente o `NOMECID` e o `UFCID`
que o JOIN com `CIDADES` entrega. Medição nas mesmas 6.052 entregas de 12 meses:

| Fonte | Preenchimento |
|---|---|
| `ROMANEIO.CEP` (necessário ao ViaCEP) | 100% |
| `ROMANEIO.CODIGOCID` (necessário ao JOIN) | 100% |

Nenhuma perda de cobertura. Troca-se uma chamada HTTP externa por receita de
entrega — que hoje falha em silêncio, só com `console.warn` — por um JOIN local.

**Razão decisiva:** o prazo de entrega será cadastrado por `CODIGOCID`. Se a
mensagem exibisse a cidade vinda do ViaCEP e o prazo viesse do cadastro por
`CODIGOCID`, seria possível prometer o prazo de uma cidade exibindo o nome de
outra. Fonte única elimina a classe inteira de inconsistência.

**Consequência aceita:** nas ~52 entregas/ano com cidade implausível (seção C.3),
o `CODIGOCID` errado prevalece — o ViaCEP teria acertado a partir do CEP. São
0,9% das entregas, e o erro passa a ser *consistente* (cidade e prazo erram
juntos) em vez de misto.

**Melhoria opcional, não incluída no escopo:** comparar `CEP` com `CODIGOCID` em
segundo plano e sinalizar divergência na tela ("CEP indica Querência do
Norte/PR, cadastro diz Querência/MT"), pegando essas 52 sem torná-las fonte.

---

## Perguntas em aberto

**1. Como chega a resposta do botão?** Bloqueia todo o Escopo A. A API não
documenta webhook, callback nem evento, e `GET /tickets` não tem filtro. Existe
mecanismo não documentado? O webhook atual (`/api/webhooks/<uuid>`) recebe esses
eventos? Sem isso, botão vira só enfeite visual sem retorno.

**2. Qual canal a farmácia usa — WhatsMeow, Baileys ou Oficial API?** Muda o que
é possível: Oficial API não suporta `cta_call` nem `cta_copy`.

**3. A regra por cidade continua sendo "Loanda x resto"?** Com Loanda em 24% e
Querência do Norte em 29%, o binário parece invertido. Faz mais sentido cada
cidade cadastrada ter seu prazo, e o fallback ser para não-cadastradas.

**4. O prazo é em dias corridos ou úteis? Varia por dia da semana?** Sábado e
segunda costumam ter prazos diferentes em rota de entrega.

**5. O que o webhook atual faz do lado do MultiAtend?** Só encaminha texto, ou
dispara um fluxo? Isso define se botões substituem ou convivem com ele.

**6. Onde e como guardar o token da conexão?** Hoje não há criptografia em
repouso e o sistema não tem conceito de usuário — quem passa pelo filtro de IP
edita tudo. Uma tela que expõe credencial de envio é mais sensível que as
demais. (O bypass do filtro de IP segue aberto e está registrado no spec
anterior.)

**7. Quem pode alterar prazo de entrega?** É promessa contratual ao cliente.

---

## Plano de fases sugerido

| Fase | Conteúdo | Depende de |
|---|---|---|
| **1** | Passar a ler `ROMANEIO.CODIGOCID` + `CIDADES` em vez do ViaCEP | **nada — decidido em D1** |
| **2** | Cadastro de cidades e prazos + variável `{prazoEntrega}` | Fase 1, [P3] [P4] |
| **3** | Config de conexão (endpoint + persistência + teste) | [P2] [P6] |
| **4** | **Prova de conceito de botões em número de teste** — plano A.5 | Fase 3, **[P1]** |
| **5** | Botões em produção, atrás de flag, com rollback para texto | Fase 4 |
| **6** | Tela de configurações consolidando tudo | front novo (spec anterior) |

A **Fase 1 está desbloqueada** — não depende de nenhuma pergunta em aberto e
pode começar assim que houver decisão de prioridade. A Fase 2 depende só de
definições de negócio ([P3], [P4]), não de nada do fornecedor. A Fase 4 **não
deve começar** antes da [PERGUNTA 1] estar respondida.

---

## Restrições respeitadas

- Nenhum código de produção escrito.
- Nenhum comportamento inventado — o não verificável virou [PERGUNTA].
- Fluxo de webhook atual intocado.
