# Parte 4 — Envio Ponta a Ponta

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa.

**Goal:** Migrar o envio do webhook descontinuado para a API v1 do whatsmeow,
com as credenciais no Mongo cifradas, motor de templates com variáveis nomeadas,
e a tela de receita com os cinco estados.

**Architecture:** As credenciais do canal vivem em `canal_config` no Mongo, com
os campos sensíveis cifrados em AES-256-GCM por uma chave de ambiente. O cliente
da API cuida do `access_token` e da renovação. O motor de templates é uma função
pura que **falha** quando uma variável não resolve — nunca envia `{{local}}`
literal ao cliente.

**Tech Stack:** Node.js v24.14.0 (`node:crypto`), axios 1.12.2, MongoDB 6.20.0,
Vue 3.5.41, PrimeVue 4.5.5.

**Spec:** `docs/superpowers/specs/2026-08-18-canal-whatsmeow-spec.md` (Escopo A,
decisões D6 e D8) e `.../2026-08-18-notificador-evolucao-design.md` (Projeto C1)

## Global Constraints

- **O webhook está descontinuado.** Nenhum código novo usa `process.env.API_URL`.
- **Toda chamada à API tem timeout.** O axios de hoje não tem, e uma API lenta
  pendura a requisição.
- **Segredo nunca sai em texto.** A API de leitura devolve mascarado
  (`••••••••a3f9`); o log registra "token alterado", nunca o valor.
- **Variável não resolvida bloqueia o envio.** Mensagem quebrada em nome da
  farmácia é pior que mensagem não enviada.
- Sintaxe de variável: `{{nome}}`, nomeada, nunca posicional.
- `whatsmeow` aceita **no máximo 3 botões**.
- Commits em português, prefixo convencional.

## Pré-requisitos do cliente

| Item | Onde entra |
|---|---|
| `client_id` e `client_secret` da API MultiAtend | semeados na `canal_config` |
| Token da conexão whatsmeow | idem |
| Número de teste do time | verificação da Task 4 |

Sem eles, as Tasks 1 a 3 são executáveis e testáveis; a Task 4 para na
verificação contra a API real.

---

### Task 1: Cifragem e configuração do canal

**Files:**
- Create: `utils/cripto.js`
- Create: `test/cripto.test.js`
- Create: `services/canalConfigService.js`
- Create: `scripts/semear-canal.js`
- Modify: `config/env.js` (acrescenta `chaveCripto`)
- Modify: `test/env.test.js` (cobre a nova variável)
- Modify: `.env.example`

**Interfaces:**
- Produces: `cifrar(texto, chaveBase64) → string`, `decifrar(pacote, chaveBase64) → string`, `mascarar(valor) → string`
- Produces: `carregarCanal() → Promise<{canal, token, clientId, clientSecret, numeroRemetente, botoesAtivos, ativo} | null>` — já decifrado
- Produces: `salvarCanal(dados) → Promise<void>` — cifra antes de gravar
- Produces: `canalParaExibicao(canal) → objeto com segredos mascarados`
- Consumes: `resolverConfig` da Parte 1.

- [ ] **Passo 1: Escrever os testes de cifragem**

Criar `test/cripto.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { cifrar, decifrar, mascarar } = require('../utils/cripto');

const chave = crypto.randomBytes(32).toString('base64');

test('decifrar devolve o texto original', () => {
    const pacote = cifrar('token_da_conexao_abc123', chave);
    assert.strictEqual(decifrar(pacote, chave), 'token_da_conexao_abc123');
});

test('o texto cifrado não contém o original', () => {
    const pacote = cifrar('token_da_conexao_abc123', chave);
    assert.ok(!pacote.includes('token_da_conexao'));
});

test('duas cifragens do mesmo texto são diferentes', () => {
    assert.notStrictEqual(cifrar('igual', chave), cifrar('igual', chave));
});

test('chave errada não decifra', () => {
    const pacote = cifrar('segredo', chave);
    const outra = crypto.randomBytes(32).toString('base64');
    assert.throws(() => decifrar(pacote, outra));
});

test('conteúdo adulterado é recusado', () => {
    const pacote = cifrar('segredo', chave);
    const partes = pacote.split('.');
    partes[2] = Buffer.from('outracoisa').toString('base64');
    assert.throws(() => decifrar(partes.join('.'), chave));
});

test('chave de tamanho errado é recusada', () => {
    assert.throws(() => cifrar('x', Buffer.alloc(16).toString('base64')), /32 bytes/);
});

test('formato inválido é recusado', () => {
    assert.throws(() => decifrar('sem-pontos', chave), /formato/);
});

test('mascarar mostra apenas os quatro últimos', () => {
    assert.strictEqual(mascarar('abcdefghij9a3f9'), '••••••••a3f9');
    assert.strictEqual(mascarar('abc'), '••••');
    assert.strictEqual(mascarar(''), '••••');
    assert.strictEqual(mascarar(null), '••••');
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../utils/cripto'`

- [ ] **Passo 3: Implementar a cifragem**

Criar `utils/cripto.js`:

```js
'use strict';

const crypto = require('node:crypto');

const ALGORITMO = 'aes-256-gcm';
const TAMANHO_IV = 12;
const TAMANHO_CHAVE = 32;

function obterChave(chaveBase64) {
    const chave = Buffer.from(String(chaveBase64 || ''), 'base64');
    if (chave.length !== TAMANHO_CHAVE) {
        throw new Error('A chave de cifragem deve ter 32 bytes codificados em base64.');
    }
    return chave;
}

// Formato do pacote: iv.tag.dados, todos em base64.
// GCM porque queremos detectar adulteração, não só confidencialidade.
function cifrar(texto, chaveBase64) {
    const chave = obterChave(chaveBase64);
    const iv = crypto.randomBytes(TAMANHO_IV);
    const cifra = crypto.createCipheriv(ALGORITMO, chave, iv);
    const dados = Buffer.concat([cifra.update(String(texto), 'utf8'), cifra.final()]);
    return [
        iv.toString('base64'),
        cifra.getAuthTag().toString('base64'),
        dados.toString('base64'),
    ].join('.');
}

function decifrar(pacote, chaveBase64) {
    const chave = obterChave(chaveBase64);
    const partes = String(pacote || '').split('.');
    if (partes.length !== 3) {
        throw new Error('Formato de valor cifrado inválido.');
    }
    const [iv, tag, dados] = partes;
    const decifra = crypto.createDecipheriv(ALGORITMO, chave, Buffer.from(iv, 'base64'));
    decifra.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
        decifra.update(Buffer.from(dados, 'base64')),
        decifra.final(),
    ]).toString('utf8');
}

function mascarar(valor) {
    const texto = String(valor || '');
    if (texto.length <= 4) return '••••';
    return '••••••••' + texto.slice(-4);
}

module.exports = { cifrar, decifrar, mascarar };
```

- [ ] **Passo 4: Acrescentar a chave à configuração**

Em `config/env.js`, dentro do objeto `config`, depois de `mongo`:

```js
        chaveCripto: obrigatorio('APP_CRYPTO_KEY'),
```

E acrescentar em `test/env.test.js`, dentro de `ambienteMinimo`:

```js
    APP_CRYPTO_KEY: 'Y2hhdmVEZVRlc3RlQ29tVHJpbnRhRURvaXNCeXRlcyE=',
```

Acrescentar também este teste ao mesmo arquivo:

```js
test('exige a chave de cifragem', () => {
    const semChave = { ...ambienteMinimo };
    delete semChave.APP_CRYPTO_KEY;
    assert.throws(() => resolverConfig(semChave), /APP_CRYPTO_KEY/);
});
```

E ao `.env.example`:

```env
# --- Cifragem das credenciais do canal ---
# Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Trocar esta chave torna as credenciais salvas ilegíveis — semeie de novo.
APP_CRYPTO_KEY=
```

- [ ] **Passo 5: Escrever o serviço de configuração do canal**

Criar `services/canalConfigService.js`:

```js
const { getDb, config } = require('../config/db');
const { cifrar, decifrar, mascarar } = require('../utils/cripto');

const COLECAO = 'canal_config';
const ID_UNICO = 'principal';
const CAMPOS_SECRETOS = ['token', 'clientId', 'clientSecret'];

function colecao() {
    return getDb().collection(COLECAO);
}

async function carregarCanal() {
    const doc = await colecao().findOne({ _id: ID_UNICO });
    if (!doc) return null;

    const aberto = { ...doc };
    for (const campo of CAMPOS_SECRETOS) {
        aberto[campo] = doc[campo] ? decifrar(doc[campo], config.chaveCripto) : null;
    }
    return aberto;
}

async function salvarCanal(dados) {
    const paraGravar = { ...dados, _id: ID_UNICO, atualizadoEm: new Date() };
    for (const campo of CAMPOS_SECRETOS) {
        if (dados[campo]) paraGravar[campo] = cifrar(dados[campo], config.chaveCripto);
    }
    await colecao().replaceOne({ _id: ID_UNICO }, paraGravar, { upsert: true });
}

// O que pode sair pela API de leitura. O valor cheio nunca deixa o servidor
// depois de salvo.
function canalParaExibicao(canal) {
    if (!canal) return null;
    return {
        canal: canal.canal,
        numeroRemetente: canal.numeroRemetente,
        botoesAtivos: Boolean(canal.botoesAtivos),
        ativo: Boolean(canal.ativo),
        token: mascarar(canal.token),
        clientId: mascarar(canal.clientId),
        clientSecret: mascarar(canal.clientSecret),
        atualizadoEm: canal.atualizadoEm,
    };
}

module.exports = { carregarCanal, salvarCanal, canalParaExibicao };
```

Em `config/db.js`, acrescentar ao `module.exports`:

```js
    getDb: () => {
        if (!dbInstance) throw new Error('MongoDB não inicializado.');
        return dbInstance;
    },
```

- [ ] **Passo 6: Escrever o script de semeadura**

Criar `scripts/semear-canal.js`:

