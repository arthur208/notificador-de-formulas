# Parte 6 — Configurações e Cadastro de Cidades

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa.

**Goal:** Dar à farmácia o controle das configurações do canal, dos textos das
mensagens e dos prazos por cidade, sem depender de acesso ao servidor.

**Architecture:** Endpoints protegidos por papel (`gestor` edita conteúdo,
`admin` edita credencial), cada alteração passando pela auditoria. A tela é a
primeira pensada para desktop: ninguém cadastra dezenas de cidades no celular.
O editor de template mostra prévia ao lado e recusa salvar template que use
variável inexistente.

**Tech Stack:** Express 5.1.0, MongoDB 6.20.0, Vue 3.5.41, PrimeVue 4.5.5.

**Spec:** `docs/superpowers/specs/2026-08-18-canal-whatsmeow-spec.md` (Escopos B
e C, decisões D4, D6, D7, D11)

## Global Constraints

- **Credencial é papel `admin`; conteúdo é `gestor`.** Prazo de entrega é
  editável por gestor e admin (decisão D7).
- **Toda alteração é auditada**, com os segredos já mascarados pela
  `auditoriaService.limparSegredos`.
- **A API de leitura nunca devolve segredo em texto.**
- **Template não salva** se citar variável que a modalidade não oferece.
- Prazo é expresso em **dias úteis** (decisão D4) e entra como `{{dias}}`.
- Cidade casa por `CODIGOCID` inteiro — **não há matching textual**.
- Commits em português, prefixo convencional.

---

### Task 1: Endpoints de canal e templates

**Files:**
- Create: `controllers/configController.js`
- Create: `routes/config.js`
- Create: `test/configController.test.js`
- Modify: `index.js` (registra `/api/config`)
- Modify: `services/templateService.js` (acrescenta escrita e catálogo)

**Interfaces:**
- Produces: `GET /api/config/canal` (admin), `PUT /api/config/canal` (admin)
- Produces: `GET /api/config/templates` (gestor), `PUT /api/config/templates/:modalidade` (gestor)
- Produces: `VARIAVEIS_POR_MODALIDADE` e `validarTemplate(modalidade, corpo, extras?) → string[]` (variáveis inválidas)
- Consumes: `canalConfigService`, `templateService`, `auditoriaService`, `exigirPapel` (Parte 5).

- [ ] **Passo 1: Escrever os testes de validação**

Criar `test/configController.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { validarTemplate, VARIAVEIS_POR_MODALIDADE } = require('../services/templateService');

test('aceita template que só usa variáveis da modalidade', () => {
    const invalidas = validarTemplate('entrega', 'Olá {{nome}}, chega em {{dias}} dias úteis.');
    assert.deepStrictEqual(invalidas, []);
});

test('aponta variável que não existe na modalidade', () => {
    const invalidas = validarTemplate('retirada', 'Retire {{local}} em {{dias}} dias.');
    assert.deepStrictEqual(invalidas.sort(), ['dias', 'local']);
});

test('as globais valem em qualquer modalidade', () => {
    for (const modalidade of Object.keys(VARIAVEIS_POR_MODALIDADE)) {
        const invalidas = validarTemplate(modalidade, '{{saudacao}} {{nome}} {{codigo}} {{qtdFormulas}}');
        assert.deepStrictEqual(invalidas, [], `falhou em ${modalidade}`);
    }
});

test('variáveis livres declaradas passam a valer', () => {
    const invalidas = validarTemplate('convenio', 'Atende {{horario}}.', ['horario']);
    assert.deepStrictEqual(invalidas, []);
});

test('template sem variável nenhuma é válido', () => {
    assert.deepStrictEqual(validarTemplate('retirada', 'Sua fórmula está pronta.'), []);
});

test('modalidade desconhecida recusa tudo', () => {
    assert.throws(() => validarTemplate('inexistente', '{{nome}}'), /modalidade/i);
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA — `validarTemplate` ainda não existe.

- [ ] **Passo 3: Acrescentar o catálogo e a validação**

Em `services/templateService.js`, antes do `module.exports`:

```js
const { variaveisUsadas } = require('../utils/template');

