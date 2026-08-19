# Parte 7 — Modalidade Convênio

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa.

**Goal:** Permitir avisar o cliente de que a fórmula foi enviada para um
convênio onde ele retira, com prazo e texto próprios.

**Architecture:** O ERP identifica o convênio do cliente, mas **não** diz que
*esta* receita foi para lá — o vínculo é por pessoa, não por receita. Por isso o
sistema **sugere** a modalidade já marcada e a atendente confirma. A existência
da configuração é a allowlist: convênio sem config nunca dispara a modalidade.

**Tech Stack:** Express 5.1.0, MongoDB 6.20.0, node-firebird 1.1.9, Vue 3.5.41.

**Spec:** `docs/superpowers/specs/2026-08-18-canal-whatsmeow-spec.md` (Escopo D,
decisões D2, D3, D10)

## Global Constraints

- **A existência da config é a allowlist.** Não há flag separada. Convênio sem
  config = cliente comum, sem aviso e sem bloqueio.
- **Convênio sobrepõe tudo** — cidade e a flag entrega/retirada (decisão D3).
- **A atendente confirma.** O sistema nunca decide sozinho (decisão D10).
- **`nomeExibicao` inclui a preposição** — "na Farmácia Porto Rico", "no HPNL".
  Preposição fixa no template erra em boa parte da lista real.
- Cliente com dois convênios configurados: **a tela pergunta**, não escolhe.
- Commits em português, prefixo convencional.

## Dados medidos em produção (2026-08-18)

| Fato | Valor |
|---|---|
| Convênios ativos em `TABELASIMPLES` | 97 |
| Receitas conferidas com vínculo de convênio | 42 de 114 (37%) |
| Desses, plausivelmente local de retirada | 8 |
| Maior ocorrência | `ASSINA CP S/ DESC.` com 15 — **categoria de desconto** |
| Pessoas com dois convênios | 17 (de 15.123) |

Tratar "tem convênio" como "vai para o convênio" erraria em ~80% dos casos.

---

### Task 1: Ler os convênios do ERP

**Files:**
- Modify: `services/firebirdService.js` (acrescenta duas funções)

**Interfaces:**
- Produces: `listarConvenios() → Promise<Array<{codigoTs, nome}>>`
- Produces: `conveniosDoCliente(codigoReceita) → Promise<Array<{codigoTs, nome}>>`

- [ ] **Passo 1: Acrescentar as consultas**

Em `services/firebirdService.js`, antes do `module.exports`:

```js
// Os convênios vivem em TABELASIMPLES com TIPO='CONVENIO' — a tabela
// CONVENIOS existe mas está vazia. São 97 ativos, misturando local de
// retirada, categoria de desconto e pessoa física; a curadoria de quais
// são destino real é feita pelo cadastro (Task 2).
async function listarConvenios() {
    const sql = `
        SELECT CODIGOTS, NOME FROM TABELASIMPLES
        WHERE TIPO = 'CONVENIO' AND STATUS = 'A'
        ORDER BY NOME
    `;
    const linhas = await queryFb(sql, []);
    return linhas.map((l) => ({
        codigoTs: Number(l.CODIGOTS),
        nome: decodeFBString(l.NOME),
    }));
}

// O vínculo é do CLIENTE, não da receita: quem é conveniado carrega o
// vínculo em todas as suas receitas. Serve como sugestão, nunca como decisão.
async function conveniosDoCliente(codigoReceita) {
    const sql = `
        SELECT DISTINCT TS.CODIGOTS, TS.NOME
        FROM RECCLIENTE RC
        JOIN PESSOACONVENIO PC ON PC.CODIGOPES = RC.CODIGOPES
        JOIN TABELASIMPLES TS ON TS.CODIGOTS = PC.CODIGOCONVENIO AND TS.TIPO = 'CONVENIO'
        WHERE RC.CODIGOREC = ?
    `;
    const linhas = await queryFb(sql, [codigoReceita]);
    return linhas.map((l) => ({
        codigoTs: Number(l.CODIGOTS),
        nome: decodeFBString(l.NOME),
    }));
}
```