```js
// Semeia as credenciais do canal no Mongo, sem passar por arquivo.
// Uso: node scripts/semear-canal.js
require('dotenv').config();
const readline = require('node:readline/promises');
const { connectToMongo, config } = require('../config/db');
const { salvarCanal, carregarCanal, canalParaExibicao } = require('../services/canalConfigService');

(async () => {
    await connectToMongo();
    console.log(`Gravando na base "${config.mongo.dbName}". Confirme que NÃO é produção.\n`);

    const io = readline.createInterface({ input: process.stdin, output: process.stdout });
    const token = await io.question('Token da conexão whatsmeow: ');
    const clientId = await io.question('client_id: ');
    const clientSecret = await io.question('client_secret: ');
    const numeroRemetente = await io.question('Número remetente (só dígitos, com DDI): ');
    io.close();

    await salvarCanal({
        canal: 'whatsmeow',
        token: token.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        numeroRemetente: numeroRemetente.trim(),
        botoesAtivos: false,
        ativo: true,
    });

    console.log('\nGravado:', canalParaExibicao(await carregarCanal()));
    process.exit(0);
})();
```

- [ ] **Passo 7: Rodar os testes e semear**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# copiar para APP_CRYPTO_KEY no .env
npm test
```

Esperado: 48 testes passando (39 da Parte 2 + 8 de cripto + 1 de env).

```bash
node scripts/semear-canal.js
```

Esperado: a saída mostra os segredos **mascarados**, e no Mongo os campos
`token`, `clientId` e `clientSecret` aparecem no formato `iv.tag.dados`.

- [ ] **Passo 8: Commit**

```bash
git add utils/cripto.js test/cripto.test.js services/canalConfigService.js scripts/semear-canal.js config/env.js config/db.js test/env.test.js .env.example
git commit -m "feat: configuração do canal no Mongo com credenciais cifradas"
```

---

### Task 2: Cliente da API whatsmeow

**Files:**
- Create: `services/whatsmeowService.js`
- Create: `test/whatsmeowService.test.js`
- Modify: `config/env.js` (acrescenta `multiatendBaseUrl`)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `carregarCanal` da Task 1.
- Produces: `enviarTexto({ numero, mensagem }) → Promise<{ ok: true, resposta }>`
- Produces: `enviarBotoes({ numero, titulo, corpo, botoes }) → Promise<{ ok: true, resposta }>`
- Produces: `validarBotoes(botoes) → void` — lança quando passa de 3 ou falta campo obrigatório
- Produces: `_limparCacheToken()` — usado apenas em teste

- [ ] **Passo 1: Escrever os testes de validação de botões**

A validação é pura e é onde os erros do fornecedor aparecem primeiro.

Criar `test/whatsmeowService.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { validarBotoes } = require('../services/whatsmeowService');

test('aceita até três botões', () => {
    assert.doesNotThrow(() => validarBotoes([
        { id: 'opt_1', title: 'Sim', type: 'reply' },
        { id: 'opt_2', title: 'Não', type: 'reply' },
        { title: 'Ligar', type: 'cta_call', phone_number: '5544997028340' },
    ]));
});

test('recusa mais de três — o limite da API é maxItems 3', () => {
    const quatro = Array.from({ length: 4 }, (_, i) => ({ id: `o${i}`, title: 'x', type: 'reply' }));
    assert.throws(() => validarBotoes(quatro), /no máximo 3/);
});

test('reply exige id', () => {
    assert.throws(() => validarBotoes([{ title: 'Sim', type: 'reply' }]), /id/);
});

test('cta_url exige url', () => {
    assert.throws(() => validarBotoes([{ title: 'Site', type: 'cta_url' }]), /url/);
});

test('cta_call exige phone_number', () => {
    assert.throws(() => validarBotoes([{ title: 'Ligar', type: 'cta_call' }]), /phone_number/);
});

test('cta_copy exige copy_code', () => {
    assert.throws(() => validarBotoes([{ title: 'Copiar', type: 'cta_copy' }]), /copy_code/);
});

test('tipo desconhecido é recusado', () => {
    assert.throws(() => validarBotoes([{ id: 'a', title: 'x', type: 'lista' }]), /tipo/);
});