const VARIAVEIS_GLOBAIS = ['saudacao', 'nome', 'codigo', 'qtdFormulas'];

const VARIAVEIS_POR_MODALIDADE = {
    retirada: [],
    entrega: ['endereco', 'cidade', 'dias'],
    convenio: ['local', 'dias'],
};

// Devolve as variáveis citadas que a modalidade não oferece.
// Vazio significa que o template pode ser salvo.
function validarTemplate(modalidade, corpo, extras = []) {
    const disponiveis = VARIAVEIS_POR_MODALIDADE[modalidade];
    if (!disponiveis) throw new Error(`Modalidade desconhecida: ${modalidade}`);

    const permitidas = new Set([...VARIAVEIS_GLOBAIS, ...disponiveis, ...extras]);
    return variaveisUsadas(corpo).filter((nome) => !permitidas.has(nome));
}

async function salvarTemplate(modalidade, { titulo, corpo }) {
    await getDb().collection(COLECAO).updateOne(
        { modalidade },
        { $set: { modalidade, titulo, corpo, atualizadoEm: new Date() }, $inc: { versao: 1 } },
        { upsert: true }
    );
}

async function listarTemplates() {
    return getDb().collection(COLECAO).find({}).toArray();
}
```

Acrescentar ao `module.exports`: `validarTemplate`, `salvarTemplate`,
`listarTemplates`, `VARIAVEIS_POR_MODALIDADE`, `VARIAVEIS_GLOBAIS`.

- [ ] **Passo 4: Escrever o controller**

Criar `controllers/configController.js`:

```js
const canalConfigService = require('../services/canalConfigService');
const templateService = require('../services/templateService');
const auditoria = require('../services/auditoriaService');

async function lerCanal(req, res) {
    const canal = await canalConfigService.carregarCanal();
    res.json({ canal: canalConfigService.canalParaExibicao(canal) });
}

async function gravarCanal(req, res) {
    const anterior = await canalConfigService.carregarCanal();
    const { canal, token, clientId, clientSecret, numeroRemetente, botoesAtivos, ativo } = req.body || {};

    // Campo em branco significa "não mexer" — a tela nunca recebe o valor
    // cheio de volta, então não teria como reenviá-lo.
    const novo = {
        canal: canal || anterior?.canal || 'whatsmeow',
        token: token || anterior?.token,
        clientId: clientId || anterior?.clientId,
        clientSecret: clientSecret || anterior?.clientSecret,
        numeroRemetente: numeroRemetente ?? anterior?.numeroRemetente,
        botoesAtivos: Boolean(botoesAtivos),
        ativo: ativo !== false,
    };

    await canalConfigService.salvarCanal(novo);
    await auditoria.registrar({
        usuario: req.usuario, acao: 'atualizar', entidade: 'canal_config',
        valorAnterior: anterior, valorNovo: novo,
    });

    res.json({ canal: canalConfigService.canalParaExibicao(novo) });
}

async function lerTemplates(_req, res) {
    res.json({
        templates: await templateService.listarTemplates(),
        variaveis: {
            globais: templateService.VARIAVEIS_GLOBAIS,
            porModalidade: templateService.VARIAVEIS_POR_MODALIDADE,
        },
    });
}

async function gravarTemplate(req, res) {
    const { modalidade } = req.params;
    const { titulo, corpo } = req.body || {};

    if (!corpo || corpo.trim() === '') {
        return res.status(400).json({ erro: 'O texto da mensagem não pode ficar vazio.' });
    }

    let invalidas;
    try {
        invalidas = templateService.validarTemplate(modalidade, corpo);
    } catch {
        return res.status(400).json({ erro: `Modalidade desconhecida: ${modalidade}.` });
    }

    if (invalidas.length > 0) {
        return res.status(400).json({
            erro: `Estas variáveis não existem em "${modalidade}": ${invalidas.join(', ')}.`,
            invalidas,
        });
    }

    const anterior = await templateService.carregarTemplate(modalidade);
    await templateService.salvarTemplate(modalidade, { titulo, corpo });
    await auditoria.registrar({
        usuario: req.usuario, acao: 'atualizar', entidade: 'template',
        entidadeId: modalidade, valorAnterior: anterior, valorNovo: { titulo, corpo },
    });

    res.json({ ok: true });
}