Incluir ambas no `module.exports`.

- [ ] **Passo 2: Verificar contra o banco**

```bash
node -e "
require('dotenv').config();
const s = require('./services/firebirdService');
(async () => {
  const todos = await s.listarConvenios();
  console.log('convênios ativos:', todos.length);
  console.log('amostra:', todos.slice(0, 3).map(c => c.nome).join(' | '));
  const doCliente = await s.conveniosDoCliente(441433);
  console.log('da receita 441433:', JSON.stringify(doCliente));
  process.exit(0);
})();"
```

Esperado: 97 convênios, e a amostra trazendo nomes reais.

- [ ] **Passo 3: Commit**

```bash
git add services/firebirdService.js
git commit -m "feat: ler convênios do ERP a partir de TABELASIMPLES"
```

---

### Task 2: Cadastro de convênios

**Files:**
- Create: `services/convenioService.js`
- Create: `controllers/conveniosController.js`
- Create: `test/convenio.test.js`
- Modify: `routes/config.js`
- Modify: `index.js` (índices)

**Interfaces:**
- Produces: `listarConfiguracoes()`, `salvarConvenio(codigoTs, dados)`, `removerConvenio(codigoTs)`
- Produces: `buscarConfiguracao(codigoTs) → Promise<config|null>`
- Produces: `variaveisDoConvenio(config) → Record<string,string>`
- Produces: `GET/PUT/DELETE /api/config/convenios`

- [ ] **Passo 1: Escrever os testes**

Criar `test/convenio.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { variaveisDoConvenio } = require('../services/convenioService');

test('monta local e dias a partir da configuração', () => {
    const valores = variaveisDoConvenio({
        nomeExibicao: 'na Farmácia Porto Rico', dias: 3, variaveis: [],
    });
    assert.strictEqual(valores.local, 'na Farmácia Porto Rico');
    assert.strictEqual(valores.dias, 3);
});

test('inclui as variáveis livres', () => {
    const valores = variaveisDoConvenio({
        nomeExibicao: 'no HPNL', dias: 2,
        variaveis: [{ chave: 'horario', valor: 'Seg a Sex, 8h às 18h' }],
    });
    assert.strictEqual(valores.horario, 'Seg a Sex, 8h às 18h');
});

test('variável livre não sobrescreve reservada', () => {
    const valores = variaveisDoConvenio({
        nomeExibicao: 'na Farmácia União', dias: 1,
        variaveis: [{ chave: 'local', valor: 'INVASOR' }, { chave: 'nome', valor: 'INVASOR' }],
    });
    assert.strictEqual(valores.local, 'na Farmácia União');
    assert.strictEqual(valores.nome, undefined);
});

test('configuração nula devolve objeto vazio', () => {
    assert.deepStrictEqual(variaveisDoConvenio(null), {});
});

test('sem variáveis livres não quebra', () => {
    const valores = variaveisDoConvenio({ nomeExibicao: 'no Sindicato', dias: 5 });
    assert.strictEqual(valores.local, 'no Sindicato');
});
```

- [ ] **Passo 2: Rodar para ver falhar**

Rodar: `npm test`
Esperado: FALHA com `Cannot find module '../services/convenioService'`

- [ ] **Passo 3: Implementar o serviço**

Criar `services/convenioService.js`:

```js
const { getDb } = require('../config/db');

const COLECAO = 'convenios';
// Variáveis livres não podem sombrear estas — a validação impede na gravação,
// e a montagem ignora por segurança.
const RESERVADAS = new Set(['saudacao', 'nome', 'codigo', 'qtdFormulas', 'endereco', 'cidade', 'local', 'dias']);

function colecao() {
    return getDb().collection(COLECAO);
}

async function garantirIndices() {
    await colecao().createIndex({ codigoTs: 1 }, { unique: true });
}

async function listarConfiguracoes() {
    return colecao().find({}).sort({ nomeErp: 1 }).toArray();
}

async function buscarConfiguracao(codigoTs) {
    return colecao().findOne({ codigoTs: Number(codigoTs), ativo: true });
}

async function salvarConvenio(codigoTs, { nomeErp, nomeExibicao, dias, variaveis, templateId, ativo }) {
    const codigo = Number(codigoTs);
    if (!Number.isInteger(codigo)) throw new Error('Código de convênio inválido.');
    if (!nomeExibicao || String(nomeExibicao).trim() === '') {
        throw new Error('Informe como o convênio aparece na mensagem, com a preposição. Ex.: "na Farmácia Porto Rico".');
    }

    const diasNumero = Number(dias);
    if (!Number.isInteger(diasNumero) || diasNumero < 0) {
        throw new Error('Informe o prazo em dias úteis, um número inteiro.');
    }

    const livres = Array.isArray(variaveis) ? variaveis : [];
    for (const { chave } of livres) {
        if (RESERVADAS.has(chave)) {
            throw new Error(`"${chave}" é uma variável do sistema. Escolha outro nome.`);
        }
    }

    await colecao().updateOne(
        { codigoTs: codigo },
        {
            $set: {
                codigoTs: codigo, nomeErp, nomeExibicao: String(nomeExibicao).trim(),
                dias: diasNumero, variaveis: livres,
                templateId: templateId || null, ativo: ativo !== false,
                atualizadoEm: new Date(),
            },
        },
        { upsert: true }
    );
}

async function removerConvenio(codigoTs) {
    await colecao().deleteOne({ codigoTs: Number(codigoTs) });
}

function variaveisDoConvenio(config) {
    if (!config) return {};
    const valores = { local: config.nomeExibicao, dias: config.dias };
    for (const { chave, valor } of config.variaveis ?? []) {
        if (!RESERVADAS.has(chave)) valores[chave] = valor;
    }
    return valores;
}

module.exports = {
    listarConfiguracoes, buscarConfiguracao, salvarConvenio,
    removerConvenio, variaveisDoConvenio, garantirIndices, RESERVADAS,
};
```

- [ ] **Passo 4: Criar o controller**

Criar `controllers/conveniosController.js`:

```js
const convenioService = require('../services/convenioService');
const firebirdService = require('../services/firebirdService');
const auditoria = require('../services/auditoriaService');

// Os 97 do ERP, com a configuração de cada um quando existir.
async function listar(_req, res) {
    try {
        const [doErp, configurados] = await Promise.all([
            firebirdService.listarConvenios(),
            convenioService.listarConfiguracoes(),
        ]);
        const porCodigo = new Map(configurados.map((c) => [c.codigoTs, c]));
        res.json({
            convenios: doErp.map((c) => ({ ...c, config: porCodigo.get(c.codigoTs) ?? null })),
        });
    } catch (erro) {
        console.error('Erro ao listar convênios:', erro);
        res.status(500).json({ erro: 'Não foi possível consultar os convênios do sistema.' });
    }
}

async function gravar(req, res) {
    const { codigoTs } = req.params;
    try {
        const anterior = await convenioService.buscarConfiguracao(codigoTs);
        await convenioService.salvarConvenio(codigoTs, req.body || {});
        await auditoria.registrar({
            usuario: req.usuario, acao: 'atualizar', entidade: 'convenio',
            entidadeId: Number(codigoTs), valorAnterior: anterior, valorNovo: req.body,
        });
        res.json({ ok: true });
    } catch (erro) {
        res.status(400).json({ erro: erro.message });
    }
}

async function remover(req, res) {
    const { codigoTs } = req.params;
    await convenioService.removerConvenio(codigoTs);
    await auditoria.registrar({
        usuario: req.usuario, acao: 'remover', entidade: 'convenio',
        entidadeId: Number(codigoTs),
    });
    res.json({ ok: true });
}

module.exports = { listar, gravar, remover };
```

