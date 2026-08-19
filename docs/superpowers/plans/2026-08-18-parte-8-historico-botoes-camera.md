# Parte 8 — Histórico, Botões e Leitura por Câmera

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa.

**Goal:** Fechar as pontas: histórico com busca por nome e sem lixo de
retentativa, botões interativos na mensagem, e leitura de código de barras pela
câmera do celular.

**Architecture:** O histórico ganha busca no servidor e agrupa tentativas
repetidas da mesma receita numa entrada só. Os botões são acréscimo visual ao
envio existente — o sistema **não lê a resposta do cliente**, ela cai no
MultiAtendWeb para atendimento humano. A câmera usa uma biblioteca única para
Android e iPhone, evitando dois caminhos de código.

**Tech Stack:** Express 5.1.0, MongoDB 6.20.0, Vue 3.5.41, PrimeVue 4.5.5,
html5-qrcode 2.3.8.

**Spec:** `docs/superpowers/specs/2026-08-18-canal-whatsmeow-spec.md` (Escopo A,
decisão D8) e `.../2026-08-18-notificador-evolucao-design.md` (Projeto B)

## Global Constraints

- **Nunca ler nem interpretar a resposta do cliente.** Botão é formato visual.
  O clique gera ticket no MultiAtendWeb, tratado por pessoa (decisão D8).
- **Máximo 3 botões** no whatsmeow.
- **A câmera exige HTTPS.** Em desenvolvimento, `localhost` é aceito; por IP na
  rede local, não. Testar pelo domínio de produção ou por `localhost`.
- Busca do histórico é **no servidor**, não filtro no cliente — são 8.493
  documentos.
- Commits em português, prefixo convencional.

---

### Task 1: Histórico com busca e agrupamento

Hoje o histórico só filtra por data, e retentativas poluem a lista: em produção,
a mesma receita aparecia em **quatro cartões idênticos** de erro, empurrando o
conteúdo útil para baixo.

**Files:**
- Modify: `services/mongoService.js` (busca por texto e agrupamento)
- Modify: `controllers/logController.js`

**Interfaces:**
- Produces: `GET /api/logs?page=&busca=&dateStart=&dateEnd=` → `{ logs, hasMore }`
- Produces: `findLogsAgrupados(query, page, limit) → Promise<Array>` com `tentativas` em cada entrada

- [ ] **Passo 1: Acrescentar busca e agrupamento**

Em `services/mongoService.js`, antes do `module.exports`:

```js
// Agrupa por (receita, telefone, status) dentro do mesmo minuto: quatro
// tentativas seguidas de erro viram uma entrada com tentativas: 4.
async function findLogsAgrupados(query, page, limit) {
    const collection = getLogsCollection();
    return collection.aggregate([
        { $match: query },
        { $sort: { timestamp: -1 } },
        {
            $group: {
                _id: {
                    codigoReceita: '$codigoReceita',
                    telefoneEnviado: '$telefoneEnviado',
                    status: '$status',
                    minuto: {
                        $dateToString: { format: '%Y-%m-%dT%H:%M', date: '$timestamp' },
                    },
                },
                doc: { $first: '$$ROOT' },
                tentativas: { $sum: 1 },
            },
        },
        { $replaceRoot: { newRoot: { $mergeObjects: ['$doc', { tentativas: '$tentativas' }] } } },
        { $sort: { timestamp: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
    ]).toArray();
}

// Busca por nome do cliente ou número da receita. Faz no servidor:
// filtrar 8.493 documentos no navegador seria absurdo.
function montarFiltroBusca(texto) {
    const termo = String(texto || '').trim();
    if (termo === '') return {};

    const comoNumero = Number(termo.replace(/\D/g, ''));
    const alternativas = [
        { nomeCliente: { $regex: escaparRegex(termo), $options: 'i' } },
    ];
    if (Number.isInteger(comoNumero) && comoNumero > 0) {
        alternativas.push({ codigoReceita: comoNumero });
    }
    return { $or: alternativas };
}

function escaparRegex(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function contarAgrupados(query) {
    const collection = getLogsCollection();
    const resultado = await collection.aggregate([
        { $match: query },
        {
            $group: {
                _id: {
                    codigoReceita: '$codigoReceita',
                    telefoneEnviado: '$telefoneEnviado',
                    status: '$status',
                    minuto: { $dateToString: { format: '%Y-%m-%dT%H:%M', date: '$timestamp' } },
                },
            },
        },
        { $count: 'total' },
    ]).toArray();
    return resultado[0]?.total ?? 0;
}
```