module.exports = { lerCanal, gravarCanal, lerTemplates, gravarTemplate };
```

- [ ] **Passo 5: Registrar as rotas**

Criar `routes/config.js`:

```js
const express = require('express');
const router = express.Router();
const { exigirPapel } = require('../middleware/autenticacao');
const c = require('../controllers/configController');
const cid = require('../controllers/cidadesController');

// Credencial é coisa de admin. Conteúdo é de gestor.
router.get('/canal', exigirPapel('admin'), c.lerCanal);
router.put('/canal', exigirPapel('admin'), c.gravarCanal);

router.get('/templates', exigirPapel('gestor'), c.lerTemplates);
router.put('/templates/:modalidade', exigirPapel('gestor'), c.gravarTemplate);

router.get('/cidades', exigirPapel('gestor'), cid.listar);
router.put('/cidades/:codigoCid', exigirPapel('gestor'), cid.gravar);
router.delete('/cidades/:codigoCid', exigirPapel('gestor'), cid.remover);
router.get('/cidades/sugestoes', exigirPapel('gestor'), cid.sugestoes);

module.exports = router;
```

Em `index.js`, junto das outras rotas:

```js
app.use('/api/config', require('./routes/config'));
```

- [ ] **Passo 6: Rodar e commitar**

Rodar: `npm test` — esperado 92 testes passando.

```bash
git add controllers/configController.js routes/config.js test/configController.test.js services/templateService.js index.js
git commit -m "feat: endpoints de canal e templates com auditoria"
```

---

### Task 2: Cadastro de cidades e prazos

**Files:**
- Create: `services/cidadeService.js`
- Create: `controllers/cidadesController.js`
- Modify: `services/firebirdService.js` (acrescenta `cidadesComEntregaRecente`)

**Interfaces:**
- Produces: `listarCidades()`, `salvarCidade(codigoCid, dados)`, `removerCidade(codigoCid)`
- Produces: `resolverPrazo(codigoCid) → Promise<{dias, templateId} | null>`
- Produces: `cidadesComEntregaRecente(meses) → Promise<Array<{codigoCid, nome, uf, entregas}>>`

- [ ] **Passo 1: Consultar as cidades reais do ERP**

Em `services/firebirdService.js`, antes do `module.exports`:

```js
// Cidades que apareceram em entregas recentes. Alimenta o aviso da tela
// sobre cidades ainda não cadastradas — o buraco precisa ser visível.
async function cidadesComEntregaRecente(meses = 12) {
    const sql = `
        SELECT C.CODIGOCID, MAX(C.NOMECID) AS NOME, MAX(C.UFCID) AS UF, COUNT(*) AS ENTREGAS
        FROM ROMANEIO RO
        JOIN CIDADES C ON C.CODIGOCID = RO.CODIGOCID
        WHERE RO.DATAENTREGA >= CURRENT_DATE - ? AND RO.DATAENTREGA <= CURRENT_DATE
        GROUP BY C.CODIGOCID
        ORDER BY 4 DESC
    `;
    const linhas = await queryFb(sql, [Math.round(meses * 30)]);
    return linhas.map((l) => ({
        codigoCid: Number(l.CODIGOCID),
        nome: toTitleCase(decodeFBString(l.NOME)),
        uf: decodeFBString(l.UF),
        entregas: Number(l.ENTREGAS),
    }));
}
```

Incluir no `module.exports`.

- [ ] **Passo 2: Criar o serviço**

Criar `services/cidadeService.js`:

```js
const { getDb } = require('../config/db');

const COLECAO = 'cidades_entrega';

function colecao() {
    return getDb().collection(COLECAO);
}

async function garantirIndices() {
    await colecao().createIndex({ codigoCid: 1 }, { unique: true });
}

async function listarCidades() {
    return colecao().find({}).sort({ nome: 1 }).toArray();
}