- [ ] **Passo 5: Registrar rotas e índices**

Em `routes/config.js`:

```js
const conv = require('../controllers/conveniosController');

router.get('/convenios', exigirPapel('gestor'), conv.listar);
router.put('/convenios/:codigoTs', exigirPapel('gestor'), conv.gravar);
router.delete('/convenios/:codigoTs', exigirPapel('gestor'), conv.remover);
```

Em `index.js`, junto dos outros:

```js
    await require('./services/convenioService').garantirIndices();
```

- [ ] **Passo 6: Rodar e commitar**

Rodar: `npm test` — esperado 97 testes passando.

```bash
git add services/convenioService.js controllers/conveniosController.js test/convenio.test.js routes/config.js index.js
git commit -m "feat: cadastro de convênios com nome de exibição e variáveis livres"
```

---

### Task 3: Sugestão de modalidade e precedência

**Files:**
- Modify: `controllers/recipeController.js` (devolve a sugestão)
- Modify: `controllers/messageController.js` (aplica a precedência)

**Interfaces:**
- Consumes: `conveniosDoCliente` (Task 1), `buscarConfiguracao` e `variaveisDoConvenio` (Task 2).
- Produces: `GET /api/cliente/:codigo` passa a incluir `conveniosSugeridos: Array<{codigoTs, nome, nomeExibicao}>`
- Produces: `POST /api/enviar` passa a aceitar `convenioTs?: number`

- [ ] **Passo 1: Sugerir na busca**

Em `controllers/recipeController.js`, depois de obter `deliveryAddress`:

```js
        // O ERP diz quais convênios o CLIENTE tem. Só entram como sugestão
        // os que têm configuração — a existência da config é a allowlist.
        const vinculos = await firebirdService.conveniosDoCliente(codigoReceita);
        const conveniosSugeridos = [];
        for (const vinculo of vinculos) {
            const config = await convenioService.buscarConfiguracao(vinculo.codigoTs);
            if (config) {
                conveniosSugeridos.push({
                    codigoTs: vinculo.codigoTs,
                    nome: vinculo.nome,
                    nomeExibicao: config.nomeExibicao,
                });
            }
        }
```

E incluir `conveniosSugeridos` na resposta `res.json({ ... })`.

Acrescentar o import no topo:

```js
const convenioService = require('../services/convenioService');
```

- [ ] **Passo 2: Aplicar a precedência no envio**

Em `controllers/messageController.js`, substituir `montarMensagem` por:

```js
const convenioService = require('../services/convenioService');

// Precedência (decisão D3): convênio sobrepõe cidade e a flag
// entrega/retirada. Justificativa do cliente: "se a pessoa é de Porto Rico
// e temos entrega em Porto Rico, mas ela pediu no convênio, entregamos
// no convênio".
async function montarMensagem(codigoReceita, nomeCliente, convenioTs) {
    const comuns = {
        saudacao: getSaudacao(),
        nome: toTitleCase(nomeCliente),
        codigo: codigoReceita,
        qtdFormulas: await firebirdService.contarFormulas(codigoReceita),
    };

    if (convenioTs) {
        const config = await convenioService.buscarConfiguracao(convenioTs);
        if (!config) {
            throw new Error('Este convênio não está configurado. Cadastre em Configurações.');
        }
        const template = await templateService.carregarTemplate(config.templateId || 'convenio');
        return {
            texto: renderizar(template.corpo, { ...comuns, ...convenioService.variaveisDoConvenio(config) }),
            modalidade: 'convenio',
        };
    }

    const { isDelivery, deliveryAddress } = await firebirdService.getDeliveryData(codigoReceita);
    const modalidade = isDelivery ? 'entrega' : 'retirada';
    const prazo = isDelivery ? await cidadeService.resolverPrazo(deliveryAddress?.codigoCid) : null;
    const template = await templateService.carregarTemplate(prazo?.templateId || modalidade);

    return {
        texto: renderizar(template.corpo, {
            ...comuns,
            endereco: montarEndereco(deliveryAddress) || undefined,
            cidade: deliveryAddress?.cidade || undefined,
            dias: prazo?.dias,
        }),
        modalidade,
    };
}
```