Incluir `findLogsAgrupados`, `montarFiltroBusca` e `contarAgrupados` no
`module.exports`.

- [ ] **Passo 2: Ligar no controller**

Substituir o conteúdo de `controllers/logController.js` por:

```js
const mongoService = require('../services/mongoService');

const POR_PAGINA = 25;

async function getLogs(req, res) {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const { dateStart, dateEnd, busca } = req.query;

        const query = { ...mongoService.montarFiltroBusca(busca) };

        if (dateStart || dateEnd) {
            query.timestamp = {};
            if (dateStart) query.timestamp.$gte = new Date(`${dateStart}T00:00:00.000-03:00`);
            if (dateEnd) query.timestamp.$lte = new Date(`${dateEnd}T23:59:59.999-03:00`);
        }

        const [logs, total] = await Promise.all([
            mongoService.findLogsAgrupados(query, page, POR_PAGINA),
            mongoService.contarAgrupados(query),
        ]);

        res.json({ logs, hasMore: page * POR_PAGINA < total, total });
    } catch (erro) {
        console.error('Erro ao buscar logs:', erro);
        res.status(500).json({ erro: 'Falha ao consultar o histórico.' });
    }
}

module.exports = { getLogs };
```

- [ ] **Passo 3: Verificar**

```bash
curl -s -b /tmp/cookies.txt "http://127.0.0.1:3008/api/logs?busca=Rosa" \
  | node -e "let e='';process.stdin.on('data',d=>e+=d).on('end',()=>{const j=JSON.parse(e);
      console.log('entradas:',j.logs.length,'| total:',j.total);
      j.logs.slice(0,3).forEach(l=>console.log(' ',l.nomeCliente,l.status,'tentativas:',l.tentativas));});"
```

Esperado: a receita 441622 (Rosa Martinez Antonucci), que tinha quatro registros
de erro, aparece **agrupada** com `tentativas: 4`.

- [ ] **Passo 4: Commit**

```bash
git add services/mongoService.js controllers/logController.js
git commit -m "feat: histórico com busca por nome e agrupamento de tentativas"
```

---

### Task 2: Tela do histórico

**Files:**
- Create: `web/src/api/historico.ts`
- Modify: `web/src/telas/Historico.vue` (substitui o stub)

**Interfaces:**
- Consumes: `buscarJson` (Parte 3), `formatarTelefone` (Parte 3).

- [ ] **Passo 1: Acesso à API**

Criar `web/src/api/historico.ts`:

```ts
import { buscarJson } from './cliente';

export type Envio = {
    _id: string;
    codigoReceita: number;
    nomeCliente: string;
    telefoneEnviado: string;
    status: 'sucesso' | 'erro';
    detalheErro?: unknown;
    tentativas: number;
    timestamp: string;
};

export function buscarHistorico(params: {
    page?: number; busca?: string; dateStart?: string; dateEnd?: string;
}): Promise<{ logs: Envio[]; hasMore: boolean; total: number }> {
    const consulta = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
        if (valor !== undefined && valor !== '') consulta.set(chave, String(valor));
    }
    return buscarJson(`/api/logs?${consulta.toString()}`);
}
```

- [ ] **Passo 2: Criar a tela**

