# Parte 1 — Fundação e Correções Imediatas

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`) para acompanhamento.

**Goal:** Isolar o desenvolvimento de produção com um Mongo local configurado por
ambiente, criar a infraestrutura de testes e corrigir três defeitos que já afetam
o uso diário.

**Architecture:** Toda configuração passa a ser resolvida por uma função pura em
`config/env.js`, que falha alto no arranque quando falta variável e imprime em
qual banco está conectado. As correções são pontuais e independentes entre si:
timeout no Firebird, 403 em JSON nas rotas de API, e foco automático no campo do
código para o leitor de código de barras do balcão.

**Tech Stack:** Node.js v24.14.0, Express 5.1.0, `node:test` (nativo, sem
dependência nova), MongoDB 6.20.0, node-firebird 1.1.9.

**Spec:** `docs/superpowers/specs/2026-08-18-notificador-evolucao-design.md` e
`docs/superpowers/specs/2026-08-18-canal-whatsmeow-spec.md`

## Global Constraints

- **Nenhuma dependência nova.** `node:test` é nativo do Node 24.
- **Nada em produção é alterado.** O Mongo de desenvolvimento é um banco separado,
  já criado pelo cliente, apontado por `MONGO_DB_NAME`. Mesmo servidor Mongo,
  banco diferente — o código não distingue, e por isso o arranque imprime o destino.
- **O Firebird é lido, nunca escrito.**
- Nomes de coleção **nunca** fixos no código — sempre por ambiente com padrão.
- Mensagens ao usuário em português, voz ativa, sem pedir desculpas.
- Segredos nunca aparecem em log — a URI do Mongo é impressa sem credencial.
- Commits em português, prefixo convencional (`feat:`, `fix:`, `test:`, `chore:`).

---

### Task 1: Configuração por ambiente e infraestrutura de testes

**Files:**
- Create: `config/env.js`
- Create: `test/env.test.js`
- Modify: `config/db.js` (linhas 1-45, remove a constante fixa da linha 24)
- Modify: `index.js` (linhas 1-47, imprime o destino no arranque)
- Modify: `package.json` (script `test`)
- Modify: `.env.example`

**Interfaces:**
- Produces: `resolverConfig(env?) → { firebird: {host, port, database, user, password, timeoutMs}, mongo: {uri, dbName, colecaoLogs}, porta }` — lança `Error` listando todas as variáveis ausentes.
- Produces: `descreverDestino(config) → string` — texto multilinha sem credenciais.
- Consumes: nada.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `test/env.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { resolverConfig, descreverDestino } = require('../config/env');

const ambienteMinimo = {
    FB_HOST: '192.168.254.103',
    FB_DB_PATH: 'D:\\dados\\BANCO',
    FB_USER: 'SYSDBA',
    FB_PASS: 'segredo',
    MONGO_URI: 'mongodb://localhost:27017',
    MONGO_DB_NAME: 'notificador_dev',
};

test('usa a coleção padrão quando MONGO_COLLECTION_LOGS não é definida', () => {
    const config = resolverConfig(ambienteMinimo);
    assert.strictEqual(config.mongo.colecaoLogs, 'notificador_logs');
});

test('permite trocar a coleção por variável de ambiente', () => {
    const config = resolverConfig({ ...ambienteMinimo, MONGO_COLLECTION_LOGS: 'logs_dev' });
    assert.strictEqual(config.mongo.colecaoLogs, 'logs_dev');
});

test('porta do Firebird cai em 3050 quando ausente', () => {
    const config = resolverConfig(ambienteMinimo);
    assert.strictEqual(config.firebird.port, 3050);
});

test('timeout do Firebird cai em 15000ms quando ausente', () => {
    const config = resolverConfig(ambienteMinimo);
    assert.strictEqual(config.firebird.timeoutMs, 15000);
});

test('lista TODAS as variáveis ausentes numa única mensagem', () => {
    assert.throws(
        () => resolverConfig({ FB_HOST: '192.168.254.103' }),
        (erro) => {
            assert.match(erro.message, /FB_DB_PATH/);
            assert.match(erro.message, /MONGO_URI/);
            assert.match(erro.message, /MONGO_DB_NAME/);
            return true;
        }
    );
});

test('trata string vazia como ausente', () => {
    assert.throws(
        () => resolverConfig({ ...ambienteMinimo, MONGO_DB_NAME: '   ' }),
        /MONGO_DB_NAME/
    );
});