async function salvarCidade(codigoCid, { nome, uf, dias, templateId, ativo }) {
    const codigo = Number(codigoCid);
    if (!Number.isInteger(codigo)) throw new Error('Código de cidade inválido.');

    const diasNumero = Number(dias);
    if (!Number.isInteger(diasNumero) || diasNumero < 0) {
        throw new Error('Informe o prazo em dias úteis, um número inteiro.');
    }

    await colecao().updateOne(
        { codigoCid: codigo },
        {
            $set: {
                codigoCid: codigo, nome, uf,
                dias: diasNumero,
                templateId: templateId || null,
                ativo: ativo !== false,
                atualizadoEm: new Date(),
            },
        },
        { upsert: true }
    );
}

async function removerCidade(codigoCid) {
    await colecao().deleteOne({ codigoCid: Number(codigoCid) });
}

// Fallback deliberado: cidade não cadastrada NÃO ganha prazo genérico.
// A mensagem sai sem a frase de prazo em vez de prometer o que não sabemos.
async function resolverPrazo(codigoCid) {
    if (codigoCid === null || codigoCid === undefined) return null;
    const cidade = await colecao().findOne({ codigoCid: Number(codigoCid), ativo: true });
    if (!cidade) return null;
    return { dias: cidade.dias, templateId: cidade.templateId ?? null };
}

module.exports = {
    listarCidades, salvarCidade, removerCidade, resolverPrazo, garantirIndices,
};
```

- [ ] **Passo 3: Criar o controller**

Criar `controllers/cidadesController.js`:

```js
const cidadeService = require('../services/cidadeService');
const firebirdService = require('../services/firebirdService');
const auditoria = require('../services/auditoriaService');

async function listar(_req, res) {
    res.json({ cidades: await cidadeService.listarCidades() });
}

async function gravar(req, res) {
    const { codigoCid } = req.params;
    try {
        const anterior = await cidadeService.resolverPrazo(codigoCid);
        await cidadeService.salvarCidade(codigoCid, req.body || {});
        await auditoria.registrar({
            usuario: req.usuario, acao: 'atualizar', entidade: 'cidade',
            entidadeId: Number(codigoCid), valorAnterior: anterior, valorNovo: req.body,
        });
        res.json({ ok: true });
    } catch (erro) {
        res.status(400).json({ erro: erro.message });
    }
}

async function remover(req, res) {
    const { codigoCid } = req.params;
    await cidadeService.removerCidade(codigoCid);
    await auditoria.registrar({
        usuario: req.usuario, acao: 'remover', entidade: 'cidade',
        entidadeId: Number(codigoCid),
    });
    res.json({ ok: true });
}

// Cidades com entrega recente que ainda não foram cadastradas.
async function sugestoes(_req, res) {
    try {
        const [doErp, cadastradas] = await Promise.all([
            firebirdService.cidadesComEntregaRecente(12),
            cidadeService.listarCidades(),
        ]);
        const jaTem = new Set(cadastradas.map((c) => c.codigoCid));
        res.json({ sugestoes: doErp.filter((c) => !jaTem.has(c.codigoCid)) });
    } catch (erro) {
        console.error('Erro ao buscar sugestões de cidade:', erro);
        res.status(500).json({ erro: 'Não foi possível consultar as cidades do sistema.' });
    }
}

module.exports = { listar, gravar, remover, sugestoes };
```

- [ ] **Passo 4: Registrar índices no arranque**

Em `index.js`, junto dos outros `garantirIndices`:

```js
    await require('./services/cidadeService').garantirIndices();
```

- [ ] **Passo 5: Verificar e commitar**

```bash
npm start
curl -s -b /tmp/cookies.txt http://127.0.0.1:3008/api/config/cidades/sugestoes | head -c 400
```

Esperado: as cidades reais com contagem de entregas — Querência do Norte,
Loanda, Santa Cruz do Monte Castelo e assim por diante.

```bash
git add services/cidadeService.js controllers/cidadesController.js services/firebirdService.js index.js
git commit -m "feat: cadastro de cidades com prazo em dias úteis"
```

---

### Task 3: Ligar o prazo da cidade ao envio

**Files:**
- Modify: `controllers/messageController.js` (a função `montarMensagem`)

**Interfaces:**
- Consumes: `resolverPrazo` (Task 2), `carregarTemplate` (Parte 4).

- [ ] **Passo 1: Usar o prazo e o template da cidade**

Em `controllers/messageController.js`, substituir a função `montarMensagem` por:

```js
const cidadeService = require('../services/cidadeService');

