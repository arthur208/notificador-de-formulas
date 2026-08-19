# Parte 2 — Dados: Cidade e Lista do Dia

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`) para acompanhamento.

**Goal:** Entregar o endpoint `GET /api/conferidas` que sustenta a tela
principal, e trocar o ViaCEP pela cidade que já existe no ERP.

**Architecture:** A lógica pura (lotes, validação de data, formatação) vive em
`utils/`, testada sem banco. As consultas ficam em `services/firebirdService.js`
em **duas queries** — nunca uma com `IN (subquery)`, que medimos em 6.455 ms
contra 77 ms. O controller separa prontas de aguardando e cruza com o Mongo numa
única consulta, não uma por receita.

**Tech Stack:** Node.js v24.14.0, Express 5.1.0, `node:test`, node-firebird
1.1.9, MongoDB 6.20.0.

**Spec:** `docs/superpowers/specs/2026-08-18-notificador-evolucao-design.md`
(Projeto A) e `docs/superpowers/specs/2026-08-18-canal-whatsmeow-spec.md`
(decisão D1, seções 0.5 e 3.5)

## Global Constraints

- **Nenhuma dependência nova.**
- **O Firebird é lido, nunca escrito.**
- **Proibido `IN (SELECT ...)`** nas consultas de `RECFORMULAS`. Medido: 6.455 ms
  contra 77 ms em duas queries. O `IN` recebe **lista literal de inteiros**.
- **`DATA <= CURRENT_DATE` em toda consulta a `STATUSRECEITA`** — existem 156
  eventos com ano 2120 que ordenam no topo de qualquer `ORDER BY DATA DESC`.
- Status "conferido" é `CADSTATUS.CODIGOCST = 12`.
- Lotes de no máximo 1000 no `IN` (limite do Firebird é 1500; pico diário é 89).
- Mensagens ao usuário em português, voz ativa.
- Commits em português, prefixo convencional.

## Dados de referência medidos em produção (2026-08-18)

| Fato | Valor |
|---|---|
| Receitas conferidas por dia | 20 a 90 |
| Receitas com 2+ fórmulas | 23% |
| `ROMANEIO.CODIGOCID` preenchido | 100% de 6.052 entregas |
| `ROMANEIO.CEP` preenchido | 100% |
| Eventos CONFERIDO com ano 2120 | 156 de 144.859 |

---

### Task 1: Funções puras de apoio

**Files:**
- Create: `utils/lotes.js`
- Create: `utils/datas.js`
- Create: `utils/endereco.js`
- Create: `test/lotes.test.js`
- Create: `test/datas.test.js`
- Create: `test/endereco.test.js`

**Interfaces:**
- Produces: `emLotes(itens, tamanho) → Array<Array>`
- Produces: `listaInteirosSegura(valores) → string` — lança se algum valor não for inteiro
- Produces: `validarDataISO(valor) → string | null`
- Produces: `hojeISO(agora?) → string`
- Produces: `formatarHora(valor) → string | null`
- Produces: `montarEndereco({endereco, numero, bairro, cidade, estado}) → string | null`
- Consumes: nada.

- [ ] **Passo 1: Escrever os testes de `utils/lotes.js`**

Criar `test/lotes.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { emLotes, listaInteirosSegura } = require('../utils/lotes');