Substituir `web/src/telas/Historico.vue` por:

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Skeleton from 'primevue/skeleton';
import { buscarHistorico, type Envio } from '@/api/historico';
import { formatarTelefone } from '@/formatadores';

const router = useRouter();

const busca = ref('');
const periodo = ref<'hoje' | '7dias' | 'tudo'>('7dias');
const envios = ref<Envio[]>([]);
const pagina = ref(1);
const temMais = ref(false);
const carregando = ref(true);

function intervalo(): { dateStart?: string; dateEnd?: string } {
    const hoje = new Date();
    const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (periodo.value === 'hoje') return { dateStart: iso(hoje), dateEnd: iso(hoje) };
    if (periodo.value === '7dias') {
        const inicio = new Date(hoje);
        inicio.setDate(inicio.getDate() - 7);
        return { dateStart: iso(inicio), dateEnd: iso(hoje) };
    }
    return {};
}

async function carregar(anexar = false) {
    carregando.value = true;
    try {
        const resposta = await buscarHistorico({
            page: pagina.value, busca: busca.value, ...intervalo(),
        });
        envios.value = anexar ? [...envios.value, ...resposta.logs] : resposta.logs;
        temMais.value = resposta.hasMore;
    } finally {
        carregando.value = false;
    }
}

let relogio: ReturnType<typeof setTimeout>;
watch([busca, periodo], () => {
    clearTimeout(relogio);
    // Espera a digitação parar: buscar a cada tecla castigaria o servidor.
    relogio = setTimeout(() => { pagina.value = 1; carregar(); }, 350);
});

onMounted(() => carregar());

function maisAntigos() {
    pagina.value += 1;
    carregar(true);
}

