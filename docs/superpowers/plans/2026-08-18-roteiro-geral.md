# Roteiro Geral — Notificador de Fórmulas

**Data:** 2026-08-18
**Consolida:** as três specs em `docs/superpowers/specs/`

Este documento **não é um plano de execução**. É a ordem em que os planos serão
escritos e executados, e o porquê de cada dependência. Cada Parte vira um plano
próprio em `docs/superpowers/plans/`, escrito quando a anterior terminar.

## Specs de origem

| Spec | Cobre |
|---|---|
| `2026-08-18-notificador-evolucao-design.md` | lista do dia, front novo, PWA, código de barras |
| `2026-08-18-canal-whatsmeow-spec.md` | canal whatsmeow, cidades, convênios, usuários |
| `2026-08-18-canal-envio-botoes-spec.md` | **supersedida** — histórico da investigação da API |

## Princípio de ordenação

1. **Nada visível depende de coisa não testável.** Backend antes da tela que o consome.
2. **Nada construído duas vezes.** Tela só nasce na stack nova.
3. **Autenticação antes de tela que expõe credencial.** A Parte 5 vem antes da 6 de propósito.
4. **Cada Parte entrega software funcionando** e testável isoladamente.

---

## Parte 1 — Fundação e correções imediatas

**Entrega:** ambiente local isolado de produção, infraestrutura de testes, e dois
bugs que doem hoje corrigidos.

- Mongo **local** para desenvolvimento, tudo por variável de ambiente
- Nomes de coleção deixam de ser fixos no código (`config/db.js:24`)
- Log de arranque dizendo **em qual banco está conectado** — proteção contra tocar produção sem querer
- `npm test` sai do stub, passa a usar `node:test`
- **Timeout no Firebird** — hoje a busca pendura 21 s calada
- **403 em JSON para `/api/*`** — hoje devolve `text/html` e o front quebra com `Unexpected token 'A'`
- **`autofocus` no campo do código** — destrava o leitor de código de barras do balcão

**Depende de:** nada.
**Valor imediato:** o leitor do balcão passa a funcionar, e a busca deixa de travar.

---

## Parte 2 — Dados: cidade e lista do dia

**Entrega:** os endpoints que sustentam a tela principal, testáveis por `curl`.

- `ROMANEIO.CODIGOCID` + `CIDADES` no lugar do ViaCEP (decisão **D1**)
- `GET /api/conferidas?data=YYYY-MM-DD` em duas queries
- Teste de regressão de performance que **falha acima de 500 ms**
- `DATA <= CURRENT_DATE` em toda query (os 156 eventos de ano 2120)

**Depende de:** Parte 1 (testes).

---

## Parte 3 — Front novo e tela principal

**Entrega:** a primeira coisa que você vê.

- `web/` com Vite 8.2.1 + Vue 3.5.41 + TypeScript 7.0.2 + PrimeVue 5.0.1
- Build para `public/`; Express serve igual
- **PWA migrado**: `manifest.json`, `sw.js` com `skipWaiting`, ícones 192/512
- Tela **Conferidas hoje** com os segmentos de completude
- Barra de código no rodapé (digitar ou ler)

**Depende de:** Parte 2 (o endpoint), e dos ícones da marca.
**Risco a validar:** aparelho com o PWA antigo instalado precisa receber a versão nova.

---

## Parte 4 — Envio ponta a ponta

**Entrega:** mensagem saindo pela stack nova.

- `canal_config` no Mongo, campos sensíveis **criptografados** (decisão **D6**)
- Migração do webhook para `POST /api/v1/messages/whatsmeow/send` + Bearer + renovação
- Motor de templates com `{{variáveis}}` nomeadas e fallback
- Os quatro bugs de mensagem: saudação na hora errada, endereço `", - "`, ViaCEP silencioso, ausência de `{{qtdFormulas}}`
- Tela **Receita** com os cinco estados

**Depende de:** Parte 3, e de você fornecer `client_id`, `client_secret` e o token.

---

## Parte 5 — Usuários, papéis e auditoria

**Entrega:** identidade no sistema, que hoje não existe.

- Cadastro, login, sessão por cookie `httpOnly`
- Papéis: atendente, gestor, admin
- Auditoria append-only; token nunca gravado em texto

**Depende de:** Parte 1.
**Por que antes da Parte 6:** a tela de configurações expõe a credencial de envio.
Hoje a única proteção é o filtro de IP, que tem bypass provado.

---

## Parte 6 — Configurações e cadastro de cidades

- Tela `/configuracoes`: conexão, templates, cidades
- Editor de template com prévia lado a lado e variáveis clicáveis
- Cadastro de cidades com prazo em **dias úteis** (decisão **D4**)
- Template próprio de Loanda via override por cidade (decisão **D11**)

**Depende de:** Partes 4 e 5.

---

## Parte 7 — Modalidade convênio

- List picker dos 97 convênios de `TABELASIMPLES`
- `nomeExibicao` com preposição; `dias`; variáveis livres
- Sugestão marcada na tela, atendente confirma (decisão **D10**)
- Precedência: convênio sobrepõe cidade e entrega/retirada (decisão **D3**)

**Depende de:** Parte 6, e da curadoria de quais convênios são local de retirada.

---

## Parte 8 — Histórico, botões e câmera

- Histórico novo: busca por nome, agrupamento de tentativas repetidas
- Botões no whatsmeow (máx. 3): `cta_call`, `cta_url`, `cta_copy`, `reply`
- Leitura por câmera: nativa no Android, biblioteca no iPhone

**Depende de:** Partes 3 e 4.

---

## Fora de escopo, registrado

| Item | Situação |
|---|---|
| Bypass do filtro de IP | provado; cliente ciente; mitigado de fato pela Parte 5 |
| `SYSDBA`/senha de desenvolvimento no `.env` | fora de escopo por decisão do cliente |
| `config.json` com `apiToken` órfão versionado | idem |
| `services/postgresService.js` e dependência `pg` mortos | idem |
| `logs_envio` (1.166 docs) | **mantida** para acesso legado (decisão **D9**) |
| Direção visual | decidida na Parte 3, com telas reais |

## Pendência técnica sem dono

**Autenticação intermitente do Firebird.** Durante o levantamento, a conexão
falhou ~6 vezes com erro de credencial e voltou sozinha, com as mesmas
credenciais. Contornado com retry nos scripts de investigação; **causa não
determinada**. Em produção apareceria como falha aleatória na busca do cliente.
Investigar antes de dar qualquer Parte por concluída.