test('divide em lotes do tamanho pedido', () => {
    assert.deepStrictEqual(emLotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('lista menor que o lote volta como um lote único', () => {
    assert.deepStrictEqual(emLotes([1, 2], 1000), [[1, 2]]);
});

test('lista vazia volta sem lotes', () => {
    assert.deepStrictEqual(emLotes([], 10), []);
});

test('tamanho inválido é recusado', () => {
    assert.throws(() => emLotes([1], 0), /tamanho do lote/);
});

test('monta lista literal de inteiros', () => {
    assert.strictEqual(listaInteirosSegura([441433, 441518]), '441433,441518');
});

test('aceita inteiro em string, porque o Firebird devolve assim', () => {
    assert.strictEqual(listaInteirosSegura(['441433']), '441433');
});

test('recusa valor que não é inteiro — barreira contra injeção', () => {
    assert.throws(() => listaInteirosSegura(['1; DROP TABLE RECEITAS']), /não inteiro/);
    assert.throws(() => listaInteirosSegura([1.5]), /não inteiro/);
    assert.throws(() => listaInteirosSegura([null]), /não inteiro/);
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../utils/lotes'`

- [ ] **Passo 3: Implementar `utils/lotes.js`**

```js
'use strict';

function emLotes(itens, tamanho) {
    if (!Number.isInteger(tamanho) || tamanho < 1) {
        throw new Error('tamanho do lote deve ser inteiro maior que zero');
    }
    const lotes = [];
    for (let i = 0; i < itens.length; i += tamanho) {
        lotes.push(itens.slice(i, i + tamanho));
    }
    return lotes;
}

// Monta a lista para cláusulas IN. Toda entrada precisa ser inteiro:
// é o que permite interpolar sem risco, e o IN literal é o que mantém
// a consulta em 48ms em vez de 6.455ms.
function listaInteirosSegura(valores) {
    return valores
        .map((valor) => {
            const numero = Number(valor);
            if (!Number.isInteger(numero)) {
                throw new Error(`valor não inteiro na lista: ${JSON.stringify(valor)}`);
            }
            return numero;
        })
        .join(',');
}

module.exports = { emLotes, listaInteirosSegura };
```

- [ ] **Passo 4: Escrever os testes de `utils/datas.js`**

Criar `test/datas.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { validarDataISO, hojeISO, formatarHora } = require('../utils/datas');

test('aceita data no formato AAAA-MM-DD', () => {
    assert.strictEqual(validarDataISO('2026-08-18'), '2026-08-18');
});

test('recusa formato diferente', () => {
    assert.strictEqual(validarDataISO('18/08/2026'), null);
    assert.strictEqual(validarDataISO('2026-8-18'), null);
    assert.strictEqual(validarDataISO(''), null);
    assert.strictEqual(validarDataISO(undefined), null);
});

test('recusa data que não existe no calendário', () => {
    assert.strictEqual(validarDataISO('2026-02-30'), null);
    assert.strictEqual(validarDataISO('2026-13-01'), null);
});

test('recusa tentativa de injeção no parâmetro', () => {
    assert.strictEqual(validarDataISO("2026-08-18' OR '1'='1"), null);
});

test('hojeISO usa a data local, não UTC', () => {
    // 1º de janeiro às 21h no Brasil ainda é dia 1 aqui, mas já é dia 2 em UTC.
    const virada = new Date(2026, 0, 1, 21, 30, 0);
    assert.strictEqual(hojeISO(virada), '2026-01-01');
});

test('formatarHora devolve HH:MM', () => {
    const hora = new Date(1970, 0, 1, 8, 30, 0);
    assert.strictEqual(formatarHora(hora), '08:30');
});

test('formatarHora devolve null para valor ausente ou inválido', () => {
    assert.strictEqual(formatarHora(null), null);
    assert.strictEqual(formatarHora(undefined), null);
    assert.strictEqual(formatarHora(new Date('nada')), null);
});
```

- [ ] **Passo 5: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../utils/datas'`

- [ ] **Passo 6: Implementar `utils/datas.js`**

```js
'use strict';

const FORMATO_ISO = /^\d{4}-\d{2}-\d{2}$/;

function doisDigitos(n) {
    return String(n).padStart(2, '0');
}

// Devolve a própria string quando é uma data real no formato AAAA-MM-DD,
// e null em qualquer outro caso. O null é o sinal para o controller
// responder 400 — nunca repassar entrada crua para a consulta.
function validarDataISO(valor) {
    if (typeof valor !== 'string' || !FORMATO_ISO.test(valor)) return null;
    const [ano, mes, dia] = valor.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    const confere =
        data.getUTCFullYear() === ano &&
        data.getUTCMonth() === mes - 1 &&
        data.getUTCDate() === dia;
    return confere ? valor : null;
}

function hojeISO(agora = new Date()) {
    return [
        agora.getFullYear(),
        doisDigitos(agora.getMonth() + 1),
        doisDigitos(agora.getDate()),
    ].join('-');
}

// A coluna HOTA de STATUSRECEITA é TIME; o driver devolve um Date
// posicionado na época com a hora local correta.
function formatarHora(valor) {
    if (!valor) return null;
    const data = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(data.getTime())) return null;
    return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
}

module.exports = { validarDataISO, hojeISO, formatarHora };
```

- [ ] **Passo 7: Escrever os testes de `utils/endereco.js`**

Corrige o defeito em que campos nulos produzem literalmente `", - "` na
mensagem enviada ao cliente (`controllers/recipeController.js:43`).

Criar `test/endereco.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { montarEndereco } = require('../utils/endereco');

test('monta o endereço completo', () => {
    const texto = montarEndereco({
        endereco: 'Rua das Palmeiras', numero: '123', bairro: 'Centro',
        cidade: 'Loanda', estado: 'PR',
    });
    assert.strictEqual(texto, 'Rua das Palmeiras, 123 - Centro - Loanda/PR');
});

test('omite partes ausentes sem deixar pontuação solta', () => {
    const texto = montarEndereco({ endereco: 'Rua das Palmeiras', bairro: 'Centro' });
    assert.strictEqual(texto, 'Rua das Palmeiras - Centro');
});

test('devolve null quando não há nada — nunca a string ", - "', () => {
    assert.strictEqual(montarEndereco({}), null);
    assert.strictEqual(montarEndereco({ endereco: null, numero: null, bairro: null }), null);
    assert.strictEqual(montarEndereco(null), null);
});

test('cidade sem UF não deixa barra sobrando', () => {
    const texto = montarEndereco({ endereco: 'Rua A', numero: '1', cidade: 'Loanda' });
    assert.strictEqual(texto, 'Rua A, 1 - Loanda');
});
```

- [ ] **Passo 8: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../utils/endereco'`

- [ ] **Passo 9: Implementar `utils/endereco.js`**

```js
'use strict';

// Junta as partes existentes e devolve null quando não sobra nada.
// Nunca produz pontuação órfã: o defeito anterior enviava ", - " ao cliente
// quando os campos vinham nulos.
function montarEndereco(dados) {
    if (!dados) return null;

    const rua = [dados.endereco, dados.numero].filter(Boolean).join(', ');
    const local = [dados.cidade, dados.estado].filter(Boolean).join('/');
    const texto = [rua, dados.bairro, local].filter(Boolean).join(' - ');

    return texto === '' ? null : texto;
}

module.exports = { montarEndereco };
```

- [ ] **Passo 10: Rodar tudo e confirmar**

Rodar: `npm test`
Esperado: 34 testes passando (16 da Parte 1 + 18 desta tarefa)

- [ ] **Passo 11: Commit**

```bash
git add utils/lotes.js utils/datas.js utils/endereco.js test/lotes.test.js test/datas.test.js test/endereco.test.js
git commit -m "feat: funções puras de lotes, datas e montagem de endereço"
```

---

### Task 2: Cidade pelo ERP, sem ViaCEP

Decisão **D1**: `ROMANEIO.CODIGOCID` é 100% preenchido em 6.052 entregas de 12
meses; o ViaCEP fornecia apenas cidade e UF e falhava em silêncio.

**Files:**
- Modify: `services/firebirdService.js` (função `getDeliveryData`, linhas 53-81)
- Modify: `controllers/recipeController.js` (remove o bloco ViaCEP, linhas 1-52)

**Interfaces:**
- Consumes: `montarEndereco` da Task 1.
- Produces: `getDeliveryData(codigoReceita) → { isDelivery, deliveryAddress, codigor }` onde `deliveryAddress` agora inclui `cidade`, `estado` e `codigoCid` vindos do ERP.

- [ ] **Passo 1: Trocar a consulta de endereço**

Em `services/firebirdService.js`, substituir a função `getDeliveryData` inteira por:

```js
// Checa se é entrega e busca o endereço.
// A cidade vem de CIDADES via ROMANEIO.CODIGOCID (decisão D1) — o ViaCEP
// saiu de cena: fornecia só cidade/UF e falhava em silêncio.
async function getDeliveryData(codigoReceita) {
    const sqlCheck = `SELECT T1.CODIGOR FROM RECROMANEIO T1 WHERE T1.CODIGOREC = ?`;
    const entregaResult = await queryFb(sqlCheck, [codigoReceita]);
    const codigor = (entregaResult && entregaResult.length > 0)
        ? decodeFBString(entregaResult[0].CODIGOR)
        : null;

    if (!codigor) {
        return { isDelivery: false, deliveryAddress: null, codigor: null };
    }

    const sqlEndereco = `
        SELECT RO.ENDERECO, RO.NUMERO, RO.BAIRRO, RO.CEP, RO.CODIGOCID,
               C.NOMECID, C.UFCID
        FROM ROMANEIO RO
        LEFT JOIN CIDADES C ON C.CODIGOCID = RO.CODIGOCID
        WHERE RO.CODIGOR = ?
    `;
    const enderecoResult = await queryFb(sqlEndereco, [codigor]);

    let deliveryAddress = null;
    if (enderecoResult && enderecoResult.length > 0) {
        const linha = enderecoResult[0];
        deliveryAddress = {
            endereco: decodeFBString(linha.ENDERECO),
            numero: decodeFBString(linha.NUMERO),
            bairro: decodeFBString(linha.BAIRRO),
            cep: decodeFBString(linha.CEP),
            codigoCid: linha.CODIGOCID === null ? null : Number(linha.CODIGOCID),
            cidade: toTitleCase(decodeFBString(linha.NOMECID)),
            estado: decodeFBString(linha.UFCID),
        };
    }

    return { isDelivery: true, deliveryAddress, codigor };
}
```

- [ ] **Passo 2: Remover o ViaCEP do controller**

Em `controllers/recipeController.js`, substituir todo o conteúdo por:

```js
const firebirdService = require('../services/firebirdService');
const mongoService = require('../services/mongoService');
const { getSaudacao } = require('../utils/helpers');
const { montarEndereco } = require('../utils/endereco');

async function getCliente(req, res) {
    const codigoReceita = req.params.codigo;

    try {
        const logSucessoExistente = await mongoService.checkExistingLog(codigoReceita);

        const clienteData = await firebirdService.getRecipeData(codigoReceita);
        if (!clienteData) {
            return res.status(404).json({ erro: 'Cliente não encontrado.' });
        }

        const { isDelivery, deliveryAddress } = await firebirdService.getDeliveryData(codigoReceita);

        const saudacao = getSaudacao();
        let mensagemSugerida;

        if (isDelivery) {
            const enderecoTexto = montarEndereco(deliveryAddress) || 'Endereço não encontrado.';
            mensagemSugerida =
                `${saudacao}, ${clienteData.nome}! 👋\n\n` +
                `A Farmácia Bioessência informa: Sua receita (Nº ${codigoReceita}) está pronta ` +
                `e será enviada para entrega. 🚚✅\n\n` +
                `Endereço de destino:\n${enderecoTexto}\n\nFicamos à disposição!`;
        } else {
            mensagemSugerida =
                `${saudacao}, ${clienteData.nome}! 👋\n\n` +
                `A Farmácia Bioessência informa: Sua receita (Nº ${codigoReceita}) está pronta ` +
                `para retirada em nossa loja. 💊✅\n\n` +
                `Ficamos à disposição e aguardamos sua visita!`;
        }

        res.json({
            dadosCliente: clienteData,
            mensagemSugerida,
            jaEnviado: logSucessoExistente !== null,
            isDelivery,
            deliveryAddress,
        });
    } catch (erro) {
        console.error('Erro na rota /cliente:', erro);
        res.status(500).json({ erro: 'Erro interno do servidor ao processar a receita.' });
    }
}

module.exports = { getCliente };
```

- [ ] **Passo 3: Confirmar que o axios saiu deste caminho**

Rodar: `grep -n "axios\|viacep" controllers/recipeController.js`
Esperado: **nenhuma linha**. O `axios` continua em `messageController.js`, que
não é tocado nesta Parte.

- [ ] **Passo 4: Verificar contra o banco**

```bash
npm start
```

Noutro terminal, usar uma receita de entrega conhecida:

```bash
curl -s "http://127.0.0.1:3008/api/cliente/441433" | node -e "
let e='';process.stdin.on('data',d=>e+=d).on('end',()=>{
  const j=JSON.parse(e);
  console.log('isDelivery:', j.isDelivery);
  console.log('cidade   :', j.deliveryAddress && j.deliveryAddress.cidade);
  console.log('UF       :', j.deliveryAddress && j.deliveryAddress.estado);
  console.log('codigoCid:', j.deliveryAddress && j.deliveryAddress.codigoCid);
});"
```

Esperado: `cidade` e `UF` preenchidos, `codigoCid` numérico. Se a receita for de
retirada, `isDelivery: false` e `deliveryAddress: null`.

- [ ] **Passo 5: Commit**

```bash
git add services/firebirdService.js controllers/recipeController.js
git commit -m "feat: obter cidade de CIDADES via CODIGOCID e remover o ViaCEP"
```

---

### Task 3: Consulta das receitas conferidas

**Files:**
- Modify: `services/firebirdService.js` (adiciona `getReceitasConferidas`)
- Modify: `services/mongoService.js` (adiciona `buscarAvisados`)

**Interfaces:**
- Consumes: `emLotes`, `listaInteirosSegura` (Task 1); `formatarHora` (Task 1).
- Produces: `getReceitasConferidas(dataISO) → Promise<Array<{codigoRec, nome, total, conferidas, completa, hora}>>`
- Produces: `buscarAvisados(codigos) → Promise<Set<number>>`

- [ ] **Passo 1: Acrescentar `getReceitasConferidas`**

Em `services/firebirdService.js`, no topo, junto dos outros `require`:

```js
const { emLotes, listaInteirosSegura } = require('../utils/lotes');
const { formatarHora } = require('../utils/datas');

const CODIGO_STATUS_CONFERIDO = 12;
const TAMANHO_LOTE_IN = 1000;
```

E acrescentar a função antes do `module.exports`:

```js
function mapearConferida(linha) {
    const total = Number(linha.TOTAL);
    const conferidas = Number(linha.CONFERIDAS);
    return {
        codigoRec: Number(linha.CODIGOREC),
        nome: toTitleCase(decodeFBString(linha.NOME)),
        total,
        conferidas,
        completa: total > 0 && conferidas === total,
        hora: formatarHora(linha.ULTIMA_HORA),
    };
}

// Receitas com ao menos uma fórmula conferida na data.
//
// DUAS consultas de propósito. A versão de uma só, com IN (SELECT ...),
// mediu 6.455ms contra 77ms — o otimizador do Firebird não empurra o filtro
// de data para dentro do IN e varre as 510k linhas de RECFORMULAS.
// Não unifique isto.
async function getReceitasConferidas(dataISO) {
    const sqlIds = `
        SELECT DISTINCT F.CODIGOREC
        FROM STATUSRECEITA S
        JOIN RECFORMULAS F ON F.CODIGORF = S.CODIGORF
        WHERE S.CODIGOCST = ?
          AND S.DATA = ?
          AND S.DATA <= CURRENT_DATE
    `;
    const linhasIds = await queryFb(sqlIds, [CODIGO_STATUS_CONFERIDO, dataISO]);
    const ids = linhasIds.map((linha) => Number(linha.CODIGOREC));
    if (ids.length === 0) return [];

    const conferidas = [];
    for (const lote of emLotes(ids, TAMANHO_LOTE_IN)) {
        const listaIn = listaInteirosSegura(lote);
        const sqlContagens = `
            SELECT F.CODIGOREC,
                   COUNT(*) AS TOTAL,
                   SUM(CASE WHEN EXISTS (
                         SELECT 1 FROM STATUSRECEITA S
                         WHERE S.CODIGORF = F.CODIGORF
                           AND S.CODIGOCST = ${CODIGO_STATUS_CONFERIDO}
                           AND S.DATA <= CURRENT_DATE
                       ) THEN 1 ELSE 0 END) AS CONFERIDAS,
                   MAX(P.NOME) AS NOME,
                   MAX((SELECT MAX(S3.HOTA) FROM STATUSRECEITA S3
                        WHERE S3.CODIGORF = F.CODIGORF
                          AND S3.CODIGOCST = ${CODIGO_STATUS_CONFERIDO}
                          AND S3.DATA = ?)) AS ULTIMA_HORA
            FROM RECFORMULAS F
            LEFT JOIN RECCLIENTE RC ON RC.CODIGOREC = F.CODIGOREC
            LEFT JOIN PESSOAS    P  ON P.CODIGOPES  = RC.CODIGOPES
            WHERE F.CODIGOREC IN (${listaIn})
            GROUP BY F.CODIGOREC
        `;
        const parciais = await queryFb(sqlContagens, [dataISO]);
        conferidas.push(...parciais.map(mapearConferida));
    }
    return conferidas;
}
```

Acrescentar ao `module.exports`:

```js
module.exports = {
    getRecipeData,
    getDeliveryData,
    getReceitasConferidas,
};
```

- [ ] **Passo 2: Acrescentar `buscarAvisados` no Mongo**

Em `services/mongoService.js`, antes do `module.exports`:

```js
/**
 * Quais das receitas informadas já tiveram envio bem-sucedido.
 * Uma única consulta — chamar checkExistingLog por receita faria
 * até 90 idas ao banco para montar uma tela.
 * @param {number[]} codigos
 * @returns {Promise<Set<number>>}
 */
async function buscarAvisados(codigos) {
    if (!Array.isArray(codigos) || codigos.length === 0) return new Set();
    try {
        const collection = getLogsCollection();
        const docs = await collection
            .find(
                { codigoReceita: { $in: codigos.map(Number) }, status: 'sucesso' },
                { projection: { codigoReceita: 1 } }
            )
            .toArray();
        return new Set(docs.map((doc) => Number(doc.codigoReceita)));
    } catch (mongoErr) {
        console.error('Erro ao buscar receitas já avisadas:', mongoErr);
        return new Set();
    }
}
```

E incluir `buscarAvisados` no `module.exports`.

- [ ] **Passo 3: Verificar contra o banco**

```bash
node -e "
require('dotenv').config();
const s = require('./services/firebirdService');
(async () => {
  const t0 = Date.now();
  const r = await s.getReceitasConferidas('2026-08-18');
  console.log('linhas:', r.length, '| ms:', Date.now() - t0);
  console.log('completas :', r.filter(x => x.completa).length);
  console.log('parciais  :', r.filter(x => !x.completa).length);
  console.log('amostra   :', JSON.stringify(r[0]));
  process.exit(0);
})();"
```

Esperado: tempo **abaixo de 500 ms**, e a amostra com as chaves `codigoRec`,
`nome`, `total`, `conferidas`, `completa`, `hora`.

- [ ] **Passo 4: Commit**

```bash
git add services/firebirdService.js services/mongoService.js
git commit -m "feat: consultar receitas conferidas em duas queries"
```

---

### Task 4: Endpoint `GET /api/conferidas`

**Files:**
- Create: `controllers/conferidasController.js`
- Create: `test/conferidasController.test.js`
- Modify: `routes/api.js`

**Interfaces:**
- Consumes: `getReceitasConferidas` (Task 3), `buscarAvisados` (Task 3), `validarDataISO` e `hojeISO` (Task 1).
- Produces: `GET /api/conferidas?data=AAAA-MM-DD` → `{ data, prontas[], aguardando[] }`

- [ ] **Passo 1: Escrever os testes**

O controller recebe os serviços por parâmetro para ser testável sem banco.

Criar `test/conferidasController.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { montarResposta } = require('../controllers/conferidasController');

const receitas = [
    { codigoRec: 441433, nome: 'Gracileia Rosa Tomiello', total: 4, conferidas: 4, completa: true, hora: '08:30' },
    { codigoRec: 441618, nome: 'Odair Fernandes Azevedo', total: 2, conferidas: 1, completa: false, hora: '08:34' },
    { codigoRec: 441547, nome: 'Lucineia de Fatima Pesta', total: 2, conferidas: 2, completa: true, hora: '09:47' },
];

test('separa prontas de aguardando', () => {
    const resposta = montarResposta('2026-08-18', receitas, new Set());
    assert.strictEqual(resposta.prontas.length, 2);
    assert.strictEqual(resposta.aguardando.length, 1);
    assert.strictEqual(resposta.aguardando[0].codigoRec, 441618);
});

test('marca as já avisadas sem removê-las da lista', () => {
    const resposta = montarResposta('2026-08-18', receitas, new Set([441433]));
    const avisada = resposta.prontas.find((r) => r.codigoRec === 441433);
    assert.strictEqual(avisada.jaAvisado, true);
    const outra = resposta.prontas.find((r) => r.codigoRec === 441547);
    assert.strictEqual(outra.jaAvisado, false);
});

test('ordena da conferência mais recente para a mais antiga', () => {
    const resposta = montarResposta('2026-08-18', receitas, new Set());
    assert.deepStrictEqual(resposta.prontas.map((r) => r.hora), ['09:47', '08:30']);
});

test('devolve a data consultada', () => {
    const resposta = montarResposta('2026-08-15', [], new Set());
    assert.strictEqual(resposta.data, '2026-08-15');
    assert.deepStrictEqual(resposta.prontas, []);
    assert.deepStrictEqual(resposta.aguardando, []);
});

test('receita sem hora não quebra a ordenação', () => {
    const semHora = [{ codigoRec: 1, nome: 'X', total: 1, conferidas: 1, completa: true, hora: null }];
    const resposta = montarResposta('2026-08-18', semHora, new Set());
    assert.strictEqual(resposta.prontas.length, 1);
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../controllers/conferidasController'`

- [ ] **Passo 3: Implementar o controller**

Criar `controllers/conferidasController.js`:

```js
const firebirdService = require('../services/firebirdService');
const mongoService = require('../services/mongoService');
const { validarDataISO, hojeISO } = require('../utils/datas');

// Mais recente primeiro. Receita sem hora vai para o fim.
function porHoraDesc(a, b) {
    if (!a.hora && !b.hora) return 0;
    if (!a.hora) return 1;
    if (!b.hora) return -1;
    return b.hora.localeCompare(a.hora);
}

// Separada do handler para ser testável sem banco.
function montarResposta(data, receitas, avisados) {
    const comAviso = receitas.map((receita) => ({
        ...receita,
        jaAvisado: avisados.has(receita.codigoRec),
    }));
    return {
        data,
        prontas: comAviso.filter((r) => r.completa).sort(porHoraDesc),
        aguardando: comAviso.filter((r) => !r.completa).sort(porHoraDesc),
    };
}

async function getConferidas(req, res) {
    const solicitada = req.query.data || hojeISO();
    const data = validarDataISO(solicitada);

    if (!data) {
        return res.status(400).json({ erro: 'Data inválida. Use o formato AAAA-MM-DD.' });
    }

    try {
        const receitas = await firebirdService.getReceitasConferidas(data);
        const avisados = await mongoService.buscarAvisados(receitas.map((r) => r.codigoRec));
        res.json(montarResposta(data, receitas, avisados));
    } catch (erro) {
        console.error('Erro na rota /conferidas:', erro);
        res.status(500).json({ erro: 'Não foi possível carregar as receitas conferidas.' });
    }
}

module.exports = { getConferidas, montarResposta };
```

- [ ] **Passo 4: Rodar e confirmar que passam**

Rodar: `npm test`
Esperado: 39 testes passando (34 anteriores + 5 desta tarefa)

- [ ] **Passo 5: Registrar a rota**

Em `routes/api.js`, acrescentar o import e a rota:

```js
const { getConferidas } = require('../controllers/conferidasController');
```

```js
router.get('/conferidas', getConferidas);
```

A rota fica **antes** de `router.get('/cliente/:codigo', getCliente)` para
manter as rotas fixas acima das paramétricas.

- [ ] **Passo 6: Verificar o endpoint no ar**

```bash
npm start
```

```bash
echo "--- hoje ---"
curl -s "http://127.0.0.1:3008/api/conferidas" | head -c 400
echo; echo "--- data explícita ---"
curl -s "http://127.0.0.1:3008/api/conferidas?data=2026-08-17" \
  | node -e "let e='';process.stdin.on('data',d=>e+=d).on('end',()=>{const j=JSON.parse(e);
      console.log('data:',j.data,'| prontas:',j.prontas.length,'| aguardando:',j.aguardando.length);});"
echo "--- data inválida ---"
curl -s -o /dev/null -w "status=%{http_code}\n" "http://127.0.0.1:3008/api/conferidas?data=2026-02-30"
```

Esperado: as duas primeiras respondem `200` com as listas; a terceira responde
`400`.

- [ ] **Passo 7: Teste de regressão de performance**

Criar `test/conferidas.perf.test.js`. Ele toca o banco, então é ignorado quando
`FB_HOST` não está configurado:

```js
const { test, skip } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();

const temBanco = Boolean(process.env.FB_HOST && process.env.FB_DB_PATH);

test('getReceitasConferidas responde abaixo de 500ms', { skip: !temBanco }, async () => {
    const { getReceitasConferidas } = require('../services/firebirdService');
    const { hojeISO } = require('../utils/datas');

    const inicio = Date.now();
    await getReceitasConferidas(hojeISO());
    const decorrido = Date.now() - inicio;

    assert.ok(
        decorrido < 500,
        `A consulta levou ${decorrido}ms. Acima de 500ms indica que as duas ` +
        `queries voltaram a ser uma com IN (SELECT ...) — que mediu 6455ms.`
    );
});
```

Rodar: `npm test`
Esperado: o teste passa com o tempo bem abaixo do limite (medimos 77 ms).

- [ ] **Passo 8: Commit**

```bash
git add controllers/conferidasController.js routes/api.js test/conferidasController.test.js test/conferidas.perf.test.js
git commit -m "feat: endpoint GET /api/conferidas com prontas e aguardando"
```

---

## Critério de conclusão da Parte 2

- [ ] `npm test` passa 39 testes mais o de performance
- [ ] `GET /api/conferidas` responde com `prontas` e `aguardando` separadas
- [ ] `?data=2026-02-30` responde `400`; sem parâmetro assume hoje
- [ ] A consulta roda **abaixo de 500 ms**
- [ ] `/api/cliente/:codigo` devolve `cidade`, `estado` e `codigoCid` do ERP
- [ ] Nenhuma referência a `axios` ou ViaCEP em `recipeController.js`
- [ ] Endereço com campos nulos devolve `null`, nunca `", - "`
- [ ] Nada gravado no Firebird; nada gravado no Mongo de produção