function dataHora(iso: string): string {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<template>
    <main class="tela">
        <header class="topo">
            <button type="button" class="voltar" @click="router.push({ name: 'hoje' })" aria-label="Voltar">←</button>
            <h1>Histórico</h1>
        </header>

        <input v-model="busca" type="search" class="busca" placeholder="Nome do cliente ou número da receita">

        <nav class="periodos">
            <button type="button" :class="{ ativo: periodo === 'hoje' }" @click="periodo = 'hoje'">hoje</button>
            <button type="button" :class="{ ativo: periodo === '7dias' }" @click="periodo = '7dias'">7 dias</button>
            <button type="button" :class="{ ativo: periodo === 'tudo' }" @click="periodo = 'tudo'">tudo</button>
        </nav>

        <div v-if="carregando && envios.length === 0">
            <Skeleton v-for="i in 5" :key="i" height="76px" border-radius="10px" class="vao" />
        </div>

        <p v-else-if="envios.length === 0" class="vazio">
            Nenhum envio encontrado para esta busca.
        </p>

        <article v-for="envio in envios" :key="envio._id" class="cartao" :class="envio.status">
            <p class="nome">{{ envio.nomeCliente }}</p>
            <p class="meta dados">
                {{ envio.codigoReceita }} · {{ dataHora(envio.timestamp) }}
            </p>
            <p class="meta dados">{{ formatarTelefone(envio.telefoneEnviado) }}</p>
            <span class="estado">
                {{ envio.status === 'sucesso' ? 'enviado' : 'falhou' }}
                <template v-if="envio.tentativas > 1"> · {{ envio.tentativas }} tentativas</template>
            </span>
        </article>

        <button v-if="temMais" type="button" class="mais" :disabled="carregando" @click="maisAntigos">
            {{ carregando ? 'Carregando…' : 'Carregar mais antigos' }}
        </button>
    </main>
</template>

<style scoped>
.tela { max-width: 720px; margin: 0 auto; padding: 20px 16px 40px; }
.topo { display: flex; align-items: center; gap: 12px; }
.voltar { font-size: 1.4rem; background: none; border: 0; padding: 4px 8px; cursor: pointer; color: inherit; }
h1 { font-size: 1.4rem; margin: 0; }
.busca {
    width: 100%; margin: 16px 0 12px; padding: 13px 12px; font: inherit;
    border: 1px solid var(--cor-borda); border-radius: var(--raio);
    background: var(--cor-superficie); color: var(--cor-texto);
}
.periodos { display: flex; gap: 6px; margin-bottom: 20px; }
.periodos button {
    padding: 7px 14px; font: inherit; font-size: 0.85rem; cursor: pointer;
    background: transparent; border: 1px solid var(--cor-borda);
    border-radius: 20px; color: var(--cor-texto-suave);
}
.periodos button.ativo { background: var(--cor-superficie); color: var(--cor-texto); border-color: var(--cor-marca); }
.cartao {
    position: relative; background: var(--cor-superficie);
    border: 1px solid var(--cor-borda); border-left-width: 3px;
    border-radius: var(--raio); padding: 12px 14px; margin-bottom: 10px;
}
.cartao.sucesso { border-left-color: var(--cor-completo); }
.cartao.erro { border-left-color: #b91c1c; }
.nome { margin: 0 0 4px; font-weight: 600; }
.meta { margin: 0; font-size: 0.8rem; color: var(--cor-texto-suave); }
.estado {
    position: absolute; top: 12px; right: 14px;
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--cor-texto-suave);
}
.cartao.erro .estado { color: #b91c1c; }
.mais {
    width: 100%; padding: 13px; margin-top: 10px; font: inherit;
    background: transparent; border: 1px solid var(--cor-borda);
    border-radius: var(--raio); color: var(--cor-marca); cursor: pointer;
}
.vao { margin-bottom: 10px; }
.vazio { color: var(--cor-texto-suave); }
</style>
```

- [ ] **Passo 3: Verificar e commitar**

Buscar "Rosa" e confirmar que a receita 441622 aparece **uma vez**, com
"4 tentativas". Buscar "441694" e confirmar que acha por número.

```bash
git add web/src/api/historico.ts web/src/telas/Historico.vue
git commit -m "feat: tela de histórico com busca e agrupamento"
```

---

### Task 3: Botões na mensagem

**Files:**
- Modify: `controllers/messageController.js` (monta e envia com botões)
- Modify: `services/canalConfigService.js` (guarda a definição dos botões)
- Modify: `web/src/telas/Configuracoes.vue` (seção de botões)

**Interfaces:**
- Consumes: `enviarBotoes` e `validarBotoes` (Parte 4).
- Produces: `montarBotoes(config, contexto) → Array` — resolve variáveis nos campos

- [ ] **Passo 1: Montar os botões a partir da configuração**

Em `controllers/messageController.js`, acrescentar antes de `sendMessage`:

```js
// Os botões saem da configuração do canal, com as mesmas variáveis do
// template. Só existem como formato visual: o clique do cliente vira
// ticket no MultiAtendWeb e é tratado por pessoa (decisão D8).
function montarBotoes(definicoes, valores) {
    if (!Array.isArray(definicoes) || definicoes.length === 0) return null;

    return definicoes.slice(0, 3).map((definicao) => {
        const botao = { title: renderizar(definicao.title, valores), type: definicao.type };
        if (definicao.type === 'reply') botao.id = definicao.id;
        if (definicao.type === 'cta_url') botao.url = renderizar(definicao.url, valores);
        if (definicao.type === 'cta_call') botao.phone_number = definicao.phone_number;
        if (definicao.type === 'cta_copy') botao.copy_code = renderizar(definicao.copy_code, valores);
        return botao;
    });
}
```

- [ ] **Passo 2: Usar no envio**

Dentro de `sendMessage`, substituir a chamada de envio por:

```js
        const canal = await require('../services/canalConfigService').carregarCanal();
        const botoes = canal?.botoesAtivos
            ? montarBotoes(canal.botoes, { codigo: codigoReceita, nome: nomeCliente })
            : null;

        if (botoes && botoes.length > 0) {
            await whatsmeowService.enviarBotoes({
                numero: numeroFormatado,
                titulo: 'Farmácia Bioessência',
                corpo: textoFinal,
                botoes,
            });
        } else {
            await whatsmeowService.enviarTexto({ numero: numeroFormatado, mensagem: textoFinal });
        }
```

- [ ] **Passo 3: Semear uma definição útil**

Os três tipos que resolvem sozinhos no aparelho, sem exigir resposta:

```js
// Exemplo para a configuração inicial (aba Botões da tela de configurações):
[
    { type: 'cta_call', title: 'Ligar para a farmácia', phone_number: '5544XXXXXXXX' },
    { type: 'cta_copy', title: 'Copiar nº da receita', copy_code: '{{codigo}}' },
    { type: 'cta_url', title: 'Como chegar', url: 'https://maps.google.com/?q=...' }
]
```

> `reply` também funciona, mas o clique **gera um ticket** para o atendente
> humano no MultiAtendWeb. É decisão operacional: pode aumentar o volume de
> atendimento. Comece sem ele.

- [ ] **Passo 4: Verificar no número de teste**

Ativar `botoesAtivos`, enviar para o número de teste e confirmar no aparelho:
os botões aparecem, `cta_call` abre o discador, `cta_copy` copia o número da
receita. Depois enviar com 4 botões definidos e confirmar que apenas 3 saem.

- [ ] **Passo 5: Commit**

```bash
git add controllers/messageController.js services/canalConfigService.js web/src/telas/Configuracoes.vue
git commit -m "feat: enviar mensagem com botões interativos"
```

---

### Task 4: Leitura por câmera

O leitor físico do balcão já funciona desde a Parte 3 (campo com foco + `Enter`).
Esta tarefa cobre o celular. O código de barras contém **apenas o número da
receita** — não há string a interpretar.

**Files:**
- Create: `web/src/componentes/LeitorCamera.vue`
- Modify: `web/src/componentes/BarraCodigo.vue` (botão da câmera)

**Interfaces:**
- Produces: `LeitorCamera` emitindo `lido(codigo: string)` e `fechar()`

- [ ] **Passo 1: Instalar a biblioteca**

```bash
npm --prefix web i html5-qrcode@2.3.8
```

Escolhida por funcionar igual em Android e iPhone. O `BarcodeDetector` nativo do
Chrome seria mais rápido, mas o Safari não o tem — **um caminho de código só vale
mais que a otimização**, já que a farmácia usa os dois sistemas.

- [ ] **Passo 2: Criar o leitor**

Criar `web/src/componentes/LeitorCamera.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Html5Qrcode } from 'html5-qrcode';

const emit = defineEmits<{ lido: [codigo: string]; fechar: [] }>();

const ID_ELEMENTO = 'leitor-camera';
const erro = ref<string | null>(null);
let leitor: Html5Qrcode | null = null;

onMounted(async () => {
    try {
        leitor = new Html5Qrcode(ID_ELEMENTO);
        await leitor.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 280, height: 140 } },
            (texto) => {
                emit('lido', texto);
                emit('fechar');
            },
            () => { /* quadro sem código: normal, não é erro */ }
        );
    } catch {
        // Causa mais comum: página servida sem HTTPS. A câmera exige
        // contexto seguro; localhost é aceito, IP da rede local não.
        erro.value = 'Não foi possível abrir a câmera. Verifique a permissão e se o endereço usa HTTPS.';
    }
});