test('descreverDestino mostra o banco e omite a senha da URI', () => {
    const config = resolverConfig({
        ...ambienteMinimo,
        MONGO_URI: 'mongodb://usuario:senhaSecreta@192.168.0.249:27017',
    });
    const texto = descreverDestino(config);
    assert.ok(!texto.includes('senhaSecreta'), 'a senha não pode aparecer no log');
    assert.ok(texto.includes('notificador_dev'), 'o nome do banco precisa aparecer');
});
```

- [ ] **Passo 2: Registrar o runner e rodar para ver falhar**

Em `package.json`, trocar o script `test`:

```json
"scripts": {
    "start": "node index.js",
    "test": "node --test"
}
```

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../config/env'`

- [ ] **Passo 3: Escrever a implementação mínima**

Criar `config/env.js`:

```js
'use strict';

const COLECAO_LOGS_PADRAO = 'notificador_logs';
const TIMEOUT_FIREBIRD_PADRAO = 15000;

function resolverConfig(env = process.env) {
    const ausentes = [];
    const obrigatorio = (chave) => {
        const valor = env[chave];
        if (!valor || String(valor).trim() === '') {
            ausentes.push(chave);
            return undefined;
        }
        return String(valor).trim();
    };

    const config = {
        firebird: {
            host: obrigatorio('FB_HOST'),
            port: Number(env.FB_PORT) || 3050,
            database: obrigatorio('FB_DB_PATH'),
            user: obrigatorio('FB_USER'),
            password: obrigatorio('FB_PASS'),
            timeoutMs: Number(env.FB_TIMEOUT_MS) || TIMEOUT_FIREBIRD_PADRAO,
        },
        mongo: {
            uri: obrigatorio('MONGO_URI'),
            dbName: obrigatorio('MONGO_DB_NAME'),
            colecaoLogs: (env.MONGO_COLLECTION_LOGS || COLECAO_LOGS_PADRAO).trim(),
        },
        porta: Number(env.PORT) || 3008,
    };

    if (ausentes.length > 0) {
        throw new Error(
            `Variáveis de ambiente obrigatórias ausentes: ${ausentes.join(', ')}. ` +
            `Copie .env.example para .env e preencha.`
        );
    }

    return config;
}

function descreverDestino(config) {
    const uriSemCredencial = config.mongo.uri.replace(/\/\/[^@/]*@/, '//');
    return [
        `Firebird : ${config.firebird.host}:${config.firebird.port}`,
        `Mongo    : ${uriSemCredencial}`,
        `Banco    : ${config.mongo.dbName}`,
        `Coleção  : ${config.mongo.colecaoLogs}`,
    ].join('\n  ');
}

module.exports = { resolverConfig, descreverDestino };
```

- [ ] **Passo 4: Rodar os testes e confirmar que passam**

Rodar: `npm test`
Esperado: 7 testes passando (`# pass 7`)

- [ ] **Passo 5: Ligar `config/db.js` ao novo resolvedor**

Substituir o conteúdo de `config/db.js` por:

```js
require('dotenv').config();

const Firebird = require('node-firebird');
const { MongoClient } = require('mongodb');
const { resolverConfig } = require('./env');

const config = resolverConfig();

const fbOptions = {
    host: config.firebird.host,
    port: config.firebird.port,
    database: config.firebird.database,
    user: config.firebird.user,
    password: config.firebird.password,
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
};
const fbPool = Firebird.pool(10, fbOptions);

const mongoClient = new MongoClient(config.mongo.uri);
let dbInstance;

async function connectToMongo() {
    if (dbInstance) return dbInstance;
    await mongoClient.connect();
    dbInstance = mongoClient.db(config.mongo.dbName);
    console.log('Conectado ao MongoDB com sucesso!');
    return dbInstance;
}

module.exports = {
    config,
    fbPool,
    connectToMongo,
    getLogsCollection: () => {
        if (!dbInstance) throw new Error('MongoDB não inicializado.');
        return dbInstance.collection(config.mongo.colecaoLogs);
    },
};
```

- [ ] **Passo 6: Imprimir o destino no arranque**

Em `index.js`, trocar a linha 9, que hoje é:

```js
const { connectToMongo } = require('./config/db');
```

por estas duas:

```js
const { connectToMongo, config } = require('./config/db');
const { descreverDestino } = require('./config/env');
```

E dentro de `startServer()`, antes do `await connectToMongo()`:

```js
console.log('--- Destino das conexões ---');
console.log('  ' + descreverDestino(config));
console.log('----------------------------');
```

Trocar também `const PORT = process.env.PORT || 80;` por:

```js
const PORT = config.porta;
```