async function montarMensagem(codigoReceita, nomeCliente) {
    const { isDelivery, deliveryAddress } = await firebirdService.getDeliveryData(codigoReceita);
    const modalidade = isDelivery ? 'entrega' : 'retirada';

    // Loanda tem texto próprio (decisão D11). O mecanismo é override por
    // cidade: hoje só ela usa, mas qualquer cidade pode ganhar o seu.
    const prazo = isDelivery ? await cidadeService.resolverPrazo(deliveryAddress?.codigoCid) : null;
    const template = await templateService.carregarTemplate(prazo?.templateId || modalidade);

    const valores = {
        saudacao: getSaudacao(),
        nome: toTitleCase(nomeCliente),
        codigo: codigoReceita,
        qtdFormulas: await firebirdService.contarFormulas(codigoReceita),
        endereco: montarEndereco(deliveryAddress) || undefined,
        cidade: deliveryAddress?.cidade || undefined,
        // Cidade não cadastrada deixa {{dias}} ausente de propósito:
        // o template que promete prazo falha e avisa, em vez de inventar.
        dias: prazo?.dias,
    };

    return { texto: renderizar(template.corpo, valores), modalidade };
}
```

- [ ] **Passo 2: Verificar os dois caminhos**

Cadastrar Loanda com `dias: 1` e enviar para uma receita de entrega em Loanda:
a mensagem sai com "1". Enviar para uma receita de cidade **não cadastrada**
usando o template de entrega padrão que cita `{{dias}}`: deve devolver `422`
apontando `dias` — comprovando que o sistema não inventa prazo.

- [ ] **Passo 3: Commit**

```bash
git add controllers/messageController.js
git commit -m "feat: usar prazo e template da cidade no envio"
```

---

### Task 4: Tela de configurações

**Files:**
- Create: `web/src/api/config.ts`
- Create: `web/src/telas/Configuracoes.vue` (substitui o stub)
- Create: `web/src/componentes/EditorTemplate.vue`
- Create: `web/src/componentes/GradeCidades.vue`

**Interfaces:**
- Consumes: `buscarJson` (Parte 3), `podeGerir` e `ehAdmin` (Parte 5).

- [ ] **Passo 1: Criar o acesso à API**

Criar `web/src/api/config.ts`:

```ts
import { buscarJson } from './cliente';

export type Modalidade = 'retirada' | 'entrega' | 'convenio';
export type Template = { modalidade: Modalidade; titulo: string; corpo: string; versao?: number };
export type Cidade = { codigoCid: number; nome: string; uf: string; dias: number; templateId: string | null; ativo: boolean };
export type Sugestao = { codigoCid: number; nome: string; uf: string; entregas: number };

export type Variaveis = { globais: string[]; porModalidade: Record<Modalidade, string[]> };

export function lerTemplates(): Promise<{ templates: Template[]; variaveis: Variaveis }> {
    return buscarJson('/api/config/templates');
}

export function lerCidades(): Promise<{ cidades: Cidade[] }> {
    return buscarJson('/api/config/cidades');
}

export function lerSugestoes(): Promise<{ sugestoes: Sugestao[] }> {
    return buscarJson('/api/config/cidades/sugestoes');
}

async function enviar(metodo: string, caminho: string, corpo?: unknown): Promise<void> {
    const resposta = await fetch(caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados?.erro || 'Não foi possível salvar.');
    }
}

export const salvarTemplate = (m: Modalidade, dados: { titulo: string; corpo: string }) =>
    enviar('PUT', `/api/config/templates/${m}`, dados);

export const salvarCidade = (codigoCid: number, dados: Partial<Cidade>) =>
    enviar('PUT', `/api/config/cidades/${codigoCid}`, dados);