test('todo botão precisa de title', () => {
    assert.throws(() => validarBotoes([{ id: 'a', type: 'reply' }]), /title/);
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../services/whatsmeowService'`

- [ ] **Passo 3: Implementar o serviço**

Criar `services/whatsmeowService.js`:

```js
const axios = require('axios');
const { config } = require('../config/db');
const { carregarCanal } = require('./canalConfigService');

const TEMPO_LIMITE_MS = 20000;
const MARGEM_RENOVACAO_MS = 60000;
const MAX_BOTOES = 3;

const TIPOS_BOTAO = {
    reply: ['id'],
    cta_url: ['url'],
    cta_call: ['phone_number'],
    cta_copy: ['copy_code'],
};

let cacheToken = null; // { accessToken, refreshToken, expiraEm }

function _limparCacheToken() {
    cacheToken = null;
}

function http() {
    return axios.create({
        baseURL: config.multiatendBaseUrl,
        timeout: TEMPO_LIMITE_MS,
    });
}

async function obterAccessToken() {
    if (cacheToken && cacheToken.expiraEm - MARGEM_RENOVACAO_MS > Date.now()) {
        return cacheToken.accessToken;
    }

    const canal = await carregarCanal();
    if (!canal || !canal.ativo) {
        throw new Error('Canal de envio não configurado. Cadastre em Configurações.');
    }

    const corpo = cacheToken?.refreshToken
        ? { grant_type: 'refresh_token', refresh_token: cacheToken.refreshToken }
        : { grant_type: 'client_credentials', client_id: canal.clientId, client_secret: canal.clientSecret };

    try {
        const { data } = await http().post('/api/v1/auth/token', corpo);
        cacheToken = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            // Sem expires_in explícito, assume 30 minutos e renova cedo.
            expiraEm: Date.now() + (Number(data.expires_in) * 1000 || 1800000),
        };
        return cacheToken.accessToken;
    } catch (erro) {
        // Refresh vencido: limpa e tenta uma vez pelo caminho completo.
        if (cacheToken?.refreshToken) {
            cacheToken = null;
            return obterAccessToken();
        }
        throw new Error('Não foi possível autenticar na API de envio.');
    }
}

function validarBotoes(botoes) {
    if (!Array.isArray(botoes) || botoes.length === 0) {
        throw new Error('Informe ao menos um botão.');
    }
    if (botoes.length > MAX_BOTOES) {
        throw new Error(`O whatsmeow aceita no máximo 3 botões; recebeu ${botoes.length}.`);
    }
    for (const botao of botoes) {
        if (!botao.title) throw new Error('Todo botão precisa de title.');
        const exigidos = TIPOS_BOTAO[botao.type];
        if (!exigidos) throw new Error(`Tipo de botão desconhecido: ${botao.type}`);
        for (const campo of exigidos) {
            if (!botao[campo]) {
                throw new Error(`O botão do tipo ${botao.type} exige ${campo}.`);
            }
        }
    }
}

async function postarNaApi(caminho, corpo) {
    const [token, canal] = await Promise.all([obterAccessToken(), carregarCanal()]);
    const { data } = await http().post(
        caminho,
        { ...corpo, token: canal.token },
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return { ok: true, resposta: data };
}

function enviarTexto({ numero, mensagem }) {
    return postarNaApi('/api/v1/messages/whatsmeow/send', { number: numero, body: mensagem });
}

function enviarBotoes({ numero, titulo, corpo, botoes }) {
    validarBotoes(botoes);
    return postarNaApi('/api/v1/messages/whatsmeow/buttons', {
        number: numero, title: titulo, body: corpo, buttons: botoes,
    });
}

module.exports = { enviarTexto, enviarBotoes, validarBotoes, _limparCacheToken };
```

- [ ] **Passo 4: Acrescentar a URL base à configuração**

Em `config/env.js`, dentro do objeto `config`:

```js
        multiatendBaseUrl: (env.MULTIATEND_BASE_URL || 'https://api2.multiatendweb.com.br').trim(),
```

E ao `.env.example`:

```env
# --- API de envio (MultiAtend) ---
# As credenciais NÃO ficam aqui: vivem no Mongo, semeadas por scripts/semear-canal.js
MULTIATEND_BASE_URL=https://api2.multiatendweb.com.br
```

- [ ] **Passo 5: Rodar e confirmar**

Rodar: `npm test`
Esperado: 56 testes passando.

- [ ] **Passo 6: Commit**

```bash
git add services/whatsmeowService.js test/whatsmeowService.test.js config/env.js .env.example
git commit -m "feat: cliente da API whatsmeow com renovação de token e timeout"
```

---

### Task 3: Motor de templates

**Files:**
- Create: `utils/template.js`
- Create: `test/template.test.js`
- Create: `services/templateService.js`
- Create: `scripts/semear-templates.js`

**Interfaces:**
- Produces: `variaveisUsadas(texto) → string[]`
- Produces: `renderizar(texto, valores) → string` — lança `VariavelAusenteError` com `.faltando`
- Produces: `VariavelAusenteError`
- Produces: `carregarTemplate(modalidade) → Promise<{titulo, corpo} | null>`
- Produces: `TEMPLATES_PADRAO` — usados como fallback

- [ ] **Passo 1: Escrever os testes**

Criar `test/template.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderizar, variaveisUsadas, VariavelAusenteError } = require('../utils/template');

test('substitui variáveis nomeadas', () => {
    const texto = renderizar('Olá, {{nome}}! Pronta em {{dias}} dias.', { nome: 'Ana', dias: 3 });
    assert.strictEqual(texto, 'Olá, Ana! Pronta em 3 dias.');
});

test('aceita espaços dentro das chaves', () => {
    assert.strictEqual(renderizar('{{ nome }}', { nome: 'Ana' }), 'Ana');
});

test('repete a mesma variável quantas vezes aparecer', () => {
    assert.strictEqual(renderizar('{{a}}-{{a}}', { a: 'x' }), 'x-x');
});

test('lista as variáveis usadas, sem repetir', () => {
    assert.deepStrictEqual(variaveisUsadas('{{a}} {{b}} {{a}}'), ['a', 'b']);
});

test('variável ausente bloqueia — nunca envia {{local}} literal', () => {
    assert.throws(
        () => renderizar('Retirada {{local}}.', { nome: 'Ana' }),
        (erro) => {
            assert.ok(erro instanceof VariavelAusenteError);
            assert.deepStrictEqual(erro.faltando, ['local']);
            return true;
        }
    );
});

test('string vazia conta como ausente', () => {
    assert.throws(() => renderizar('{{local}}', { local: '' }), VariavelAusenteError);
});

test('zero é valor válido, não ausente', () => {
    assert.strictEqual(renderizar('{{dias}} dias', { dias: 0 }), '0 dias');
});

test('texto sem variável passa intacto', () => {
    assert.strictEqual(renderizar('Sem variáveis.', {}), 'Sem variáveis.');
});

test('chave malformada não é tratada como variável', () => {
    assert.strictEqual(renderizar('{nome} e {{{nome}}}', { nome: 'Ana' }), '{nome} e {Ana}');
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../utils/template'`

- [ ] **Passo 3: Implementar**

Criar `utils/template.js`:

```js
'use strict';

const PADRAO_VARIAVEL = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

class VariavelAusenteError extends Error {
    constructor(faltando) {
        super(`Variáveis sem valor no template: ${faltando.join(', ')}`);
        this.name = 'VariavelAusenteError';
        this.faltando = faltando;
    }
}

function variaveisUsadas(texto) {
    const nomes = new Set();
    for (const achado of String(texto ?? '').matchAll(PADRAO_VARIAVEL)) {
        nomes.add(achado[1]);
    }
    return [...nomes];
}

function ausente(valor) {
    return valor === undefined || valor === null || valor === '';
}

// Renderiza ou falha. Não existe meio-termo: mandar "{{local}}" literal
// para o cliente é pior do que não mandar nada.
function renderizar(texto, valores) {
    const faltando = variaveisUsadas(texto).filter((nome) => ausente(valores[nome]));
    if (faltando.length > 0) throw new VariavelAusenteError(faltando);
    return String(texto).replace(PADRAO_VARIAVEL, (_, nome) => String(valores[nome]));
}

module.exports = { renderizar, variaveisUsadas, VariavelAusenteError };
```

- [ ] **Passo 4: Rodar e confirmar**

Rodar: `npm test`
Esperado: 65 testes passando.

- [ ] **Passo 5: Criar o serviço com fallback**

Criar `services/templateService.js`:

```js
const { getDb } = require('../config/db');

const COLECAO = 'templates';

// Fallback embutido: se a coleção estiver vazia ou o documento quebrado,
// o sistema continua enviando com o texto que já usava.
const TEMPLATES_PADRAO = {
    retirada: {
        titulo: 'Fórmula pronta',
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'A Farmácia Bioessência informa: Sua receita (Nº {{codigo}}) está pronta ' +
            'para retirada em nossa loja. 💊✅\n\n' +
            'Ficamos à disposição e aguardamos sua visita!',
    },
    entrega: {
        titulo: 'Fórmula a caminho',
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'A Farmácia Bioessência informa: Sua receita (Nº {{codigo}}) está pronta ' +
            'e será enviada para entrega. 🚚✅\n\n' +
            'Endereço de destino:\n{{endereco}}\n\nFicamos à disposição!',
    },
};

async function carregarTemplate(modalidade) {
    try {
        const doc = await getDb().collection(COLECAO).findOne({ modalidade });
        if (doc && typeof doc.corpo === 'string' && doc.corpo.trim() !== '') {
            return { titulo: doc.titulo || '', corpo: doc.corpo };
        }
    } catch (erro) {
        console.error(`Falha ao carregar o template "${modalidade}":`, erro.message);
    }
    return TEMPLATES_PADRAO[modalidade] || null;
}

module.exports = { carregarTemplate, TEMPLATES_PADRAO };
```

- [ ] **Passo 6: Semear os templates**

Criar `scripts/semear-templates.js`:

```js
require('dotenv').config();
const { connectToMongo, getDb, config } = require('../config/db');
const { TEMPLATES_PADRAO } = require('../services/templateService');

(async () => {
    await connectToMongo();
    console.log(`Semeando templates na base "${config.mongo.dbName}".`);

    const colecao = getDb().collection('templates');
    for (const [modalidade, template] of Object.entries(TEMPLATES_PADRAO)) {
        await colecao.updateOne(
            { modalidade },
            { $setOnInsert: { modalidade, ...template, versao: 1, atualizadoEm: new Date() } },
            { upsert: true }
        );
        console.log(`  ${modalidade}: pronto`);
    }
    process.exit(0);
})();
```

Rodar: `node scripts/semear-templates.js`
Esperado: as duas modalidades criadas, sem sobrescrever o que já existir.

- [ ] **Passo 7: Commit**

```bash
git add utils/template.js test/template.test.js services/templateService.js scripts/semear-templates.js
git commit -m "feat: motor de templates com variáveis nomeadas e fallback"
```

---

### Task 4: Migrar o envio para o whatsmeow

Corrige junto os defeitos de mensagem: saudação calculada na busca em vez do
envio, e ausência de `{{qtdFormulas}}`.

**Files:**
- Modify: `controllers/messageController.js` (substituição completa)
- Modify: `controllers/recipeController.js` (deixa de montar a mensagem)
- Modify: `services/firebirdService.js` (acrescenta `contarFormulas`)

**Interfaces:**
- Consumes: `enviarTexto` (Task 2), `carregarTemplate` (Task 3), `renderizar` (Task 3), `montarEndereco` (Parte 2).
- Produces: `contarFormulas(codigoReceita) → Promise<number>`
- Produces: `POST /api/enviar` com corpo `{ codigoReceita, telefoneEscolhido, mensagem?, nomeCliente }`

- [ ] **Passo 1: Acrescentar a contagem de fórmulas**

Em `services/firebirdService.js`, antes do `module.exports`:

```js
async function contarFormulas(codigoReceita) {
    const linhas = await queryFb(
        'SELECT COUNT(*) AS TOTAL FROM RECFORMULAS WHERE CODIGOREC = ?',
        [codigoReceita]
    );
    return Number(linhas?.[0]?.TOTAL ?? 0);
}
```

E incluir `contarFormulas` no `module.exports`.

- [ ] **Passo 2: Reescrever o controller de envio**

Substituir todo o conteúdo de `controllers/messageController.js` por:

```js
const firebirdService = require('../services/firebirdService');
const mongoService = require('../services/mongoService');
const whatsmeowService = require('../services/whatsmeowService');
const templateService = require('../services/templateService');
const { formatPhoneNumber, getSaudacao, toTitleCase } = require('../utils/helpers');
const { renderizar, VariavelAusenteError } = require('../utils/template');
const { montarEndereco } = require('../utils/endereco');

// Monta a mensagem no MOMENTO DO ENVIO. Antes ela era montada na busca,
// então quem buscasse 11h58 e enviasse 12h05 mandava "Bom dia" no almoço.
async function montarMensagem(codigoReceita, nomeCliente) {
    const { isDelivery, deliveryAddress } = await firebirdService.getDeliveryData(codigoReceita);
    const modalidade = isDelivery ? 'entrega' : 'retirada';
    const template = await templateService.carregarTemplate(modalidade);

    const valores = {
        saudacao: getSaudacao(),
        nome: toTitleCase(nomeCliente),
        codigo: codigoReceita,
        qtdFormulas: await firebirdService.contarFormulas(codigoReceita),
        endereco: montarEndereco(deliveryAddress) || undefined,
    };

    return { texto: renderizar(template.corpo, valores), modalidade };
}

async function sendMessage(req, res) {
    const { codigoReceita, telefoneEscolhido, mensagem, nomeCliente } = req.body;

    const numeroFormatado = formatPhoneNumber(telefoneEscolhido);
    if (!numeroFormatado) {
        return res.status(400).json({
            status: 'erro',
            mensagem: 'Número de telefone inválido ou incompleto. Verifique se possui DDD.',
        });
    }

    let textoFinal = mensagem;
    try {
        // Texto editado pela atendente vence o template. Sem edição, monta agora.
        if (!textoFinal || textoFinal.trim() === '') {
            ({ texto: textoFinal } = await montarMensagem(codigoReceita, nomeCliente));
        }
    } catch (erro) {
        if (erro instanceof VariavelAusenteError) {
            return res.status(422).json({
                status: 'erro',
                mensagem: `O template está incompleto: ${erro.faltando.join(', ')}. Ajuste em Configurações.`,
            });
        }
        console.error('Erro ao montar a mensagem:', erro);
        return res.status(500).json({ status: 'erro', mensagem: 'Não foi possível montar a mensagem.' });
    }

    try {
        await whatsmeowService.enviarTexto({ numero: numeroFormatado, mensagem: textoFinal });

        await mongoService.logToMongo({
            codigoReceita: Number(codigoReceita),
            nomeCliente,
            telefoneEnviado: numeroFormatado,
            mensagem: textoFinal,
            status: 'sucesso',
            timestamp: new Date(),
        });

        res.json({ status: 'sucesso', mensagem: 'Mensagem enviada.' });
    } catch (erro) {
        console.error('Falha no envio:', erro.message);

        await mongoService.logToMongo({
            codigoReceita: Number(codigoReceita),
            nomeCliente,
            telefoneEnviado: numeroFormatado,
            status: 'erro',
            detalheErro: erro.response?.data ?? erro.message,
            timestamp: new Date(),
        });

        res.status(502).json({
            status: 'erro',
            mensagem: 'Falha na comunicação com o servidor de envio.',
        });
    }
}

module.exports = { sendMessage };
```

- [ ] **Passo 3: Tirar a montagem da mensagem da busca**

Em `controllers/recipeController.js`, substituir a montagem por uma prévia,
deixando claro que o texto definitivo nasce no envio:

```js
        const template = await require('../services/templateService')
            .carregarTemplate(isDelivery ? 'entrega' : 'retirada');
```

E na resposta, trocar `mensagemSugerida` por:

```js
            mensagemSugerida: template.corpo,
```

O front mostra a prévia com as variáveis já substituídas na Task 5.

- [ ] **Passo 4: Verificar contra o número de teste**

Semear as credenciais (Task 1), depois:

```bash
npm start
curl -s -X POST http://127.0.0.1:3008/api/enviar \
  -H "Content-Type: application/json" \
  -d '{"codigoReceita":441433,"telefoneEscolhido":"SEU_NUMERO_DE_TESTE","nomeCliente":"Teste"}'
```

Esperado: `{"status":"sucesso"...}` e a mensagem chegando no aparelho de teste.
Confirmar no Mongo de **desenvolvimento** que o log foi gravado.

**Nunca usar número de cliente real nesta verificação.**

- [ ] **Passo 5: Verificar o bloqueio por variável ausente**

Editar o template de entrega no Mongo acrescentando `{{inexistente}}` e repetir a
chamada, sem enviar `mensagem` no corpo.

Esperado: `422` com `O template está incompleto: inexistente.` — e **nada
enviado**.

Desfazer a edição depois.

- [ ] **Passo 6: Commit**

```bash
git add controllers/messageController.js controllers/recipeController.js services/firebirdService.js
git commit -m "feat: enviar pelo whatsmeow com template renderizado no envio"
```

---

### Task 5: Tela da receita

**Files:**
- Create: `web/src/api/receita.ts`
- Create: `web/src/telas/Receita.vue` (substitui o stub da Parte 3)

**Interfaces:**
- Consumes: `buscarJson` e os tipos da Parte 3; `formatarTelefone` da Parte 3.
- Produces: `buscarReceita(codigo) → Promise<DetalheReceita>`, `enviarAviso(dados) → Promise<void>`

- [ ] **Passo 1: Acrescentar o acesso à API**

Criar `web/src/api/receita.ts`:

```ts
import { buscarJson } from './cliente';

export type Telefone = { rotulo: string; numero: string };

export type DetalheReceita = {
    dadosCliente: { nome: string; telefones: Record<string, string | null> };
    mensagemSugerida: string;
    jaEnviado: boolean;
    isDelivery: boolean;
    deliveryAddress: { cidade?: string; estado?: string } | null;
};

export function buscarReceita(codigo: number | string): Promise<DetalheReceita> {
    return buscarJson<DetalheReceita>(`/api/cliente/${encodeURIComponent(String(codigo))}`);
}

export async function enviarAviso(dados: {
    codigoReceita: number;
    telefoneEscolhido: string;
    mensagem: string;
    nomeCliente: string;
}): Promise<void> {
    const resposta = await fetch('/api/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
    });
    if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new Error(corpo?.mensagem || 'Não foi possível enviar o aviso.');
    }
}

// Os quatro campos de telefone do ERP, na ordem em que a atendente costuma usar.
const ROTULOS: Record<string, string> = {
    FONECEL: 'celular',
    FONERES: 'residencial',
    FONECOM: 'comercial',
    FONEREC: 'recado',
};

export function listarTelefones(telefones: Record<string, string | null>): Telefone[] {
    return Object.entries(ROTULOS)
        .filter(([chave]) => Boolean(telefones?.[chave]))
        .map(([chave, rotulo]) => ({ rotulo, numero: telefones[chave] as string }));
}
```

- [ ] **Passo 2: Criar a tela**

Substituir `web/src/telas/Receita.vue` por:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Textarea from 'primevue/textarea';
import Skeleton from 'primevue/skeleton';
import { buscarReceita, enviarAviso, listarTelefones, type DetalheReceita, type Telefone } from '@/api/receita';
import { formatarTelefone } from '@/formatadores';

const rota = useRoute();
const router = useRouter();
const toast = useToast();

const codigo = Number(rota.params.codigo);
const detalhe = ref<DetalheReceita | null>(null);
const telefones = ref<Telefone[]>([]);
const escolhido = ref<string | null>(null);
const texto = ref('');
const carregando = ref(true);
const enviando = ref(false);
const erro = ref<string | null>(null);

const modalidade = computed(() => {
    if (!detalhe.value) return '';
    if (!detalhe.value.isDelivery) return 'Retirada na farmácia';
    const cidade = detalhe.value.deliveryAddress?.cidade;
    return cidade ? `Entrega · ${cidade}` : 'Entrega';
});

onMounted(async () => {
    try {
        const dados = await buscarReceita(codigo);
        detalhe.value = dados;
        telefones.value = listarTelefones(dados.dadosCliente.telefones);
        escolhido.value = telefones.value[0]?.numero ?? null;
        texto.value = dados.mensagemSugerida;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Receita não encontrada.';
    } finally {
        carregando.value = false;
    }
});

async function enviar() {
    if (!escolhido.value || !detalhe.value) return;
    enviando.value = true;
    try {
        await enviarAviso({
            codigoReceita: codigo,
            telefoneEscolhido: escolhido.value,
            mensagem: texto.value,
            nomeCliente: detalhe.value.dadosCliente.nome,
        });
        toast.add({ severity: 'success', summary: 'Aviso enviado', life: 3000 });
        router.push({ name: 'hoje' });
    } catch (e) {
        toast.add({
            severity: 'error',
            summary: 'Não enviado',
            detail: e instanceof Error ? e.message : '',
            life: 6000,
        });
    } finally {
        enviando.value = false;
    }
}
</script>

<template>
    <main class="tela com-rodape-fixo">
        <header class="topo">
            <button type="button" class="voltar" @click="router.back()" aria-label="Voltar">←</button>
            <span class="codigo dados">{{ codigo }}</span>
        </header>

        <div v-if="carregando"><Skeleton height="140px" border-radius="10px" /></div>

        <div v-else-if="erro" class="vazio">
            <p>{{ erro }}</p>
            <button type="button" class="tentar" @click="router.push({ name: 'hoje' })">
                Voltar para a lista
            </button>
        </div>

        <template v-else-if="detalhe">
            <h1>{{ detalhe.dadosCliente.nome }}</h1>
            <p class="modalidade">{{ modalidade }}</p>

            <p v-if="detalhe.jaEnviado" class="ja-avisado">
                Esta receita já foi avisada. Enviar de novo repete a mensagem para o cliente.
            </p>

            <h2>Para qual número?</h2>
            <p v-if="telefones.length === 0" class="vazio">
                Este cliente não tem telefone cadastrado no sistema.
            </p>
            <button
                v-for="telefone in telefones"
                :key="telefone.numero"
                type="button"
                class="telefone"
                :class="{ ativo: escolhido === telefone.numero }"
                @click="escolhido = telefone.numero"
            >
                <span class="dados">{{ formatarTelefone(telefone.numero) }}</span>
                <span class="rotulo">{{ telefone.rotulo }}</span>
            </button>

            <h2>Mensagem</h2>
            <Textarea v-model="texto" auto-resize rows="8" class="mensagem" />

            <div class="rodape">
                <button
                    type="button"
                    class="enviar"
                    :disabled="!escolhido || enviando || texto.trim() === ''"
                    @click="enviar"
                >
                    {{ enviando ? 'Enviando…' : 'Enviar aviso' }}
                </button>
            </div>
        </template>
    </main>
</template>

<style scoped>
.tela { max-width: 720px; margin: 0 auto; padding: 20px 16px 0; }
.topo { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.voltar { font-size: 1.4rem; background: none; border: 0; padding: 4px 8px; cursor: pointer; color: inherit; }
.codigo { color: var(--cor-texto-suave); }
h1 { margin: 0 0 4px; font-size: 1.4rem; }
.modalidade { margin: 0 0 20px; color: var(--cor-marca); font-size: 0.85rem; }
.ja-avisado {
    background: #fff7ed; border: 1px solid #fed7aa; color: var(--cor-alerta);
    border-radius: var(--raio); padding: 10px 12px; font-size: 0.85rem;
}
h2 {
    margin: 22px 0 10px; font-size: 0.78rem; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--cor-texto-suave);
}
.telefone {
    display: flex; justify-content: space-between; align-items: center;
    width: 100%; padding: 14px; margin-bottom: 8px;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda);
    border-radius: var(--raio); font: inherit; color: inherit; cursor: pointer;
}
.telefone.ativo { border-color: var(--cor-marca); border-width: 2px; }
.rotulo { color: var(--cor-texto-suave); font-size: 0.8rem; }
.mensagem { width: 100%; }
.rodape {
    position: fixed; left: 0; right: 0; bottom: 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--cor-superficie); border-top: 1px solid var(--cor-borda);
}
.enviar {
    width: 100%; padding: 16px; font: inherit; font-weight: 600; font-size: 1rem;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
.enviar:disabled { background: var(--cor-pendente); color: var(--cor-texto-suave); }
.vazio { color: var(--cor-texto-suave); }
.tentar {
    margin-top: 8px; padding: 10px 16px; font: inherit;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
</style>
```

- [ ] **Passo 3: Verificar os estados**

Com `npm start` e `npm run dev:web`, abrir uma receita pela lista e conferir:

- telefones aparecem formatados, e o primeiro vem selecionado
- cliente sem telefone mostra a mensagem própria, e o botão fica desabilitado
- receita já avisada mostra o aviso de repetição
- código inexistente (`/receita/999999`) mostra o erro com o caminho de volta
- enviar mostra o toast e volta para a lista

- [ ] **Passo 4: Commit**

```bash
git add web/src/api/receita.ts web/src/telas/Receita.vue
git commit -m "feat: tela da receita com escolha de telefone e envio"
```

---

## Critério de conclusão da Parte 4

- [ ] `npm test` passa 65 testes
- [ ] Credenciais gravadas cifradas; a leitura devolve mascarado
- [ ] Envio real chega no número de teste pela API do whatsmeow
- [ ] Template com variável inexistente devolve `422` e **não envia**
- [ ] Saudação corresponde à hora do **envio**, não da busca
- [ ] Nenhum código novo referencia `process.env.API_URL`
- [ ] Nada enviado para número de cliente real durante a verificação

## O que fica para a Parte 6

A tela de configurações que edita `canal_config` e `templates`. Até lá, as duas
coleções são semeadas pelos scripts. **A tela vem depois da Parte 5 (usuários)
de propósito:** ela expõe a credencial de envio, e hoje a única proteção é o
filtro de IP, que tem bypass comprovado.