- [ ] **Passo 7: Atualizar o `.env.example`**

```env
# Copie para .env e preencha. O .env NUNCA vai para o git.

# --- Firebird (ERP SmartPharmacy) — somente leitura ---
FB_HOST=
FB_PORT=3050
FB_DB_PATH=
FB_USER=
FB_PASS=
FB_TIMEOUT_MS=15000

# --- MongoDB ---
# Em desenvolvimento, aponte MONGO_DB_NAME para um banco LOCAL e vazio.
# Em produção, para o banco real. O código não muda.
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=notificador_dev
MONGO_COLLECTION_LOGS=notificador_logs

# --- Servidor ---
PORT=3008

# --- Webhook de envio (LEGADO) ---
# Ainda usado por controllers/messageController.js.
# Sai de cena na Parte 4, quando o envio migra para a API v1 do whatsmeow.
API_URL=
```

- [ ] **Passo 8: Verificar o arranque contra o Mongo local**

Apontar `MONGO_DB_NAME` para o banco de **desenvolvimento** (já criado pelo cliente) e rodar:

```bash
npm start
```

Esperado no console, **antes** de qualquer conexão:

```
--- Destino das conexões ---
  Firebird : 192.168.254.103:3050
  Mongo    : mongodb://localhost:27017
  Banco    : notificador_dev
  Coleção  : notificador_logs
----------------------------
Conectado ao MongoDB com sucesso!
Servidor rodando em http://localhost:3008
```

Confirmar que o nome do banco é o de **desenvolvimento**, não o de produção.

- [ ] **Passo 9: Verificar que falta de variável derruba o arranque**

```bash
MONGO_DB_NAME= npm start
```

Esperado: processo encerra com
`Variáveis de ambiente obrigatórias ausentes: MONGO_DB_NAME. Copie .env.example para .env e preencha.`

- [ ] **Passo 10: Commit**

```bash
git add config/env.js config/db.js index.js package.json .env.example test/env.test.js
git commit -m "feat: resolver configuração por ambiente e imprimir destino no arranque"
```

---

### Task 2: Timeout nas consultas ao Firebird

Hoje a busca por receita pendura **21 segundos** em silêncio quando o Firebird
não responde — comportamento reproduzido em 2026-08-18.

**Files:**
- Create: `utils/comTimeout.js`
- Create: `test/comTimeout.test.js`
- Modify: `services/firebirdService.js` (linhas 6-23, função `queryFb`)

**Interfaces:**
- Produces: `comTimeout(promessa, ms, mensagem) → Promise` — rejeita com `Error(mensagem)` se `promessa` não resolver em `ms`.
- Consumes: `config.firebird.timeoutMs` da Task 1.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `test/comTimeout.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { comTimeout } = require('../utils/comTimeout');

const depois = (ms, valor) => new Promise((r) => setTimeout(() => r(valor), ms));

test('resolve normalmente quando a promessa responde a tempo', async () => {
    const resultado = await comTimeout(depois(10, 'pronto'), 200, 'estourou');
    assert.strictEqual(resultado, 'pronto');
});

test('rejeita com a mensagem dada quando estoura o tempo', async () => {
    await assert.rejects(
        () => comTimeout(depois(200, 'tarde'), 20, 'Firebird não respondeu em 20ms'),
        /Firebird não respondeu em 20ms/
    );
});

test('propaga o erro original quando a promessa falha antes do limite', async () => {
    const falha = Promise.reject(new Error('erro de sintaxe SQL'));
    await assert.rejects(() => comTimeout(falha, 200, 'estourou'), /erro de sintaxe SQL/);
});

test('não deixa o processo pendurado após resolver', async () => {
    await comTimeout(depois(5, 'ok'), 5000, 'estourou');
    assert.ok(true, 'se o timer não fosse limpo, o processo não encerraria');
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../utils/comTimeout'`

- [ ] **Passo 3: Implementar**

Criar `utils/comTimeout.js`:

```js
'use strict';

function comTimeout(promessa, ms, mensagem) {
    return new Promise((resolve, reject) => {
        const relogio = setTimeout(() => reject(new Error(mensagem)), ms);
        promessa.then(
            (valor) => { clearTimeout(relogio); resolve(valor); },
            (erro) => { clearTimeout(relogio); reject(erro); }
        );
    });
}

module.exports = { comTimeout };
```

- [ ] **Passo 4: Rodar e confirmar que passam**

Rodar: `npm test`
Esperado: 11 testes passando no total (7 da Task 1 + 4 desta)

- [ ] **Passo 5: Aplicar no `queryFb`**