export const removerCidade = (codigoCid: number) =>
    enviar('DELETE', `/api/config/cidades/${codigoCid}`);
```

- [ ] **Passo 2: Criar o editor de template com prévia**

Criar `web/src/componentes/EditorTemplate.vue`:

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Textarea from 'primevue/textarea';
import { salvarTemplate, type Modalidade, type Template } from '@/api/config';

const props = defineProps<{
    template: Template;
    variaveisDisponiveis: string[];
}>();

const corpo = ref(props.template.corpo);
const salvando = ref(false);
const erro = ref<string | null>(null);
const salvo = ref(false);

watch(() => props.template, (novo) => { corpo.value = novo.corpo; });

// Valores de exemplo só para a prévia — nunca vão para o envio.
const EXEMPLO: Record<string, string> = {
    saudacao: 'Bom dia', nome: 'Gracileia Rosa Tomiello', codigo: '441433',
    qtdFormulas: '4', endereco: 'Rua das Palmeiras, 123 - Centro - Loanda/PR',
    cidade: 'Loanda', dias: '2', local: 'na Farmácia Porto Rico',
    horario: 'Seg a Sex, 8h às 18h',
};

const previa = computed(() =>
    corpo.value.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g,
        (achado, nome) => EXEMPLO[nome] ?? achado)
);

function inserir(nome: string) {
    corpo.value += `{{${nome}}}`;
}

async function guardar() {
    salvando.value = true;
    erro.value = null;
    salvo.value = false;
    try {
        await salvarTemplate(props.template.modalidade as Modalidade, {
            titulo: props.template.titulo, corpo: corpo.value,
        });
        salvo.value = true;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível salvar.';
    } finally {
        salvando.value = false;
    }
}
</script>

<template>
    <div class="editor">
        <div class="coluna">
            <h3>Texto</h3>
            <Textarea v-model="corpo" auto-resize rows="12" class="campo" />

            <p class="dica">Clique para inserir:</p>
            <div class="chips">
                <button
                    v-for="nome in variaveisDisponiveis"
                    :key="nome"
                    type="button"
                    class="chip"
                    @click="inserir(nome)"
                >{{ '{{' + nome + '}}' }}</button>
            </div>
        </div>

        <div class="coluna">
            <h3>Prévia</h3>
            <pre class="previa">{{ previa }}</pre>
        </div>

        <div class="acoes">
            <button type="button" class="salvar" :disabled="salvando" @click="guardar">
                {{ salvando ? 'Salvando…' : 'Salvar texto' }}
            </button>
            <span v-if="salvo" class="ok">Salvo.</span>
            <span v-if="erro" class="erro">{{ erro }}</span>
        </div>
    </div>
</template>

<style scoped>
.editor { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.acoes { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
h3 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--cor-texto-suave); }
.campo { width: 100%; font-family: var(--fonte-dados); font-size: 0.9rem; }
.previa {
    white-space: pre-wrap; word-break: break-word; margin: 0;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda);
    border-radius: var(--raio); padding: 14px; min-height: 240px; font: inherit;
}
.dica { font-size: 0.8rem; color: var(--cor-texto-suave); margin: 12px 0 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
    font-family: var(--fonte-dados); font-size: 0.78rem;
    background: var(--cor-fundo); border: 1px solid var(--cor-borda);
    border-radius: 20px; padding: 4px 10px; cursor: pointer; color: inherit;
}
.salvar {
    padding: 12px 22px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
.ok { color: var(--cor-completo); font-size: 0.85rem; }
.erro { color: #b91c1c; font-size: 0.85rem; }

@media (max-width: 720px) {
    .editor { grid-template-columns: 1fr; }
}
</style>
```

- [ ] **Passo 3: Criar a grade de cidades**

