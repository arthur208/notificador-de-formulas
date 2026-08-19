# Parte 5 — Usuários, Papéis e Auditoria

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa.

**Goal:** Dar identidade ao sistema, que hoje não tem nenhuma, com login,
três papéis e registro auditável de alterações sensíveis.

**Architecture:** Senha por `scrypt` do `node:crypto` — sem dependência nova e
sem compilação nativa. Sessão é um token aleatório guardado em `sessoes` no
Mongo, entregue em cookie `httpOnly`; o cabeçalho `Cookie` é lido por uma função
pura de cinco linhas, evitando mais um pacote. Autorização é um middleware
parametrizado por papel.

**Tech Stack:** Node.js v24.14.0 (`node:crypto`), Express 5.1.0, MongoDB 6.20.0,
Vue 3.5.41, PrimeVue 4.5.5.

**Spec:** `docs/superpowers/specs/2026-08-18-canal-whatsmeow-spec.md` (Escopo E,
decisão D7)

## Global Constraints

- **Nenhuma dependência nova.** `scrypt` é nativo; `bcrypt` e `argon2` exigem
  node-gyp e quebram com frequência no Windows, que é o ambiente do cliente.
- **Senha nunca em log, nunca em resposta.** Nem o hash.
- **Sem auto-cadastro.** O primeiro usuário nasce por script; os demais são
  criados por um admin.
- Papéis: `atendente`, `gestor`, `admin`. Prazo de entrega é editável por
  **gestor e admin** (decisão D7).
- Auditoria é **append-only**: nunca atualizar nem apagar registro.
- Comparação de senha em **tempo constante** (`timingSafeEqual`).
- Commits em português, prefixo convencional.

## Relação com o filtro de IP

Usuários **não substituem** o filtro de IP — são camadas diferentes (rede e
identidade). Mas com login funcionando, o bypass do `X-Forwarded-For` deixa de
dar acesso total e passa a dar acesso à tela de login. **É a correção mais
efetiva do problema de acesso**, e por isso esta Parte vem antes da tela de
configurações.

---

### Task 1: Senha e modelo de usuário

**Files:**
- Create: `utils/senha.js`
- Create: `test/senha.test.js`
- Create: `services/usuarioService.js`
- Create: `scripts/criar-usuario.js`

**Interfaces:**
- Produces: `gerarHash(senha) → Promise<string>` no formato `scrypt$N$r$p$salt$hash`
- Produces: `conferirSenha(senha, hash) → Promise<boolean>`
- Produces: `criarUsuario({nome, email, senha, papel}) → Promise<object>`
- Produces: `buscarPorEmail(email) → Promise<object|null>`
- Produces: `PAPEIS = ['atendente', 'gestor', 'admin']`

- [ ] **Passo 1: Escrever os testes**

Criar `test/senha.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { gerarHash, conferirSenha } = require('../utils/senha');

test('a senha correta confere', async () => {
    const hash = await gerarHash('senhaDaAtendente123');
    assert.strictEqual(await conferirSenha('senhaDaAtendente123', hash), true);
});

test('a senha errada não confere', async () => {
    const hash = await gerarHash('senhaDaAtendente123');
    assert.strictEqual(await conferirSenha('outraSenha', hash), false);
});

test('o hash não contém a senha em texto', async () => {
    const hash = await gerarHash('senhaDaAtendente123');
    assert.ok(!hash.includes('senhaDaAtendente123'));
});

test('duas gerações da mesma senha produzem hashes diferentes', async () => {
    const [a, b] = await Promise.all([gerarHash('igual'), gerarHash('igual')]);
    assert.notStrictEqual(a, b);
});

test('hash malformado devolve falso, não estoura', async () => {
    assert.strictEqual(await conferirSenha('x', 'lixo'), false);
    assert.strictEqual(await conferirSenha('x', ''), false);
    assert.strictEqual(await conferirSenha('x', null), false);
});

test('senha vazia é recusada na geração', async () => {
    await assert.rejects(() => gerarHash(''), /senha/i);
    await assert.rejects(() => gerarHash('curta'), /8 caracteres/);
});

test('aceita acento e emoji sem corromper', async () => {
    const hash = await gerarHash('sençaÇÃO💊2026');
    assert.strictEqual(await conferirSenha('sençaÇÃO💊2026', hash), true);
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../utils/senha'`