Em `services/firebirdService.js`, substituir as linhas 1-23 por:

```js
const { fbPool, config } = require('../config/db');
const { decodeFBString, toTitleCase } = require('../utils/helpers');

// Wrapper de query (Promise) específico para o Firebird.
// A guarda `encerrado` existe para liberar a conexão que chega DEPOIS do
// timeout — sem ela, cada consulta estourada vazaria uma conexão do pool.
function queryFb(sql, params, timeoutMs = config.firebird.timeoutMs) {
    return new Promise((resolve, reject) => {
        let encerrado = false;

        const relogio = setTimeout(() => {
            encerrado = true;
            reject(new Error(`Firebird não respondeu em ${timeoutMs}ms.`));
        }, timeoutMs);

        fbPool.get((err, db) => {
            if (encerrado) {
                if (db) db.detach();
                return;
            }
            if (err) {
                clearTimeout(relogio);
                console.error('Erro ao pegar conexão do pool Firebird:', err);
                return reject(new Error('Erro ao conectar ao DB Firebird.'));
            }
            db.query(sql, params, (err, result) => {
                db.detach();
                if (encerrado) return;
                clearTimeout(relogio);
                if (err) {
                    console.error('Erro na query Firebird:', err);
                    return reject(err);
                }
                resolve(result);
            });
        });
    });
}
```

- [ ] **Passo 6: Verificar o timeout de verdade**

Apontar o Firebird para um endereço que não responde e medir:

```bash
FB_HOST=10.255.255.1 FB_TIMEOUT_MS=2000 npm start
```

Noutro terminal:

```bash
time curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3008/api/cliente/441433
```

Esperado: `500` em **~2 segundos**, não 21. E no log do servidor:
`Firebird não respondeu em 2000ms.`

- [ ] **Passo 7: Commit**

```bash
git add utils/comTimeout.js test/comTimeout.test.js services/firebirdService.js
git commit -m "fix: aplicar timeout nas consultas ao Firebird"
```

---

### Task 3: 403 em JSON nas rotas de API

Hoje o bloqueio devolve `text/html`, e `public/app.js:106` chama
`response.json()` nesse corpo — a atendente vê `Unexpected token 'A'` em vez de
"acesso negado".

**Files:**
- Modify: `middleware/ipWhitelist.js` (linhas 23-28)
- Create: `test/ipWhitelist.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: nenhuma nova exportação — o módulo segue exportando a função middleware.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `test/ipWhitelist.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const middleware = require('../middleware/ipWhitelist');

function criarRes() {
    const res = { statusCode: null, corpo: null, tipoDefinido: null };
    res.status = (codigo) => { res.statusCode = codigo; return res; };
    res.json = (objeto) => { res.corpo = objeto; res.ehJson = true; return res; };
    res.type = (t) => { res.tipoDefinido = t; return res; };
    res.send = (texto) => { res.corpo = texto; res.ehJson = false; return res; };
    return res;
}

test('deixa passar IP da lista', () => {
    let chamouNext = false;
    middleware({ ip: '127.0.0.1', path: '/api/logs' }, criarRes(), () => { chamouNext = true; });
    assert.strictEqual(chamouNext, true);
});

test('bloqueia IP público com 403', () => {
    const res = criarRes();
    middleware({ ip: '8.8.8.8', path: '/' }, res, () => {
        assert.fail('não deveria chamar next para IP bloqueado');
    });
    assert.strictEqual(res.statusCode, 403);
});

test('responde JSON quando a rota começa com /api/', () => {
    const res = criarRes();
    middleware({ ip: '8.8.8.8', path: '/api/logs' }, res, () => {});
    assert.strictEqual(res.ehJson, true);
    assert.strictEqual(typeof res.corpo, 'object');
    assert.ok(res.corpo.erro, 'o corpo precisa ter a chave "erro"');
});

test('responde texto puro fora de /api/', () => {
    const res = criarRes();
    middleware({ ip: '8.8.8.8', path: '/index.html' }, res, () => {});
    assert.strictEqual(res.ehJson, false);
    assert.strictEqual(res.tipoDefinido, 'text/plain');
});