Criar `web/src/componentes/GradeCidades.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { lerCidades, lerSugestoes, salvarCidade, removerCidade, type Cidade, type Sugestao } from '@/api/config';

const cidades = ref<Cidade[]>([]);
const sugestoes = ref<Sugestao[]>([]);
const carregando = ref(true);
const erro = ref<string | null>(null);

async function recarregar() {
    carregando.value = true;
    try {
        const [a, b] = await Promise.all([lerCidades(), lerSugestoes()]);
        cidades.value = a.cidades;
        sugestoes.value = b.sugestoes;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
    } finally {
        carregando.value = false;
    }
}

onMounted(recarregar);

async function guardar(cidade: Cidade) {
    try {
        await salvarCidade(cidade.codigoCid, cidade);
    } catch (e) {
        erro.value = e instanceof Error ? e.message : null;
    }
}

async function adicionar(sugestao: Sugestao) {
    await salvarCidade(sugestao.codigoCid, {
        nome: sugestao.nome, uf: sugestao.uf, dias: 2, templateId: null, ativo: true,
    });
    await recarregar();
}

async function apagar(codigoCid: number) {
    await removerCidade(codigoCid);
    await recarregar();
}
</script>

<template>
    <div>
        <p v-if="erro" class="erro">{{ erro }}</p>

        <p v-if="!carregando && sugestoes.length > 0" class="alerta">
            Estas cidades tiveram entrega nos últimos 12 meses e ainda não têm prazo cadastrado.
            Sem cadastro, a mensagem sai sem promessa de prazo.
        </p>
        <div class="sugestoes">
            <button
                v-for="s in sugestoes"
                :key="s.codigoCid"
                type="button"
                class="sugestao"
                @click="adicionar(s)"
            >+ {{ s.nome }}/{{ s.uf }} <span class="qtd">{{ s.entregas }} entregas</span></button>
        </div>

        <table class="grade">
            <thead>
                <tr><th>Cidade</th><th>UF</th><th>Prazo (dias úteis)</th><th>Ativa</th><th></th></tr>
            </thead>
            <tbody>
                <tr v-for="cidade in cidades" :key="cidade.codigoCid">
                    <td>{{ cidade.nome }}</td>
                    <td>{{ cidade.uf }}</td>
                    <td>
                        <input v-model.number="cidade.dias" type="number" min="0" class="dias"
                               @change="guardar(cidade)">
                    </td>
                    <td>
                        <input v-model="cidade.ativo" type="checkbox" @change="guardar(cidade)">
                    </td>
                    <td><button type="button" class="remover" @click="apagar(cidade.codigoCid)">remover</button></td>
                </tr>
                <tr v-if="!carregando && cidades.length === 0">
                    <td colspan="5" class="vazio">Nenhuma cidade cadastrada ainda.</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.alerta {
    background: #fff7ed; border: 1px solid #fed7aa; color: var(--cor-alerta);
    border-radius: var(--raio); padding: 10px 12px; font-size: 0.85rem;
}
.sugestoes { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.sugestao {
    background: var(--cor-superficie); border: 1px dashed var(--cor-borda);
    border-radius: 20px; padding: 6px 12px; font: inherit; font-size: 0.85rem; cursor: pointer;
}
.qtd { color: var(--cor-texto-suave); font-size: 0.78rem; }
.grade { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--cor-borda); }
th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cor-texto-suave); }
.dias { width: 72px; padding: 6px; font: inherit; border: 1px solid var(--cor-borda); border-radius: 6px; }
.remover { background: none; border: 0; color: #b91c1c; font: inherit; cursor: pointer; }
.vazio { color: var(--cor-texto-suave); }
.erro { color: #b91c1c; }
</style>
```

- [ ] **Passo 4: Montar a tela**

Substituir `web/src/telas/Configuracoes.vue` por:

```vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import EditorTemplate from '@/componentes/EditorTemplate.vue';
import GradeCidades from '@/componentes/GradeCidades.vue';
import { lerTemplates, type Template, type Variaveis, type Modalidade } from '@/api/config';
import { podeGerir, ehAdmin } from '@/estado/sessao';

const secao = ref<'templates' | 'cidades' | 'conexao'>('templates');
const templates = ref<Template[]>([]);
const variaveis = ref<Variaveis | null>(null);
const modalidadeAtiva = ref<Modalidade>('retirada');

const templateAtivo = computed(() =>
    templates.value.find((t) => t.modalidade === modalidadeAtiva.value) ?? null
);

const variaveisDaModalidade = computed(() => {
    if (!variaveis.value) return [];
    return [
        ...variaveis.value.globais,
        ...(variaveis.value.porModalidade[modalidadeAtiva.value] ?? []),
    ];
});

onMounted(async () => {
    if (!podeGerir()) return;
    const dados = await lerTemplates();
    templates.value = dados.templates;
    variaveis.value = dados.variaveis;
});
</script>

<template>
    <main class="tela">
        <h1>Configurações</h1>

        <p v-if="!podeGerir()" class="sem-permissao">
            Seu perfil não permite alterar configurações. Fale com um gestor.
        </p>

        <template v-else>
            <nav class="abas">
                <button type="button" :class="{ ativa: secao === 'templates' }" @click="secao = 'templates'">Mensagens</button>
                <button type="button" :class="{ ativa: secao === 'cidades' }" @click="secao = 'cidades'">Cidades e prazos</button>
                <button v-if="ehAdmin()" type="button" :class="{ ativa: secao === 'conexao' }" @click="secao = 'conexao'">Conexão</button>
            </nav>

            <section v-if="secao === 'templates'">
                <nav class="modalidades">
                    <button
                        v-for="t in templates"
                        :key="t.modalidade"
                        type="button"
                        :class="{ ativa: modalidadeAtiva === t.modalidade }"
                        @click="modalidadeAtiva = t.modalidade as Modalidade"
                    >{{ t.modalidade }}</button>
                </nav>
                <EditorTemplate
                    v-if="templateAtivo"
                    :key="templateAtivo.modalidade"
                    :template="templateAtivo"
                    :variaveis-disponiveis="variaveisDaModalidade"
                />
            </section>

            <section v-else-if="secao === 'cidades'">
                <GradeCidades />
            </section>

            <section v-else>
                <p class="aviso-conexao">
                    As credenciais do canal ficam gravadas cifradas e nunca são exibidas por
                    inteiro. Deixe um campo em branco para manter o valor atual.
                </p>
            </section>
        </template>
    </main>
</template>

<style scoped>
.tela { max-width: 1040px; margin: 0 auto; padding: 24px 20px 60px; }
h1 { font-size: 1.5rem; margin: 0 0 20px; }
.abas, .modalidades { display: flex; gap: 4px; margin-bottom: 24px; flex-wrap: wrap; }
.abas button, .modalidades button {
    padding: 10px 16px; font: inherit; cursor: pointer;
    background: transparent; border: 1px solid var(--cor-borda);
    border-radius: var(--raio); color: var(--cor-texto-suave); text-transform: capitalize;
}
.abas button.ativa, .modalidades button.ativa {
    background: var(--cor-superficie); color: var(--cor-texto); border-color: var(--cor-marca);
}
.sem-permissao, .aviso-conexao { color: var(--cor-texto-suave); }
</style>
```

- [ ] **Passo 5: Verificar**

Entrar como `gestor` e confirmar que a aba **Conexão não aparece**. Entrar como
`admin` e confirmar que aparece. Editar um template usando um chip, ver a prévia
mudar, salvar. Tentar salvar com `{{inexistente}}` e confirmar a recusa com a
mensagem apontando a variável.

- [ ] **Passo 6: Commit**

```bash
git add web/src/api/config.ts web/src/telas/Configuracoes.vue web/src/componentes/EditorTemplate.vue web/src/componentes/GradeCidades.vue
git commit -m "feat: tela de configurações com editor de template e cidades"
```

---

## Critério de conclusão da Parte 6

- [ ] `npm test` passa 92 testes
- [ ] Gestor edita template e cidades; **não** vê a aba de conexão
- [ ] Template com variável inexistente é recusado, apontando o nome
- [ ] A prévia mostra o texto renderizado com dados de exemplo
- [ ] Cidades com entrega recente e sem cadastro aparecem como sugestão
- [ ] Cidade cadastrada injeta `{{dias}}`; não cadastrada faz o envio avisar
- [ ] Toda alteração aparece na coleção `auditoria`, sem segredo em texto