- [ ] **Passo 3: Implementar**

Criar `utils/senha.js`:

```js
'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// Parâmetros conservadores para uso interno. N=16384 leva ~50ms por
// verificação num servidor modesto — suficiente contra força bruta
// offline sem tornar o login lento.
const N = 16384;
const r = 8;
const p = 1;
const TAMANHO_HASH = 64;
const TAMANHO_SALT = 16;
const MINIMO_CARACTERES = 8;

async function gerarHash(senha) {
    if (typeof senha !== 'string' || senha.length === 0) {
        throw new Error('Informe a senha.');
    }
    if (senha.length < MINIMO_CARACTERES) {
        throw new Error('A senha precisa de pelo menos 8 caracteres.');
    }
    const salt = crypto.randomBytes(TAMANHO_SALT);
    const derivado = await scrypt(senha, salt, TAMANHO_HASH, { N, r, p });
    return ['scrypt', N, r, p, salt.toString('base64'), derivado.toString('base64')].join('$');
}

async function conferirSenha(senha, hashGuardado) {
    try {
        const partes = String(hashGuardado || '').split('$');
        if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

        const [, nGuardado, rGuardado, pGuardado, saltB64, hashB64] = partes;
        const salt = Buffer.from(saltB64, 'base64');
        const esperado = Buffer.from(hashB64, 'base64');

        const derivado = await scrypt(String(senha), salt, esperado.length, {
            N: Number(nGuardado), r: Number(rGuardado), p: Number(pGuardado),
        });

        // Tempo constante: comparar com === vazaria informação pelo tempo.
        return crypto.timingSafeEqual(derivado, esperado);
    } catch {
        return false;
    }
}

module.exports = { gerarHash, conferirSenha };
```

- [ ] **Passo 4: Rodar e confirmar**

Rodar: `npm test`
Esperado: 72 testes passando (65 da Parte 4 + 7 desta).

- [ ] **Passo 5: Criar o serviço de usuários**

Criar `services/usuarioService.js`:

```js
const { getDb } = require('../config/db');
const { gerarHash } = require('../utils/senha');

const COLECAO = 'usuarios';
const PAPEIS = ['atendente', 'gestor', 'admin'];

function colecao() {
    return getDb().collection(COLECAO);
}

function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

async function garantirIndices() {
    await colecao().createIndex({ email: 1 }, { unique: true });
}

async function criarUsuario({ nome, email, senha, papel }) {
    if (!PAPEIS.includes(papel)) {
        throw new Error(`Papel inválido: ${papel}. Use ${PAPEIS.join(', ')}.`);
    }
    const documento = {
        nome: String(nome).trim(),
        email: normalizarEmail(email),
        senhaHash: await gerarHash(senha),
        papel,
        ativo: true,
        criadoEm: new Date(),
        ultimoAcesso: null,
    };
    await colecao().insertOne(documento);
    return semSegredo(documento);
}

async function buscarPorEmail(email) {
    return colecao().findOne({ email: normalizarEmail(email), ativo: true });
}

async function listarUsuarios() {
    const docs = await colecao().find({}, { projection: { senhaHash: 0 } }).toArray();
    return docs;
}

async function registrarAcesso(idUsuario) {
    await colecao().updateOne({ _id: idUsuario }, { $set: { ultimoAcesso: new Date() } });
}

// Nunca devolver o hash em resposta HTTP.
function semSegredo(usuario) {
    if (!usuario) return null;
    const { senhaHash, ...resto } = usuario;
    return resto;
}

module.exports = {
    PAPEIS, criarUsuario, buscarPorEmail, listarUsuarios,
    registrarAcesso, garantirIndices, semSegredo,
};
```

- [ ] **Passo 6: Script do primeiro usuário**

Criar `scripts/criar-usuario.js`:

```js
require('dotenv').config();
const readline = require('node:readline/promises');
const { connectToMongo, config } = require('../config/db');
const { criarUsuario, garantirIndices, PAPEIS } = require('../services/usuarioService');

(async () => {
    await connectToMongo();
    await garantirIndices();
    console.log(`Criando usuário na base "${config.mongo.dbName}".\n`);

    const io = readline.createInterface({ input: process.stdin, output: process.stdout });
    const nome = await io.question('Nome: ');
    const email = await io.question('E-mail: ');
    const senha = await io.question('Senha (mínimo 8 caracteres): ');
    const papel = await io.question(`Papel (${PAPEIS.join(' / ')}): `);
    io.close();

    const usuario = await criarUsuario({ nome, email, senha, papel: papel.trim() });
    console.log('\nCriado:', { nome: usuario.nome, email: usuario.email, papel: usuario.papel });
    process.exit(0);
})();
```

Rodar e criar um `admin`.

- [ ] **Passo 7: Commit**

```bash
git add utils/senha.js test/senha.test.js services/usuarioService.js scripts/criar-usuario.js
git commit -m "feat: usuários com senha em scrypt e papéis"
```

---

### Task 2: Sessão e login

**Files:**
- Create: `utils/cookies.js`
- Create: `test/cookies.test.js`
- Create: `services/sessaoService.js`
- Create: `controllers/authController.js`
- Create: `routes/auth.js`
- Modify: `index.js` (registra as rotas de autenticação)

**Interfaces:**
- Produces: `lerCookies(cabecalho) → Record<string,string>`
- Produces: `abrirSessao(usuario) → Promise<string>` (token)
- Produces: `buscarSessao(token) → Promise<{usuario} | null>`
- Produces: `encerrarSessao(token) → Promise<void>`
- Produces: `POST /auth/login`, `POST /auth/logout`, `GET /auth/eu`

- [ ] **Passo 1: Escrever os testes de cookie**

Criar `test/cookies.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { lerCookies } = require('../utils/cookies');

test('lê um cookie', () => {
    assert.deepStrictEqual(lerCookies('sessao=abc123'), { sessao: 'abc123' });
});

test('lê vários cookies com espaço', () => {
    assert.deepStrictEqual(lerCookies('a=1; sessao=abc; b=2'), { a: '1', sessao: 'abc', b: '2' });
});

test('decodifica valor percent-encoded', () => {
    assert.deepStrictEqual(lerCookies('x=a%20b'), { x: 'a b' });
});

test('valor com sinal de igual é preservado', () => {
    assert.deepStrictEqual(lerCookies('t=YWJj=='), { t: 'YWJj==' });
});

test('cabeçalho ausente devolve objeto vazio', () => {
    assert.deepStrictEqual(lerCookies(undefined), {});
    assert.deepStrictEqual(lerCookies(''), {});
});

test('parte malformada é ignorada sem estourar', () => {
    assert.deepStrictEqual(lerCookies('semigual; a=1'), { a: '1' });
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../utils/cookies'`

- [ ] **Passo 3: Implementar a leitura de cookies**

Criar `utils/cookies.js`:

```js
'use strict';

// Cinco linhas em vez de mais uma dependência. O Express 5 não parseia
// cookies sozinho, e cookie-parser não paga o próprio custo aqui.
function lerCookies(cabecalho) {
    const resultado = {};
    if (typeof cabecalho !== 'string' || cabecalho === '') return resultado;

    for (const parte of cabecalho.split(';')) {
        const separador = parte.indexOf('=');
        if (separador < 1) continue;
        const nome = parte.slice(0, separador).trim();
        const valor = parte.slice(separador + 1).trim();
        try {
            resultado[nome] = decodeURIComponent(valor);
        } catch {
            resultado[nome] = valor;
        }
    }
    return resultado;
}

module.exports = { lerCookies };
```

- [ ] **Passo 4: Implementar o serviço de sessão**

Criar `services/sessaoService.js`:

```js
const crypto = require('node:crypto');
const { getDb } = require('../config/db');
const usuarioService = require('./usuarioService');

const COLECAO = 'sessoes';
const DURACAO_MS = 12 * 60 * 60 * 1000; // um turno de trabalho

function colecao() {
    return getDb().collection(COLECAO);
}

// TTL do próprio Mongo remove sessões vencidas sem rotina de limpeza.
async function garantirIndices() {
    await colecao().createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 });
}

async function abrirSessao(usuario) {
    const token = crypto.randomBytes(32).toString('base64url');
    await colecao().insertOne({
        _id: token,
        usuarioId: usuario._id,
        criadaEm: new Date(),
        expiraEm: new Date(Date.now() + DURACAO_MS),
    });
    await usuarioService.registrarAcesso(usuario._id);
    return token;
}

async function buscarSessao(token) {
    if (!token) return null;
    const sessao = await colecao().findOne({ _id: token });
    if (!sessao || sessao.expiraEm < new Date()) return null;

    const usuario = await getDb().collection('usuarios')
        .findOne({ _id: sessao.usuarioId, ativo: true }, { projection: { senhaHash: 0 } });
    return usuario ? { usuario } : null;
}

async function encerrarSessao(token) {
    if (token) await colecao().deleteOne({ _id: token });
}

module.exports = { abrirSessao, buscarSessao, encerrarSessao, garantirIndices, DURACAO_MS };
```

- [ ] **Passo 5: Implementar o controller de autenticação**

Criar `controllers/authController.js`:

```js
const usuarioService = require('../services/usuarioService');
const sessaoService = require('../services/sessaoService');
const { conferirSenha } = require('../utils/senha');
const { lerCookies } = require('../utils/cookies');

const NOME_COOKIE = 'sessao';

function montarCookie(token, maxIdadeMs) {
    const partes = [
        `${NOME_COOKIE}=${token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${Math.floor(maxIdadeMs / 1000)}`,
    ];
    // O sistema roda atrás de HTTPS em produção. Em desenvolvimento sem TLS,
    // marcar Secure impediria o cookie de ser guardado.
    if (process.env.NODE_ENV === 'production') partes.push('Secure');
    return partes.join('; ');
}

async function login(req, res) {
    const { email, senha } = req.body || {};

    const usuario = await usuarioService.buscarPorEmail(email);
    const confere = usuario ? await conferirSenha(senha, usuario.senhaHash) : false;

    // Mesma resposta para e-mail inexistente e senha errada:
    // dizer qual dos dois falhou entrega lista de usuários válidos.
    if (!confere) {
        console.warn(`Login recusado para "${String(email).slice(0, 60)}".`);
        return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    const token = await sessaoService.abrirSessao(usuario);
    res.setHeader('Set-Cookie', montarCookie(token, sessaoService.DURACAO_MS));
    res.json({ usuario: usuarioService.semSegredo(usuario) });
}

async function logout(req, res) {
    const token = lerCookies(req.headers.cookie)[NOME_COOKIE];
    await sessaoService.encerrarSessao(token);
    res.setHeader('Set-Cookie', montarCookie('', 0));
    res.json({ ok: true });
}

async function eu(req, res) {
    if (!req.usuario) return res.status(401).json({ erro: 'Sessão expirada.' });
    res.json({ usuario: req.usuario });
}

module.exports = { login, logout, eu, NOME_COOKIE };
```

- [ ] **Passo 6: Registrar as rotas**

Criar `routes/auth.js`:

```js
const express = require('express');
const router = express.Router();
const { login, logout, eu } = require('../controllers/authController');
const { exigirSessao } = require('../middleware/autenticacao');

router.post('/login', login);
router.post('/logout', logout);
router.get('/eu', exigirSessao, eu);

module.exports = router;
```

Em `index.js`, depois de `app.use(express.json())` e **antes** de
`app.use('/api', apiRoutes)`:

```js
app.use('/auth', require('./routes/auth'));
```

E em `startServer()`, depois de `connectToMongo()`:

```js
    await require('./services/usuarioService').garantirIndices();
    await require('./services/sessaoService').garantirIndices();
```

- [ ] **Passo 7: Rodar e confirmar**

Rodar: `npm test`
Esperado: 78 testes passando.

- [ ] **Passo 8: Commit**

```bash
git add utils/cookies.js test/cookies.test.js services/sessaoService.js controllers/authController.js routes/auth.js index.js
git commit -m "feat: sessão por cookie httpOnly com token no Mongo"
```

---

### Task 3: Autorização por papel

**Files:**
- Create: `middleware/autenticacao.js`
- Create: `test/autenticacao.test.js`
- Modify: `routes/api.js` (protege as rotas)

**Interfaces:**
- Consumes: `buscarSessao` (Task 2), `lerCookies` (Task 2).
- Produces: `carregarUsuario` — popula `req.usuario`, nunca bloqueia
- Produces: `exigirSessao` — 401 sem sessão
- Produces: `exigirPapel(...papeis)` — 403 sem permissão
- Produces: `podePapel(papelDoUsuario, permitidos) → boolean`

- [ ] **Passo 1: Escrever os testes**

Criar `test/autenticacao.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { podePapel } = require('../middleware/autenticacao');

test('admin passa em tudo', () => {
    assert.strictEqual(podePapel('admin', ['admin']), true);
    assert.strictEqual(podePapel('admin', ['gestor', 'admin']), true);
    assert.strictEqual(podePapel('admin', ['atendente']), true);
});

test('gestor passa no que é de gestor, não no que é de admin', () => {
    assert.strictEqual(podePapel('gestor', ['gestor', 'admin']), true);
    assert.strictEqual(podePapel('gestor', ['atendente']), true);
    assert.strictEqual(podePapel('gestor', ['admin']), false);
});

test('atendente só passa no que é de atendente', () => {
    assert.strictEqual(podePapel('atendente', ['atendente']), true);
    assert.strictEqual(podePapel('atendente', ['gestor']), false);
    assert.strictEqual(podePapel('atendente', ['admin']), false);
});

test('papel ausente ou desconhecido não passa', () => {
    assert.strictEqual(podePapel(undefined, ['atendente']), false);
    assert.strictEqual(podePapel('faxineiro', ['atendente']), false);
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../middleware/autenticacao'`

- [ ] **Passo 3: Implementar**

Criar `middleware/autenticacao.js`:

```js
const sessaoService = require('../services/sessaoService');
const { lerCookies } = require('../utils/cookies');
const { NOME_COOKIE } = require('../controllers/authController');

// Hierarquia: quem está acima faz tudo que está abaixo.
const NIVEL = { atendente: 1, gestor: 2, admin: 3 };

function podePapel(papelDoUsuario, permitidos) {
    const meu = NIVEL[papelDoUsuario];
    if (!meu) return false;
    return permitidos.some((papel) => meu >= (NIVEL[papel] ?? Infinity));
}

// Popula req.usuario quando há sessão. Nunca bloqueia — quem bloqueia
// é exigirSessao. Assim uma rota pública ainda sabe quem está logado.
async function carregarUsuario(req, _res, next) {
    try {
        const token = lerCookies(req.headers.cookie)[NOME_COOKIE];
        const sessao = await sessaoService.buscarSessao(token);
        req.usuario = sessao?.usuario ?? null;
    } catch (erro) {
        console.error('Falha ao carregar a sessão:', erro.message);
        req.usuario = null;
    }
    next();
}

function exigirSessao(req, res, next) {
    if (!req.usuario) return res.status(401).json({ erro: 'Entre para continuar.' });
    next();
}

function exigirPapel(...papeis) {
    return (req, res, next) => {
        if (!req.usuario) return res.status(401).json({ erro: 'Entre para continuar.' });
        if (!podePapel(req.usuario.papel, papeis)) {
            return res.status(403).json({ erro: 'Seu perfil não permite esta ação.' });
        }
        next();
    };
}

module.exports = { carregarUsuario, exigirSessao, exigirPapel, podePapel };
```

- [ ] **Passo 4: Ligar no Express e proteger as rotas**

Em `index.js`, depois de `app.use(express.json())` e **antes** das rotas:

```js
app.use(require('./middleware/autenticacao').carregarUsuario);
```

Em `routes/api.js`, aplicar a exigência:

```js
const { exigirSessao } = require('../middleware/autenticacao');

router.get('/conferidas', exigirSessao, getConferidas);
router.get('/cliente/:codigo', exigirSessao, getCliente);
router.post('/enviar', exigirSessao, sendMessage);
router.get('/logs', exigirSessao, getLogs);
```

- [ ] **Passo 5: Verificar**

```bash
npm test
npm start
```

```bash
echo "--- sem sessão ---"
curl -s -o /dev/null -w "status=%{http_code}\n" http://127.0.0.1:3008/api/conferidas
echo "--- com login ---"
curl -s -c /tmp/cookies.txt -X POST http://127.0.0.1:3008/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"SEU_EMAIL","senha":"SUA_SENHA"}'
curl -s -b /tmp/cookies.txt -o /dev/null -w "\nstatus=%{http_code}\n" http://127.0.0.1:3008/api/conferidas
echo "--- senha errada ---"
curl -s -X POST http://127.0.0.1:3008/auth/login -H "Content-Type: application/json" \
  -d '{"email":"SEU_EMAIL","senha":"errada"}'
```

Esperado: `401` sem sessão, `200` com sessão, e a senha errada devolvendo
exatamente `E-mail ou senha incorretos.` — a mesma mensagem de e-mail
inexistente.

- [ ] **Passo 6: Commit**

```bash
git add middleware/autenticacao.js test/autenticacao.test.js index.js routes/api.js
git commit -m "feat: autorização por papel com hierarquia"
```

---

### Task 4: Auditoria

**Files:**
- Create: `services/auditoriaService.js`
- Create: `test/auditoria.test.js`

**Interfaces:**
- Produces: `registrar({usuario, acao, entidade, entidadeId, valorAnterior, valorNovo}) → Promise<void>`
- Produces: `limparSegredos(objeto) → objeto` — troca campos sensíveis por marcador
- Produces: `listarAuditoria({limite}) → Promise<Array>`

- [ ] **Passo 1: Escrever os testes**

Criar `test/auditoria.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { limparSegredos } = require('../services/auditoriaService');

test('substitui o token por marcador com os quatro últimos', () => {
    const limpo = limparSegredos({ token: 'abcdefgh9a3f9', canal: 'whatsmeow' });
    assert.strictEqual(limpo.token, '(alterado, final a3f9)');
    assert.strictEqual(limpo.canal, 'whatsmeow');
});

test('limpa todos os campos sensíveis conhecidos', () => {
    const limpo = limparSegredos({
        token: 'aaaabbbbcccc', clientSecret: 'ddddeeeeffff', senha: 'x', senhaHash: 'y',
    });
    for (const campo of ['token', 'clientSecret', 'senha', 'senhaHash']) {
        assert.ok(String(limpo[campo]).startsWith('('), `${campo} não foi limpo`);
    }
});

test('objeto sem segredo passa intacto', () => {
    const original = { nome: 'Loanda', dias: 2 };
    assert.deepStrictEqual(limparSegredos(original), original);
});

test('valor nulo ou indefinido não estoura', () => {
    assert.strictEqual(limparSegredos(null), null);
    assert.strictEqual(limparSegredos(undefined), undefined);
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../services/auditoriaService'`

- [ ] **Passo 3: Implementar**

Criar `services/auditoriaService.js`:

```js
const { getDb } = require('../config/db');

const COLECAO = 'auditoria';
const CAMPOS_SENSIVEIS = ['token', 'clientId', 'clientSecret', 'senha', 'senhaHash'];

// A auditoria registra QUE mudou, nunca o segredo em si.
function limparSegredos(objeto) {
    if (!objeto || typeof objeto !== 'object') return objeto;

    const limpo = { ...objeto };
    for (const campo of CAMPOS_SENSIVEIS) {
        if (limpo[campo]) {
            const texto = String(limpo[campo]);
            const final = texto.length > 4 ? texto.slice(-4) : '****';
            limpo[campo] = `(alterado, final ${final})`;
        }
    }
    return limpo;
}

// Append-only. Nunca atualizar nem apagar registro de auditoria.
async function registrar({ usuario, acao, entidade, entidadeId, valorAnterior, valorNovo }) {
    try {
        await getDb().collection(COLECAO).insertOne({
            usuarioId: usuario?._id ?? null,
            usuarioNome: usuario?.nome ?? '(sem sessão)',
            acao,
            entidade,
            entidadeId: entidadeId ?? null,
            valorAnterior: limparSegredos(valorAnterior),
            valorNovo: limparSegredos(valorNovo),
            quando: new Date(),
        });
    } catch (erro) {
        // Falha de auditoria não derruba a operação, mas grita no log.
        console.error('FALHA AO AUDITAR:', acao, entidade, erro.message);
    }
}

async function listarAuditoria({ limite = 100 } = {}) {
    return getDb().collection(COLECAO)
        .find({}).sort({ quando: -1 }).limit(limite).toArray();
}

module.exports = { registrar, listarAuditoria, limparSegredos };
```

- [ ] **Passo 4: Rodar e confirmar**

Rodar: `npm test`
Esperado: 86 testes passando.

- [ ] **Passo 5: Commit**

```bash
git add services/auditoriaService.js test/auditoria.test.js
git commit -m "feat: auditoria append-only sem gravar segredos"
```

---

### Task 5: Tela de login e proteção de rotas

**Files:**
- Create: `web/src/api/auth.ts`
- Create: `web/src/estado/sessao.ts`
- Create: `web/src/telas/Login.vue`
- Modify: `web/src/router.ts` (rota de login e guarda)
- Modify: `web/src/api/cliente.ts` (redireciona no 401)

**Interfaces:**
- Consumes: `buscarJson` da Parte 3.
- Produces: `usuarioAtual` (ref), `carregarSessao()`, `entrar(email, senha)`, `sair()`

- [ ] **Passo 1: Criar o acesso e o estado**

Criar `web/src/api/auth.ts`:

```ts
import { buscarJson } from './cliente';

export type Usuario = { _id: string; nome: string; email: string; papel: 'atendente' | 'gestor' | 'admin' };

export function buscarEu(): Promise<{ usuario: Usuario }> {
    return buscarJson<{ usuario: Usuario }>('/auth/eu');
}

export async function fazerLogin(email: string, senha: string): Promise<Usuario> {
    const resposta = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo?.erro || 'Não foi possível entrar.');
    return corpo.usuario as Usuario;
}

export async function fazerLogout(): Promise<void> {
    await fetch('/auth/logout', { method: 'POST' });
}
```

Criar `web/src/estado/sessao.ts`:

```ts
import { ref } from 'vue';
import { buscarEu, fazerLogin, fazerLogout, type Usuario } from '@/api/auth';

export const usuarioAtual = ref<Usuario | null>(null);
export const sessaoCarregada = ref(false);

export async function carregarSessao(): Promise<void> {
    try {
        const { usuario } = await buscarEu();
        usuarioAtual.value = usuario;
    } catch {
        usuarioAtual.value = null;
    } finally {
        sessaoCarregada.value = true;
    }
}

export async function entrar(email: string, senha: string): Promise<void> {
    usuarioAtual.value = await fazerLogin(email, senha);
}

export async function sair(): Promise<void> {
    await fazerLogout();
    usuarioAtual.value = null;
}

export function podeGerir(): boolean {
    return usuarioAtual.value?.papel === 'gestor' || usuarioAtual.value?.papel === 'admin';
}

export function ehAdmin(): boolean {
    return usuarioAtual.value?.papel === 'admin';
}
```

- [ ] **Passo 2: Criar a tela de login**

Criar `web/src/telas/Login.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { entrar } from '@/estado/sessao';

const router = useRouter();
const rota = useRoute();

const email = ref('');
const senha = ref('');
const erro = ref<string | null>(null);
const enviando = ref(false);

async function submeter() {
    erro.value = null;
    enviando.value = true;
    try {
        await entrar(email.value, senha.value);
        const destino = typeof rota.query.destino === 'string' ? rota.query.destino : '/';
        router.replace(destino);
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível entrar.';
    } finally {
        enviando.value = false;
    }
}
</script>

<template>
    <main class="tela">
        <form class="cartao" @submit.prevent="submeter">
            <p class="marca">bioessência</p>
            <h1>Notificador de fórmulas</h1>

            <label for="email">E-mail</label>
            <input id="email" v-model="email" type="email" autocomplete="username" required>

            <label for="senha">Senha</label>
            <input id="senha" v-model="senha" type="password" autocomplete="current-password" required>

            <p v-if="erro" class="erro">{{ erro }}</p>

            <button type="submit" :disabled="enviando">
                {{ enviando ? 'Entrando…' : 'Entrar' }}
            </button>
        </form>
    </main>
</template>

<style scoped>
.tela { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
.cartao {
    width: 100%; max-width: 380px;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda);
    border-radius: var(--raio); padding: 28px 24px;
}
.marca { margin: 0; font-size: 0.8rem; letter-spacing: 0.08em; color: var(--cor-marca); }
h1 { margin: 4px 0 24px; font-size: 1.25rem; }
label { display: block; margin: 14px 0 6px; font-size: 0.8rem; color: var(--cor-texto-suave); }
input {
    width: 100%; padding: 13px 12px; font: inherit;
    border: 1px solid var(--cor-borda); border-radius: var(--raio);
    background: var(--cor-fundo); color: var(--cor-texto);
}
.erro { color: #b91c1c; font-size: 0.85rem; margin: 14px 0 0; }
button {
    width: 100%; margin-top: 20px; padding: 14px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
button:disabled { background: var(--cor-pendente); color: var(--cor-texto-suave); }
</style>
```

- [ ] **Passo 3: Guardar as rotas**

Em `web/src/router.ts`, acrescentar a rota de login e a guarda:

```ts
import { usuarioAtual, sessaoCarregada, carregarSessao } from './estado/sessao';
```

Acrescentar às rotas, antes do curinga:

```ts
        { path: '/entrar', name: 'entrar', component: () => import('./telas/Login.vue'), meta: { publica: true } },
```

E depois da criação do router:

```ts
router.beforeEach(async (para) => {
    if (!sessaoCarregada.value) await carregarSessao();
    if (para.meta.publica) return true;
    if (usuarioAtual.value) return true;
    return { name: 'entrar', query: { destino: para.fullPath } };
});
```

- [ ] **Passo 4: Redirecionar no 401**

Em `web/src/api/cliente.ts`, dentro do bloco `if (!resposta.ok)`, antes de lançar:

```ts
            if (resposta.status === 401 && !location.pathname.startsWith('/entrar')) {
                location.assign(`/entrar?destino=${encodeURIComponent(location.pathname)}`);
            }
```

- [ ] **Passo 5: Verificar**

```bash
npm start && npm run dev:web
```

Confirmar:
- abrir `/` sem sessão redireciona para `/entrar`
- senha errada mostra a mensagem sem dizer se o e-mail existe
- entrar leva de volta ao destino original
- recarregar a página mantém a sessão
- apagar o cookie e recarregar volta para o login

- [ ] **Passo 6: Commit**

```bash
git add web/src/api/auth.ts web/src/estado/sessao.ts web/src/telas/Login.vue web/src/router.ts web/src/api/cliente.ts
git commit -m "feat: tela de login e proteção das rotas do front"
```

---

## Critério de conclusão da Parte 5

- [ ] `npm test` passa 86 testes
- [ ] Nenhuma rota `/api/*` responde sem sessão
- [ ] E-mail inexistente e senha errada devolvem a **mesma** mensagem
- [ ] Sessão expira sozinha pelo índice TTL do Mongo
- [ ] A auditoria registra "alterado, final a3f9" — nunca o segredo
- [ ] Nenhuma resposta HTTP contém `senhaHash`
- [ ] O front redireciona para o login no 401 e volta ao destino após entrar