test('não estoura quando req.ip vem indefinido', () => {
    const res = criarRes();
    assert.doesNotThrow(() => {
        middleware({ ip: undefined, path: '/api/logs' }, res, () => {
            assert.fail('IP indefinido deve ser negado, não liberado');
        });
    });
    assert.strictEqual(res.statusCode, 403);
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA — o teste de JSON falha porque hoje o middleware sempre usa
`send()`, e o de `req.ip` indefinido falha com `TypeError: Cannot read
properties of undefined (reading 'startsWith')`

- [ ] **Passo 3: Implementar**

Em `middleware/ipWhitelist.js`, substituir as linhas 10-29 por:

```js
const ipWhitelistMiddleware = (req, res, next) => {
    let ipRequisitante = req.ip;

    // Sem IP não há como avaliar a lista: nega (falha fechada).
    if (typeof ipRequisitante !== 'string' || ipRequisitante === '') {
        console.warn('Acesso bloqueado: requisição sem IP identificável.');
        return responderNegado(req, res);
    }

    // Normaliza o IP se for um IPv4-mapped IPv6 (ex: ::ffff:192.168.0.10)
    if (ipRequisitante.toLowerCase().startsWith('::ffff:')) {
        ipRequisitante = ipRequisitante.slice('::ffff:'.length);
    }

    const isAllowed = whitelist.includes(ipRequisitante) ||
                      ipRequisitante.startsWith('192.168.') ||
                      ipRequisitante.startsWith('10.');

    if (isAllowed) return next();

    console.warn(`Acesso bloqueado para o IP: ${req.ip} (normalizado: ${ipRequisitante})`);
    return responderNegado(req, res);
};

function responderNegado(req, res) {
    if (typeof req.path === 'string' && req.path.startsWith('/api/')) {
        return res.status(403).json({ erro: 'Acesso negado.' });
    }
    return res.status(403).type('text/plain').send('Acesso negado.');
}
```

- [ ] **Passo 4: Rodar e confirmar que passam**

Rodar: `npm test`
Esperado: 16 testes passando no total

- [ ] **Passo 5: Verificar com o servidor no ar**

```bash
npm start
```

Noutro terminal:

```bash
curl -s -i -H "X-Forwarded-For: 8.8.8.8" http://127.0.0.1:3008/api/logs | head -3
curl -s -i -H "X-Forwarded-For: 8.8.8.8" http://127.0.0.1:3008/ | head -3
```

Esperado: o primeiro devolve `Content-Type: application/json` com
`{"erro":"Acesso negado."}`; o segundo devolve `Content-Type: text/plain`.

- [ ] **Passo 6: Commit**

```bash
git add middleware/ipWhitelist.js test/ipWhitelist.test.js
git commit -m "fix: responder 403 em JSON nas rotas de API"
```

---

### Task 4: Foco automático no campo do código

O leitor de código de barras do balcão comporta-se como teclado e já dispara a
busca com `Enter` (`public/app.js:64-69`). Falta apenas o campo receber foco
sozinho, para a atendente não precisar tocar nele antes de bipar.

**Files:**
- Modify: `public/index.html` (linha 29)

**Interfaces:**
- Consumes: nada. Produces: nada.

- [ ] **Passo 1: Adicionar o atributo**

Em `public/index.html`, linha 29, trocar:

```html
<input placeholder="Digite o código da receita" id="codigo_receita" type="number" class="validate">
```

por:

```html
<input placeholder="Digite ou bipe o código da receita" id="codigo_receita" type="number" class="validate" autofocus>
```

- [ ] **Passo 2: Verificar com o leitor real**

Abrir o sistema no navegador do balcão **sem clicar em nada** e bipar um rótulo.

Esperado: o número aparece no campo e a busca dispara sozinha.

Se **não** funcionar, anotar a string exata que o leitor digitou (bipar dentro de
um bloco de notas) e comparar com o `CODIGOREC` esperado. A causa provável é
formatação — EAN-13 acrescenta zeros à esquerda e dígito verificador, o que faria
`441433` chegar como `0004414337`. Nesse caso, **parar e reportar**: o tratamento
da string vira uma tarefa própria, não um remendo aqui.

- [ ] **Passo 3: Commit**

```bash
git add public/index.html
git commit -m "feat: focar o campo do código para o leitor do balcão"
```

---

## Critério de conclusão da Parte 1

- [ ] `npm test` roda e passa 16 testes
- [ ] O arranque imprime o banco de destino, e ele é o de **desenvolvimento**
- [ ] Falta de variável obrigatória derruba o arranque com mensagem clara
- [ ] Consulta ao Firebird estoura em ~2 s com `FB_TIMEOUT_MS=2000`, não em 21 s
- [ ] `curl` bloqueado em `/api/` devolve JSON; fora de `/api/` devolve texto
- [ ] Bipar um rótulo com a página recém-aberta dispara a busca
- [ ] Nenhum documento gravado no Mongo de produção durante toda a Parte