onBeforeUnmount(async () => {
    try {
        if (leitor?.isScanning) await leitor.stop();
        leitor?.clear();
    } catch { /* já parado */ }
});
</script>

<template>
    <div class="sobreposicao">
        <div class="cabecalho">
            <span>Aponte para o código de barras</span>
            <button type="button" class="fechar" @click="emit('fechar')" aria-label="Fechar">✕</button>
        </div>

        <div :id="ID_ELEMENTO" class="visor" />

        <p v-if="erro" class="erro">
            {{ erro }}
            <br>Use o leitor do balcão ou digite o número.
        </p>
    </div>
</template>

<style scoped>
.sobreposicao {
    position: fixed; inset: 0; z-index: 50;
    background: #000; color: #fff;
    display: flex; flex-direction: column;
}
.cabecalho {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px calc(16px + env(safe-area-inset-right)) 16px 16px;
    font-size: 0.9rem;
}
.fechar { background: none; border: 0; color: #fff; font-size: 1.2rem; cursor: pointer; }
.visor { flex: 1; }
.erro { padding: 20px; font-size: 0.9rem; line-height: 1.5; }
</style>
```

- [ ] **Passo 3: Ligar na barra de código**

Em `web/src/componentes/BarraCodigo.vue`, acrescentar ao `<script setup>`:

```ts
import LeitorCamera from './LeitorCamera.vue';

const camera = ref(false);
const temCamera = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

function receberDaCamera(texto: string) {
    valor.value = texto.replace(/\D/g, '');
    confirmar();
}
```

E ao template, dentro de `.barra`, depois do botão "Abrir":

```vue
        <button v-if="temCamera" type="button" class="camera" aria-label="Ler código de barras" @click="camera = true">▣</button>
    </div>

    <LeitorCamera v-if="camera" @lido="receberDaCamera" @fechar="camera = false" />
```

> O `v-if="temCamera"` esconde o botão em navegador sem câmera — no PC do
> balcão, o botão só ocuparia espaço.

Com o estilo:

```css
.camera {
    padding: 14px 16px; font-size: 1.1rem;
    background: transparent; border: 1px solid var(--cor-borda);
    border-radius: var(--raio); color: var(--cor-marca); cursor: pointer;
}
```

- [ ] **Passo 4: Verificar no celular**

Precisa ser por **HTTPS** ou `localhost`. Pelo IP da rede local o navegador
recusa a câmera, e isso não é defeito do código.

Testar num Android e num iPhone: abrir a lista, tocar em `▣`, apontar para um
rótulo. Esperado: o código é lido, a sobreposição fecha e a receita abre.

Se a leitura não reconhecer, anotar a simbologia impressa (Code 128, EAN-13) —
restringir os formatos aceitos acelera bastante o reconhecimento e pode ser
acrescentado em `formatsToSupport`.

- [ ] **Passo 5: Commit**

```bash
git add web/src/componentes/LeitorCamera.vue web/src/componentes/BarraCodigo.vue web/package.json
git commit -m "feat: leitura de código de barras pela câmera"
```

---

## Critério de conclusão da Parte 8

- [ ] Histórico busca por nome e por número da receita
- [ ] Retentativas da mesma receita aparecem agrupadas com a contagem
- [ ] Mensagem com botões chega no número de teste
- [ ] Definição com 4 botões envia apenas 3
- [ ] `cta_call` abre o discador; `cta_copy` copia o número da receita
- [ ] Câmera lê o código em Android e em iPhone, por HTTPS
- [ ] Sem câmera disponível, o botão não aparece
- [ ] O leitor físico do balcão continua funcionando

---

## Fim do roteiro

As oito Partes cobrem as três specs. O que fica registrado como **fora de
escopo por decisão do cliente**, e segue valendo:

| Item | Situação |
|---|---|
| Bypass do filtro de IP | provado; mitigado de fato pela Parte 5 (login) |
| `SYSDBA` com senha de desenvolvimento no `.env` | fora de escopo |
| `config.json` com `apiToken` órfão versionado | fora de escopo |
| `services/postgresService.js` e dependência `pg` mortos | fora de escopo |
| `logs_envio` (1.166 documentos) | mantida para acesso legado (decisão D9) |

E a pendência técnica sem dono: **a autenticação do Firebird falhou de forma
intermitente ~6 vezes durante o levantamento**, com as mesmas credenciais,
voltando sozinha. Causa não determinada. Em produção apareceria como falha
aleatória na busca do cliente — investigar antes de considerar o trabalho
concluído.
