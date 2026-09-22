# API de integração — cadastro de clientes

Consulta e atualização do cadastro de clientes do SmartPharmacy, para consumo
por máquina: chatbot, n8n, automações.

Base: `http://SERVIDOR:3008/api/integracao`

Atualizado em 22/09/2026.

---

## Autenticação

Toda rota exige um token no cabeçalho:

```
Authorization: Bearer <token>
```

O token é o valor de `API_TOKEN` do `.env` do servidor. Se `API_TOKEN` não
estiver definido, vale o valor de `APP_CRYPTO_KEY`.

Não existe login, sessão nem expiração. O mesmo token serve para todas as
rotas desta seção — e **só** para elas: a sessão da tela não abre estas rotas,
e este token não abre as da tela.

Depois de 5 tentativas com token errado, o mesmo IP fica bloqueado por 15
minutos e recebe `429`.

---

## GET /cliente

Busca o cadastro por telefone **ou** por CPF. Um dos dois, nunca os dois.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://SERVIDOR:3008/api/integracao/cliente?telefone=44991135801"

curl -H "Authorization: Bearer $TOKEN" \
  "http://SERVIDOR:3008/api/integracao/cliente?cpf=03721801911"
```

### O telefone resolve o 9º dígito sozinho

Procurar por `44991135801` encontra o cadastro gravado como `4491135801`, e o
contrário também. A busca cobre os quatro campos de telefone do ERP —
celular, residencial, comercial e recado — e aceita qualquer pontuação:

| Você envia | Encontra |
|---|---|
| `44991135801` | com e sem o 9 |
| `4491135801` | com e sem o 9 |
| `5544991135801` | o DDI é descartado |
| `(44) 99113-5801` | pontuação ignorada |

O DDD é obrigatório: sem ele o mesmo número existe em vários estados.

### Resposta

```json
{
  "consultadoPor": "telefone",
  "variantes": ["44991135801", "4491135801"],
  "encontrados": 1,
  "clientes": [
    {
      "codigoPessoa": 4559,
      "nome": "Cristina Farias",
      "cpf": "03721801911",
      "nascimento": "1980-10-20",
      "sexo": "F",
      "ativo": true,
      "cadastradoEm": "2006-04-28",
      "email": null,
      "telefones": [
        { "tipo": "celular",     "numero": "44988239501" },
        { "tipo": "residencial", "numero": "44991193243" }
      ],
      "enderecos": [
        {
          "logradouro": "Rua Curitiba",
          "numero": "103",
          "complemento": null,
          "bairro": null,
          "cep": null,
          "cidade": "Santa Cruz do Monte Castelo",
          "uf": "PR",
          "codigoCidade": 203,
          "entrega": true
        }
      ]
    }
  ]
}
```

`variantes` mostra o que foi de fato procurado. Quando não encontrar, é por
aí que se descobre o motivo, em vez de adivinhar.

Campo sem valor vem como `null`, nunca como `"."` ou `"00000000"` — o ERP
guarda enchimento nesses campos e a API limpa antes de devolver.

### `encontrados` pode ser maior que 1

**1.405 telefones do cadastro são compartilhados por mais de uma pessoa**, num
total de 3.036 cadastros — famílias usando o mesmo número. Trate a resposta
como lista, sempre.

Quando vier mais de um, não escolha sozinho: pergunte ao cliente de quem é a
fórmula, ou use o CPF, que é único.

Exemplo real do cadastro — um único número devolve três pessoas:

```json
{ "encontrados": 3,
  "clientes": [
    { "codigoPessoa": 30507, "nome": "Cicera Francisca Dias de Souza", "...": "..." },
    { "codigoPessoa": 37117, "nome": "Nathalia Lopes de Souza",        "...": "..." },
    { "codigoPessoa": 46837, "nome": "Rita Pedra da Costa",            "...": "..." }
  ] }
```

---

## PUT /cliente/:codigoPessoa

Atualiza o cadastro no ERP. O `codigoPessoa` vem do `GET /cliente`.

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"endereco":{"logradouro":"Avenida São João","numero":"456","bairro":"Centro","cep":"87900123"}}' \
  "http://SERVIDOR:3008/api/integracao/cliente/4559"
```

Envie **só os campos que quer mudar**. O que não vier fica como está.

### Campos aceitos