E em `sendMessage`, ler o novo campo e repassar:

```js
    const { codigoReceita, telefoneEscolhido, mensagem, nomeCliente, convenioTs } = req.body;
```

```js
            ({ texto: textoFinal } = await montarMensagem(codigoReceita, nomeCliente, convenioTs));
```

- [ ] **Passo 3: Semear o template de convênio**

Em `services/templateService.js`, acrescentar a `TEMPLATES_PADRAO`:

```js
    convenio: {
        titulo: 'Fórmula no convênio',
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'A Farmácia Bioessência informa: Sua receita (Nº {{codigo}}) foi enviada ' +
            'e estará disponível para retirada {{local}} em {{dias}} dias úteis. 💊✅\n\n' +
            'Ficamos à disposição!',
    },
```

Rodar `node scripts/semear-templates.js` para criar a nova modalidade.

- [ ] **Passo 4: Verificar os dois caminhos**

Configurar `FARMACIA PORTO RICO` (código 336) com `nomeExibicao: "na Farmácia
Porto Rico"` e `dias: 3`. Depois:

```bash
# com convênio: sobrepõe cidade e entrega
curl -s -b /tmp/cookies.txt -X POST http://127.0.0.1:3008/api/enviar \
  -H "Content-Type: application/json" \
  -d '{"codigoReceita":441433,"telefoneEscolhido":"SEU_NUMERO","nomeCliente":"Teste","convenioTs":336}'

# sem convênio: segue por entrega/retirada
curl -s -b /tmp/cookies.txt -X POST http://127.0.0.1:3008/api/enviar \
  -H "Content-Type: application/json" \
  -d '{"codigoReceita":441433,"telefoneEscolhido":"SEU_NUMERO","nomeCliente":"Teste"}'
```

Esperado: a primeira mensagem cita "na Farmácia Porto Rico" e ignora a cidade;
a segunda segue o caminho de entrega.

- [ ] **Passo 5: Commit**

```bash
git add controllers/recipeController.js controllers/messageController.js services/templateService.js
git commit -m "feat: modalidade convênio com precedência sobre cidade e entrega"
```

---

### Task 4: Telas do convênio

**Files:**
- Create: `web/src/componentes/GradeConvenios.vue`
- Modify: `web/src/telas/Configuracoes.vue` (nova aba)
- Modify: `web/src/telas/Receita.vue` (chip de sugestão)
- Modify: `web/src/api/config.ts` e `web/src/api/receita.ts`

**Interfaces:**
- Consumes: os endpoints da Task 2 e o campo `conveniosSugeridos` da Task 3.

- [ ] **Passo 1: Acrescentar o acesso à API**

Em `web/src/api/config.ts`:

```ts
export type ConvenioErp = {
    codigoTs: number;
    nome: string;
    config: {
        nomeExibicao: string; dias: number;
        variaveis: { chave: string; valor: string }[];
        ativo: boolean;
    } | null;
};

export function lerConvenios(): Promise<{ convenios: ConvenioErp[] }> {
    return buscarJson('/api/config/convenios');
}

export const salvarConvenio = (codigoTs: number, dados: unknown) =>
    enviar('PUT', `/api/config/convenios/${codigoTs}`, dados);

export const removerConvenio = (codigoTs: number) =>
    enviar('DELETE', `/api/config/convenios/${codigoTs}`);
```

Em `web/src/api/receita.ts`, acrescentar ao tipo `DetalheReceita`:

```ts
    conveniosSugeridos: { codigoTs: number; nome: string; nomeExibicao: string }[];
```

E ao parâmetro de `enviarAviso`:

```ts
    convenioTs?: number;
```

- [ ] **Passo 2: Criar a grade de convênios**

Criar `web/src/componentes/GradeConvenios.vue`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { lerConvenios, salvarConvenio, removerConvenio, type ConvenioErp } from '@/api/config';

const todos = ref<ConvenioErp[]>([]);
const filtro = ref('');
const soConfigurados = ref(false);
const erro = ref<string | null>(null);

const visiveis = computed(() => {
    const busca = filtro.value.trim().toLowerCase();
    return todos.value.filter((c) => {
        if (soConfigurados.value && !c.config) return false;
        return busca === '' || c.nome.toLowerCase().includes(busca);
    });
});

async function recarregar() {
    try {
        todos.value = (await lerConvenios()).convenios;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
    }
}

onMounted(recarregar);

async function configurar(convenio: ConvenioErp) {
    try {
        await salvarConvenio(convenio.codigoTs, {
            nomeErp: convenio.nome,
            nomeExibicao: convenio.config?.nomeExibicao ?? `na ${convenio.nome}`,
            dias: convenio.config?.dias ?? 2,
            variaveis: convenio.config?.variaveis ?? [],
            ativo: true,
        });
        await recarregar();
    } catch (e) {
        erro.value = e instanceof Error ? e.message : null;
    }
}

async function descartar(codigoTs: number) {
    await removerConvenio(codigoTs);
    await recarregar();
}
</script>

<template>
    <div>
        <p class="explica">
            Só os convênios configurados aqui viram local de retirada. Os demais —
            categorias de desconto, crediário — continuam sendo cliente comum.
        </p>
        <p v-if="erro" class="erro">{{ erro }}</p>

        <div class="filtros">
            <input v-model="filtro" type="search" placeholder="Buscar convênio" class="busca">
            <label><input v-model="soConfigurados" type="checkbox"> só configurados</label>
        </div>

        <table class="grade">
            <thead>
                <tr><th>Convênio no sistema</th><th>Como aparece na mensagem</th><th>Prazo</th><th></th></tr>
            </thead>
            <tbody>
                <tr v-for="c in visiveis" :key="c.codigoTs" :class="{ inativo: !c.config }">
                    <td>{{ c.nome }}</td>
                    <td>
                        <input
                            v-if="c.config"
                            v-model="c.config.nomeExibicao"
                            class="exibicao"
                            placeholder="na Farmácia Porto Rico"
                            @change="configurar(c)"
                        >
                        <span v-else class="nao-config">não é local de retirada</span>
                    </td>
                    <td>
                        <input v-if="c.config" v-model.number="c.config.dias" type="number" min="0"
                               class="dias" @change="configurar(c)">
                    </td>
                    <td>
                        <button v-if="c.config" type="button" class="remover" @click="descartar(c.codigoTs)">remover</button>
                        <button v-else type="button" class="adicionar" @click="configurar(c)">configurar</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.explica { color: var(--cor-texto-suave); font-size: 0.85rem; }
.filtros { display: flex; align-items: center; gap: 16px; margin: 16px 0; font-size: 0.85rem; }
.busca { flex: 1; max-width: 320px; padding: 9px 12px; font: inherit;
         border: 1px solid var(--cor-borda); border-radius: var(--raio); }
.grade { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--cor-borda); }
th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cor-texto-suave); }
tr.inativo td { color: var(--cor-texto-suave); }
.exibicao { width: 100%; padding: 6px 8px; font: inherit;
            border: 1px solid var(--cor-borda); border-radius: 6px; }
