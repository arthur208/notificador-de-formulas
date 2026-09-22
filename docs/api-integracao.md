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
  "variantes": ["44988239501", "4488239501"],
  "encontrados": 1,
  "clientes": [
    {
      "codigoPessoa": 4559,
      "nome": "Cristina Farias",
      "primeiroNome": "Cristina",
      "cpfMascarado": "***.218.019-**",
      "cidade": "Santa Cruz do Monte Castelo/PR",
      "atualizadoEm": "2026-09-22T19:24:08",
      "completo": false,
      "faltando": ["bairro", "cep", "email"]
    }
  ]
}
```

| Campo | Para quê |
|---|---|
| `codigoPessoa` | É o que vai na URL do `PUT` |
| `nome` | Nome completo, para desempatar entre pessoas do mesmo número |
| `primeiroNome` | Para tratar o cliente na conversa |
| `cpfMascarado` | O cliente reconhece o próprio CPF pelo miolo; `null` se não tiver |
| `cidade` | Cidade e UF do endereço de entrega |
| `atualizadoEm` | Última alteração do cadastro no ERP; `null` se nunca mudou |
| `completo` | `true` quando não falta nada |
| `faltando` | Os campos vazios, em ordem fixa |

### A API não devolve o cadastro cru

CPF inteiro, telefone, logradouro, número, e-mail e data de nascimento **não
saem por aqui**. A integração recebe o suficiente para reconhecer a pessoa e
saber o que pedir a ela — não uma cópia do cadastro para espalhar por toda
ferramenta que encostar na API.

Quem precisa do dado completo tem: ele está no ERP, na tela do balcão, com
gente identificada por trás.

### `atualizadoEm` diz quando o cadastro mudou pela última vez

Vem de `DATAALTERACAO` e `HORAALTERACAO` no ERP, que estão preenchidos em
**100% dos clientes**. Qualquer alteração passa por lá — mexer no endereço
dispara um gatilho que atualiza a pessoa. As gravações desta API também
movem esse horário; foi medido.

Serve para decidir se vale reconfirmar o dado com o cliente. Cadastro parado
há cinco anos merece um "seu endereço ainda é esse?"; alterado semana passada,
não.

O fuso é o do servidor do ERP, sem indicação de zona. Não trate como UTC.

### `faltando` é a lista do que perguntar

Campos conferidos, nesta ordem: `nome`, `cpf`, `nascimento`, `telefone`,
`logradouro`, `numero`, `bairro`, `cep`, `cidade`, `email`.

A ordem é fixa entre chamadas — quem monta a conversa a partir dessa lista
pode contar com ela.

O caminho natural é: consultar, ver o que falta, pedir ao cliente, e mandar
no `PUT`. O `faltando` da resposta do `PUT` já vem atualizado, então dá para
saber se ainda sobrou campo sem perguntar de novo.

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

Exemplo real — mãe e filha, mesma casa, mesmo celular:

```json
{ "encontrados": 2,
  "clientes": [
    { "codigoPessoa": 6397,  "nome": "Antonia de Oliveira Gomes",
      "primeiroNome": "Antonia", "cpfMascarado": null,
      "cidade": "Querencia do Norte/PR", "completo": false,
      "faltando": ["cpf", "bairro", "cep", "email"] },
    { "codigoPessoa": 37706, "nome": "Wilma Aparecida Oliveira Gomes",
      "primeiroNome": "Wilma", "cpfMascarado": null,
      "cidade": "Querencia do Norte/PR", "completo": false,
      "faltando": ["cpf", "bairro", "cep", "email"] }
  ] }
```

É por isso que `nome` vem completo no resumo: é o que permite perguntar
"é para Antonia ou para Wilma?" e usar o `codigoPessoa` certo no `PUT`.

---

## PUT /cliente/:codigoPessoa

Atualiza o cadastro no ERP. O `codigoPessoa` vem do `GET /cliente`.

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"endereco":{"logradouro":"Avenida São João","numero":"456","bairro":"Centro","cep":"87900123"}}' \
  "http://SERVIDOR:3008/api/integracao/cliente/4559"
```

Envie **só os campos que quer mudar**. O que não vier fica como está.

### Campo vazio é ignorado, não é erro

Plataforma de agente costuma mandar o template inteiro, com os campos não
preenchidos como `""`, `null`, `"null"` ou até com a variável não substituída
(`"{{cpf}}"`). Tudo isso é descartado antes da validação — um slot em branco
não derruba mais a atualização.

```json
{ "nome": "", "cpf": "{{cpf}}", "email": "null",
  "endereco": { "logradouro": "", "bairro": "Centro", "cep": "undefined" } }
```

Vira, na prática:

```json
{ "endereco": { "bairro": "Centro" } }
```

Objeto que fica sem nenhuma chave sai junto. Se **nada** sobrar, a resposta é
`400` com `{ "erro": "Nenhum campo para atualizar." }` e o ERP não é chamado.

O que sobra vem trimado: `"  Maria  "` grava `Maria`.

### Para APAGAR um campo, use `"__NULL__"`

Como `null` passou a significar "não preenchi", apagar exige um marcador
explícito:

```json
{ "email": "__NULL__",
  "endereco": { "complemento": "__NULL__" },
  "telefones": [{ "tipo": "recado", "numero": "__NULL__" }] }
```

Um telefone com `"numero": ""` é slot não preenchido e é descartado — não vira
pedido de apagar. Só `"__NULL__"` apaga.

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
{
  "atualizado": true,
  "cliente": {
    "codigoPessoa": 4559,
    "nome": "Cristina Farias",
    "primeiroNome": "Cristina",
    "cpfMascarado": "***.218.019-**",
    "cidade": "Santa Cruz do Monte Castelo/PR",
    "completo": false,
    "faltando": ["email"]
  }
}
```

Mesmo resumo da consulta, e pelo mesmo motivo: se o `PUT` devolvesse o
cadastro inteiro, bastaria gravar qualquer coisa para ler o que o `GET`
esconde.

O `faltando` já reflete a gravação — no exemplo acima, bairro e CEP saíram da
lista porque acabaram de ser preenchidos.

**O que ficou gravado pode diferir do que você enviou.** O ERP tem 76 gatilhos
nessas tabelas: sanitizam o nome, trocam logradouro e bairro vazios por `"."`
e CEP inválido por `"00000000"`. Se o valor exato importar, consulte de novo.

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
