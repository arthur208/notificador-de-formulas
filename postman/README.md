# Collection do Postman

`notificador-integracao.postman_collection.json` — 17 requisições cobrindo as
rotas de `/api/integracao`.

## Importar

No Postman: **Import** → arraste o arquivo. Ele entra em qualquer workspace,
inclusive o `ApisChatbot`.

## Antes de rodar

Nas variáveis da collection, preencha:

| Variável | Valor |
|---|---|
| `baseUrl` | endereço do servidor, ex. `http://192.168.0.249:3008` |
| `token` | o `API_TOKEN` do `.env` do servidor — ou a `APP_CRYPTO_KEY`, se aquele estiver vazio |

As demais (`telefone`, `cpf`, `codigoPessoa`) já vêm com dados reais do
cadastro e servem para testar sem procurar exemplo.

Rode **"Por telefone (com o 9)"** primeiro: ela guarda o `codigoPessoa` numa
variável, que as requisições de atualização usam.

## O que tem em cada pasta

**1. Consulta** — as quatro formas de telefone que a API resolve (com o 9, sem
o 9, com DDI, com pontuação), busca por CPF, o caso de telefone compartilhado
por duas pessoas e o de telefone não cadastrado.

**2. Atualização** — endereço, telefone e e-mail.

**3. Erros esperados** — os sete códigos que a integração precisa tratar.

Cada requisição tem testes: além do status, conferem que o CPF vem mascarado e
que nenhum dado cru do cadastro vaza na resposta.

## Cuidado

**A pasta 2 grava no ERP de produção.** Os valores de exemplo alteram cadastro
de cliente de verdade. Se rodar a collection inteira, devolva o cadastro ao
estado original depois — ou aponte `baseUrl` para um ambiente de teste.

Rodando a pasta 3 várias vezes seguidas, os dois casos de token inválido
acumulam: cinco erros do mesmo IP disparam o freio e a resposta vira `429` em
vez de `401`.