.dias { width: 68px; padding: 6px; font: inherit; border: 1px solid var(--cor-borda); border-radius: 6px; }
.nao-config { font-size: 0.82rem; }
.adicionar { background: none; border: 0; color: var(--cor-marca); font: inherit; cursor: pointer; }
.remover { background: none; border: 0; color: #b91c1c; font: inherit; cursor: pointer; }
.erro { color: #b91c1c; }
</style>
```

- [ ] **Passo 3: Acrescentar a aba**

Em `web/src/telas/Configuracoes.vue`, importar `GradeConvenios`, acrescentar
`'convenios'` ao tipo de `secao`, o botão na navegação e a seção correspondente.

- [ ] **Passo 4: Chip de sugestão na tela da receita**

Em `web/src/telas/Receita.vue`, acrescentar o estado e o controle:

```ts
const convenioEscolhido = ref<number | null>(null);
```

No `onMounted`, depois de preencher `detalhe`:

```ts
    // Sugere marcado quando há exatamente um. Com dois, a tela pergunta:
    // 17 clientes têm dois convênios e não cabe ao sistema escolher.
    if (dados.conveniosSugeridos?.length === 1) {
        convenioEscolhido.value = dados.conveniosSugeridos[0].codigoTs;
    }
```

Em `enviar()`, repassar:

```ts
            convenioTs: convenioEscolhido.value ?? undefined,
```

E no template, depois da linha de modalidade:

```vue
            <div v-if="detalhe.conveniosSugeridos?.length" class="convenios">
                <p class="rotulo-convenio">Retirada em convênio</p>
                <button
                    v-for="c in detalhe.conveniosSugeridos"
                    :key="c.codigoTs"
                    type="button"
                    class="chip-convenio"
                    :class="{ ativo: convenioEscolhido === c.codigoTs }"
                    @click="convenioEscolhido = convenioEscolhido === c.codigoTs ? null : c.codigoTs"
                >{{ c.nomeExibicao }}</button>
                <p class="dica-convenio">
                    Toque para desmarcar se o cliente vier buscar na farmácia.
                </p>
            </div>
```

Com o estilo:

```css
.convenios { margin: 16px 0; }
.rotulo-convenio { margin: 0 0 8px; font-size: 0.78rem; text-transform: uppercase;
                   letter-spacing: 0.07em; color: var(--cor-texto-suave); }
.chip-convenio {
    padding: 8px 14px; margin: 0 6px 6px 0; font: inherit;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda);
    border-radius: 20px; cursor: pointer; color: inherit;
}
.chip-convenio.ativo { border-color: var(--cor-marca); border-width: 2px; color: var(--cor-marca); }
.dica-convenio { margin: 4px 0 0; font-size: 0.78rem; color: var(--cor-texto-suave); }
```

- [ ] **Passo 5: Verificar**

Abrir a receita de um cliente com convênio configurado: o chip aparece
**marcado**. Desmarcar e enviar: a mensagem sai pelo caminho de
entrega/retirada. Marcar e enviar: sai pelo template de convênio.

Abrir a receita de um cliente cujo convênio **não** está configurado: nenhum
chip aparece, e o envio segue normal — sem aviso, sem bloqueio.

- [ ] **Passo 6: Commit**

```bash
git add web/src/componentes/GradeConvenios.vue web/src/telas/Configuracoes.vue web/src/telas/Receita.vue web/src/api/config.ts web/src/api/receita.ts
git commit -m "feat: telas de convênio com sugestão confirmável"
```

---

## Critério de conclusão da Parte 7

- [ ] `npm test` passa 97 testes
- [ ] Os 97 convênios do ERP aparecem na tela, com busca
- [ ] Convênio **sem** configuração nunca sugere nem bloqueia
- [ ] Cliente com um convênio configurado vê o chip **já marcado**
- [ ] Cliente com dois vê os dois, **nenhum marcado**
- [ ] Desmarcar faz cair em entrega/retirada
- [ ] Marcar sobrepõe cidade e a flag de entrega
- [ ] Variável livre com nome reservado é recusada na gravação