| Campo | Tipo | Limite | Observação |
|---|---|---|---|
| `nome` | texto | 40 | O ERP sanitiza e recusa se ficar vazio |
| `cpf` | texto | 11 dígitos | Dígitos verificadores são conferidos |
| `nascimento` | texto | `AAAA-MM-DD` | Não pode ser futuro nem anterior a 1900 |
| `email` | texto | 50 | `null` remove o e-mail |
| `telefones` | lista | — | `[{ "tipo": "celular", "numero": "44991135801" }]` |
| `endereco.logradouro` | texto | 40 | |
| `endereco.numero` | texto | 5 | |
| `endereco.complemento` | texto | 40 | |
| `endereco.bairro` | texto | 20 | |
| `endereco.cep` | texto | 8 dígitos | Pontuação é aceita e removida |
| `endereco.codigoCidade` | inteiro | — | Da resposta do `GET`, não invente |

Tipos de telefone: `celular`, `residencial`, `comercial`, `recado`. Um de cada
por requisição. `"numero": null` apaga aquele telefone.

Os limites são os das colunas do ERP. Passar disso é recusado antes de
qualquer gravação, em vez de o banco truncar em silêncio.

### Validação: tudo antes de qualquer coisa

Todos os campos são conferidos primeiro. **Se um só estiver errado, nada é
gravado** — e a resposta traz a lista completa de problemas, para corrigir
tudo de uma vez:

```json
{
  "erro": "O cadastro não passou na validação. Nada foi alterado.",
  "erros": [
    { "campo": "nome", "erro": "Não pode ficar vazio." },
    { "campo": "cpf", "erro": "Dígitos verificadores não conferem." },
    { "campo": "endereco.cep", "erro": "Precisa ter 8 dígitos." }
  ]
}
```

Campo com nome errado é recusado em vez de ignorado — senão a integração
acharia que gravou.

### Resposta de sucesso

```json
{ "atualizado": true, "cliente": { ...mesmo formato do GET... } }
```

**O `cliente` é relido do banco depois de gravar, e pode diferir do que você
enviou.** O ERP tem 76 gatilhos nessas tabelas: eles sanitizam o nome, trocam
logradouro e bairro vazios por `"."` e CEP inválido por `"00000000"`. Confira
a resposta se o valor exato importar.

Acento é preservado. A gravação converte para a codificação do ERP, então
`Jardim Ipê` aparece corretamente também no SmartPharmacy, no balcão.

A gravação é uma transação única. Falhando qualquer parte, nada muda — não
existe cadastro pela metade, com telefone novo e endereço velho.

### Só cliente

Apenas cadastros do tipo cliente podem ser alterados. Médico, fornecedor e
funcionário devolvem `409`.

---

## Códigos de resposta

| Código | Quando | O que fazer |
|---|---|---|
| `200` | Deu certo | — |
| `400` | Falta parâmetro, ou telefone/CPF malformado | Corrigir a chamada |
| `401` | Token ausente ou errado | Conferir o `Authorization` |
| `404` | `codigoPessoa` não existe | Buscar de novo pelo `GET` |
| `409` | O cadastro não é de cliente | Não alterar por aqui |
| `422` | Validação falhou | Ler `erros[]` e corrigir — nada foi gravado |
| `429` | Tentativas demais com token errado | Esperar 15 minutos |
| `500` | Token não configurado no servidor | Avisar quem administra |
| `502` | ERP indisponível | Repetir; nada foi gravado |

---

## Coisas que vão acontecer

**O ERP recusa conexão de vez em quando.** Falha conhecida, sem causa
identificada, que se recupera sozinha — aparece como `502`. Repita a chamada
antes de tratar como erro de verdade; duas ou três tentativas costumam
resolver.

**Nem todo cliente tem telefone.** 15,8% de quem recebeu fórmula no último ano
não tem nenhum número cadastrado, e não será encontrado por esse caminho.
Nesses casos, o CPF é o único acesso.

**O campo `FONERES` costuma conter celular.** Metade dos números gravados como
"residencial" tem cara de celular. Não filtre por tipo para decidir onde
mandar mensagem.

**Não há registro de quem alterou.** O ERP grava a mudança na auditoria dele,
mas com o usuário do banco — não com o nome da integração. Se precisar saber
quem mudou o quê, isso ainda não existe.
