# Parte 3 — Front Novo e Tela Principal

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa.

**Goal:** Substituir o front em Materialize por uma SPA em Vue compilada pelo
Vite, servida pelo Express atual, entregando a tela "Conferidas hoje" com as duas
seções e a barra de código no rodapé.

**Architecture:** O projeto do front vive em `web/` e compila para `public/`, que
o Express já serve. Nenhuma rota de backend muda. O PWA é reconstruído com
`vite-plugin-pwa`, e o service worker novo força a substituição do antigo — sem
isso, aparelhos com o PWA instalado continuariam na versão velha
indefinidamente.

**Tech Stack:** Vite 8.2.1, Vue 3.5.41, TypeScript 7.0.2, vue-router 5.2.0,
PrimeVue 4.5.5 (MIT), primeicons 8.0.0, vite-plugin-pwa 1.3.0,
@vitejs/plugin-vue 6.0.8.

**Spec:** `docs/superpowers/specs/2026-08-18-notificador-evolucao-design.md`
(Projeto B, seções de PWA e código de barras)

## Global Constraints

- **PrimeVue 4.5.5 + @primevue/themes 4.5.4, não 5.x.** O 5 saiu do MIT para a
  PrimeUI License e exige chave. Para migrar: `primevue@5.0.1` +
  `@primeuix/themes@3.0.0`, trocar o import do preset e acrescentar `license`
  na configuração do plugin.
- **Versões fixas** nas instalações (`npm i pacote@versão`), sem `^`, para o
  build não mudar sozinho.
- **O Express não muda nesta Parte.** Nenhum arquivo fora de `web/`, `public/` e
  `package.json` é tocado, exceto o `.gitignore`.
- **`public/` passa a ser saída de build.** Todo asset estático que precisa
  sobreviver mora em `web/public/`.
- **Nunca cachear `/api/`** no service worker.
- Textos de interface em português, voz ativa, sentence case.
- Commits em português, prefixo convencional.

## Pré-requisitos do cliente

| Item | Por quê |
|---|---|
| `icon-192.png` e `icon-512.png` | o `manifest.json` os referencia e eles **não existem** no repositório hoje; o Chrome exige ambos para oferecer instalação |
| Cor primária da marca (hex) | hoje o app usa `#00796b`, que é o teal padrão do Materialize, não a cor da Bioessência |
| Confirmação de fundo claro | a spec propõe sair do escuro; se o cliente preferir escuro, trocar o preset do tema |

Se os ícones não estiverem prontos, a Task 2 usa placeholders gerados e **abre
um item pendente** — não bloqueia as outras tarefas.

---

### Task 1: Projeto do front e integração com o Express

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`
- Create: `web/index.html`, `web/src/main.ts`, `web/src/App.vue`
- Create: `web/src/router.ts`
- Modify: `package.json` (scripts `build` e `dev:web`)
- Modify: `.gitignore` (ignora `web/node_modules` e `web/dist`)

**Interfaces:**
- Produces: `npm run build` na raiz gera `public/index.html` e `public/assets/*`
- Produces: `web/src/router.ts` exportando `router` com as rotas `/`, `/receita/:codigo`, `/historico`, `/configuracoes`
- Consumes: `GET /api/conferidas` da Parte 2

- [ ] **Passo 1: Criar o projeto e instalar as dependências**

```bash
mkdir -p web/src
cd web
npm init -y
npm i vue@3.5.41 vue-router@5.2.0 primevue@4.5.5 @primevue/themes@4.5.4 primeicons@8.0.0
npm i -D vite@8.2.1 @vitejs/plugin-vue@6.0.8 typescript@7.0.2 vue-tsc@3.3.10
cd ..
```

Todas as versões acima foram conferidas no npm registry em 2026-08-18.

- [ ] **Passo 2: Configurar o Vite para compilar dentro de `public/`**

Criar `web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
        // O Express serve public/. Compilar direto para lá mantém o deploy
        // igual ao de hoje: npm run build e pronto.
        outDir: '../public',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/api': { target: 'http://127.0.0.1:3008', changeOrigin: true },
        },
    },
});
```

- [ ] **Passo 3: Configurar o TypeScript**

Criar `web/tsconfig.json`:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "jsx": "preserve",
        "lib": ["ES2022", "DOM", "DOM.Iterable"],
        "skipLibCheck": true,
        "noEmit": true,
        "isolatedModules": true,
        "verbatimModuleSyntax": true,
        "types": ["vite/client"],
        "baseUrl": ".",
        "paths": { "@/*": ["./src/*"] }
    },
    "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

- [ ] **Passo 4: Criar o ponto de entrada**

Criar `web/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Notificador de Fórmulas</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

Criar `web/src/main.ts`:

```ts
import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import 'primeicons/primeicons.css';

import App from './App.vue';
import { router } from './router';
import './estilo/base.css';

const app = createApp(App);
app.use(router);
app.use(PrimeVue, { theme: { preset: Aura, options: { darkModeSelector: '.tema-escuro' } } });
app.use(ToastService);
app.mount('#app');
```

> No PrimeVue 4 os presets vivem no pacote separado `@primevue/themes`. No 5 esse
> pacote virou `@primeuix/themes` — além da troca de licença, é a diferença de
> import se o cliente migrar.

Criar `web/src/App.vue`:

```vue
<script setup lang="ts">
import Toast from 'primevue/toast';
</script>

<template>
    <RouterView />
    <Toast position="bottom-center" />
</template>
```

- [ ] **Passo 5: Criar o roteador**

Criar `web/src/router.ts`:

```ts
import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'hoje', component: () => import('./telas/ConferidasHoje.vue') },
        { path: '/receita/:codigo', name: 'receita', component: () => import('./telas/Receita.vue') },
        { path: '/historico', name: 'historico', component: () => import('./telas/Historico.vue') },
        { path: '/configuracoes', name: 'configuracoes', component: () => import('./telas/Configuracoes.vue') },
        { path: '/:qualquer(.*)', redirect: '/' },
    ],
});
```

As telas `Receita`, `Historico` e `Configuracoes` são criadas nas Partes 4, 8 e
6. Para o build passar agora, criar cada uma como um arquivo mínimo:

```vue
<template>
    <p>Em construção.</p>
</template>
```

- [ ] **Passo 6: Ligar os scripts na raiz**

Em `package.json` da raiz, dentro de `scripts`:

```json
"scripts": {
    "start": "node index.js",
    "test": "node --test",
    "build": "npm --prefix web run build",
    "dev:web": "npm --prefix web run dev",
    "postinstall:web": "npm --prefix web install"
}
```

Em `web/package.json`, dentro de `scripts`:

```json
"scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview"
}
```

- [ ] **Passo 7: Ignorar os artefatos do front**

Acrescentar ao `.gitignore`:

```
# --- Front (Vite) ---
web/node_modules/
web/dist/
# public/ passa a ser saída de build a partir da Parte 3.
# Os arquivos versionados que sobrevivem moram em web/public/.
public/assets/
public/index.html
```

- [ ] **Passo 8: Verificar o build e o modo de desenvolvimento**

```bash
npm run build
ls public/
```

Esperado: `public/index.html` e `public/assets/` gerados.

```bash
npm start          # terminal 1, porta 3008
npm run dev:web    # terminal 2, porta 5173
```

Abrir `http://127.0.0.1:5173` — a página carrega, e `/api/conferidas` responde
pelo proxy. Confirmar no terminal 2 que não há erro de proxy.

- [ ] **Passo 9: Commit**

```bash
git add web package.json .gitignore
git commit -m "feat: projeto do front em Vite + Vue + TypeScript compilando para public"
```

---

### Task 2: PWA reconstruído, com substituição do service worker antigo

O `sw.js` atual é cache-first, com `CACHE_NAME` fixo, **sem** `activate`,
`skipWaiting` ou `clients.claim`. Num aparelho com o PWA instalado, ele serve a
casca antiga indefinidamente — publicar o front novo não chegaria a quem já
instalou.

**Files:**
- Create: `web/public/manifest.webmanifest`
- Create: `web/public/icons/icon-192.png`, `web/public/icons/icon-512.png`
- Modify: `web/vite.config.ts` (acrescenta o plugin)
- Modify: `web/index.html` (link do manifest)
- Delete: `public/sw.js`, `public/manifest.json`, `public/app.js`, `public/style.css`, `public/index.html`

**Interfaces:**
- Consumes: a configuração do Vite da Task 1.
- Produces: `public/sw.js` gerado pelo Workbox, com precache versionado por hash.

- [ ] **Passo 1: Instalar o plugin**

```bash
npm --prefix web i -D vite-plugin-pwa@1.3.0
```

- [ ] **Passo 2: Colocar os ícones**

Copiar os dois PNG fornecidos pelo cliente para `web/public/icons/`.

Se ainda não existirem, gerar placeholders sólidos para não travar a tarefa:

```bash
mkdir -p web/public/icons
node -e "
const fs=require('fs');
// PNG 1x1 opaco; serve apenas para o build passar.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XPXfsAAAAASUVORK5CYII=','base64');
fs.writeFileSync('web/public/icons/icon-192.png',png);
fs.writeFileSync('web/public/icons/icon-512.png',png);
console.log('placeholders criados — SUBSTITUIR pelos ícones da marca');
"
```

**Anotar como pendência:** ícones definitivos antes de publicar.

- [ ] **Passo 3: Configurar o plugin no Vite**

Em `web/vite.config.ts`, acrescentar o import e o plugin:

```ts
import { VitePWA } from 'vite-plugin-pwa';
```

E dentro de `plugins`, depois de `vue()`:

```ts
VitePWA({
    registerType: 'autoUpdate',
    // Estes dois são o que resolve o aparelho preso na versão antiga:
    // o SW novo assume no lugar do velho sem esperar as abas fecharem.
    workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Dados sempre da rede. Cachear /api/ mostraria a lista de ontem.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
            {
                urlPattern: /^\/api\//,
                handler: 'NetworkOnly',
            },
        ],
    },
    manifest: {
        name: 'Notificador de Fórmulas',
        short_name: 'Notificador',
        description: 'Aviso de fórmulas prontas — Farmácia Bioessência',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#ffffff',
        theme_color: '#00796b',
        icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    },
}),
```

`theme_color` e `background_color` mudam quando o cliente informar a cor da marca.

- [ ] **Passo 4: Remover o front antigo**

```bash
git rm public/sw.js public/manifest.json public/app.js public/style.css public/index.html
```

- [ ] **Passo 5: Verificar que o SW é gerado**

```bash
npm run build
ls public/
grep -c "skipWaiting\|clientsClaim" public/sw.js
```

Esperado: `public/sw.js`, `public/manifest.webmanifest` e `public/icons/`
presentes, e o `grep` retornando pelo menos 1.

- [ ] **Passo 6: Verificar a substituição no aparelho — o teste que importa**

Este passo **não pode ser feito em aba anônima**: aba nova não tem o SW antigo,
então não prova nada.

Num celular que **já tem o PWA instalado** com a versão antiga:

1. Publicar o build novo
2. Abrir o PWA instalado (não o navegador)
3. Fechar e abrir de novo

Esperado: a interface nova aparece em no máximo duas aberturas. Se continuar a
antiga, **parar e reportar** — o caminho de substituição do SW precisa de
investigação, e publicar assim deixaria a farmácia na versão velha sem sinal
algum.

- [ ] **Passo 7: Commit**

```bash
git add web/vite.config.ts web/public package.json
git commit -m "feat: reconstruir o PWA com substituição do service worker antigo"
```

---

### Task 3: Camada de acesso à API e tipos

**Files:**
- Create: `web/src/api/tipos.ts`
- Create: `web/src/api/cliente.ts`
- Create: `web/src/api/conferidas.ts`
- Create: `web/src/formatadores.ts`
- Create: `web/test/formatadores.test.ts`

**Interfaces:**
- Produces: `type Conferida = { codigoRec, nome, total, conferidas, completa, hora, jaAvisado }`
- Produces: `type RespostaConferidas = { data, prontas: Conferida[], aguardando: Conferida[] }`
- Produces: `buscarConferidas(data?: string) → Promise<RespostaConferidas>`
- Produces: `formatarTelefone(bruto: string) → string`
- Produces: `dataParaExibicao(iso: string) → string`
- Consumes: `GET /api/conferidas` da Parte 2

- [ ] **Passo 1: Declarar os tipos**

Criar `web/src/api/tipos.ts`:

```ts
export type Conferida = {
    codigoRec: number;
    nome: string;
    total: number;
    conferidas: number;
    completa: boolean;
    hora: string | null;
    jaAvisado: boolean;
};

export type RespostaConferidas = {
    data: string;
    prontas: Conferida[];
    aguardando: Conferida[];
};

export class ErroApi extends Error {
    constructor(public status: number, mensagem: string) {
        super(mensagem);
        this.name = 'ErroApi';
    }
}
```

- [ ] **Passo 2: Escrever o cliente HTTP**

Criar `web/src/api/cliente.ts`:

```ts
import { ErroApi } from './tipos';

const TEMPO_LIMITE_MS = 20000;

export async function buscarJson<T>(caminho: string): Promise<T> {
    const controlador = new AbortController();
    const relogio = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);

    try {
        const resposta = await fetch(caminho, { signal: controlador.signal });

        if (!resposta.ok) {
            // O backend responde JSON em /api/* desde a Parte 1. Ainda assim,
            // não confiamos: um proxy no caminho pode devolver HTML.
            let mensagem = `Falha na requisição (${resposta.status}).`;
            try {
                const corpo = await resposta.json();
                if (corpo?.erro) mensagem = corpo.erro;
            } catch {
                // corpo não era JSON — mantém a mensagem genérica
            }
            throw new ErroApi(resposta.status, mensagem);
        }

        return (await resposta.json()) as T;
    } catch (erro) {
        if (erro instanceof ErroApi) throw erro;
        if (erro instanceof DOMException && erro.name === 'AbortError') {
            throw new ErroApi(0, 'O servidor demorou demais para responder.');
        }
        throw new ErroApi(0, 'Sem conexão com o servidor.');
    } finally {
        clearTimeout(relogio);
    }
}
```

- [ ] **Passo 3: Escrever o acesso às conferidas**

Criar `web/src/api/conferidas.ts`:

```ts
import { buscarJson } from './cliente';
import type { RespostaConferidas } from './tipos';

export function buscarConferidas(data?: string): Promise<RespostaConferidas> {
    const consulta = data ? `?data=${encodeURIComponent(data)}` : '';
    return buscarJson<RespostaConferidas>(`/api/conferidas${consulta}`);
}
```

- [ ] **Passo 4: Escrever os testes dos formatadores**

Criar `web/test/formatadores.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { formatarTelefone, dataParaExibicao } from '../src/formatadores.ts';

test('formata celular com DDI e nono dígito', () => {
    assert.strictEqual(formatarTelefone('5544997028340'), '(44) 99702-8340');
});

test('formata fixo de oito dígitos', () => {
    assert.strictEqual(formatarTelefone('554434251122'), '(44) 3425-1122');
});

test('devolve o valor original quando não reconhece o formato', () => {
    assert.strictEqual(formatarTelefone('123'), '123');
    assert.strictEqual(formatarTelefone(''), '');
});

test('ignora pontuação na entrada', () => {
    assert.strictEqual(formatarTelefone('+55 (44) 99702-8340'), '(44) 99702-8340');
});

test('data para exibição sai em português', () => {
    assert.strictEqual(dataParaExibicao('2026-08-18'), 'terça, 18 de agosto');
});
```

- [ ] **Passo 5: Rodar para ver falhar**

```bash
node --test --experimental-strip-types web/test/
```

Esperado: FALHA com módulo não encontrado.

> O Node 24 executa TypeScript com `--experimental-strip-types`. Acrescentar em
> `web/package.json`: `"test": "node --test --experimental-strip-types test/"`.

- [ ] **Passo 6: Implementar os formatadores**

Criar `web/src/formatadores.ts`:

```ts
const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// Aceita o formato que o backend envia (55 + DDD + número) e devolve
// legível. O log de produção mostrava 5544997028340 cru na tela.
export function formatarTelefone(bruto: string): string {
    const digitos = (bruto ?? '').replace(/\D/g, '');
    const sem55 = digitos.startsWith('55') && digitos.length >= 12
        ? digitos.slice(2)
        : digitos;

    if (sem55.length === 11) {
        return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 7)}-${sem55.slice(7)}`;
    }
    if (sem55.length === 10) {
        return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 6)}-${sem55.slice(6)}`;
    }
    return bruto;
}

export function dataParaExibicao(iso: string): string {
    const [ano, mes, dia] = iso.split('-').map(Number);
    const data = new Date(ano, mes - 1, dia);
    return `${DIAS[data.getDay()]}, ${dia} de ${MESES[mes - 1]}`;
}
```

- [ ] **Passo 7: Rodar e confirmar**

```bash
npm --prefix web test
```

Esperado: 5 testes passando.

- [ ] **Passo 8: Commit**

```bash
git add web/src/api web/src/formatadores.ts web/test web/package.json
git commit -m "feat: camada de API tipada e formatadores de telefone e data"
```

---

### Task 4: Tela "Conferidas hoje"

**Files:**
- Create: `web/src/estilo/base.css`
- Create: `web/src/componentes/BarraCompletude.vue`
- Create: `web/src/componentes/CartaoReceita.vue`
- Create: `web/src/telas/ConferidasHoje.vue`

**Interfaces:**
- Consumes: `buscarConferidas` e os tipos da Task 3; `dataParaExibicao` da Task 3.
- Produces: `BarraCompletude` com props `{ conferidas: number, total: number }`
- Produces: `CartaoReceita` com props `{ receita: Conferida, clicavel: boolean }`

- [ ] **Passo 1: Definir os fundamentos de estilo**

Criar `web/src/estilo/base.css`:

```css
:root {
    --cor-fundo: #f7f7f5;
    --cor-superficie: #ffffff;
    --cor-borda: #e2e2dd;
    --cor-texto: #1c1c1a;
    --cor-texto-suave: #6b6b64;
    --cor-marca: #00796b;
    --cor-completo: #00796b;
    --cor-pendente: #d9d9d2;
    --cor-alerta: #b45309;
    --raio: 10px;
    --espaco: 16px;

    --fonte-interface: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    --fonte-dados: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace;
}

* { box-sizing: border-box; }

body {
    margin: 0;
    font-family: var(--fonte-interface);
    background: var(--cor-fundo);
    color: var(--cor-texto);
    -webkit-text-size-adjust: 100%;
}

/* Espaço para a barra fixa do rodapé, respeitando a área segura do iPhone. */
.com-rodape-fixo {
    padding-bottom: calc(96px + env(safe-area-inset-bottom));
}

.dados {
    font-family: var(--fonte-dados);
    font-variant-numeric: tabular-nums;
}

:focus-visible {
    outline: 2px solid var(--cor-marca);
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Passo 2: Criar a barra de completude**

É o elemento que carrega o dado mais importante da tela: quantas fórmulas da
receita já foram conferidas. Acima de 6 fórmulas vira número, porque 14 segmentos
não se leem.

Criar `web/src/componentes/BarraCompletude.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ conferidas: number; total: number }>();

const LIMITE_SEGMENTOS = 6;

const usarSegmentos = computed(() => props.total <= LIMITE_SEGMENTOS);
const segmentos = computed(() =>
    Array.from({ length: props.total }, (_, i) => i < props.conferidas)
);
const rotulo = computed(() =>
    props.conferidas === props.total
        ? `${props.total} de ${props.total} fórmulas conferidas`
        : `${props.conferidas} de ${props.total} fórmulas conferidas`
);
</script>

<template>
    <div class="completude" role="img" :aria-label="rotulo">
        <template v-if="usarSegmentos">
            <span v-for="(cheio, i) in segmentos" :key="i" class="seg" :class="{ cheio }" />
        </template>
        <span v-else class="numerico dados">{{ conferidas }} de {{ total }}</span>
    </div>
</template>

<style scoped>
.completude { display: flex; gap: 4px; align-items: center; }
.seg {
    width: 22px; height: 6px; border-radius: 3px;
    background: var(--cor-pendente);
}
.seg.cheio { background: var(--cor-completo); }
.numerico { font-size: 0.8rem; color: var(--cor-texto-suave); }
</style>
```

- [ ] **Passo 3: Criar o cartão da receita**

Criar `web/src/componentes/CartaoReceita.vue`:

```vue
<script setup lang="ts">
import BarraCompletude from './BarraCompletude.vue';
import type { Conferida } from '@/api/tipos';

const props = defineProps<{ receita: Conferida; clicavel: boolean }>();
const emit = defineEmits<{ abrir: [codigo: number] }>();

function acionar() {
    if (props.clicavel) emit('abrir', props.receita.codigoRec);
}
</script>

<template>
    <component
        :is="clicavel ? 'button' : 'div'"
        class="cartao"
        :class="{ pendente: !clicavel }"
        :type="clicavel ? 'button' : undefined"
        @click="acionar"
    >
        <BarraCompletude :conferidas="receita.conferidas" :total="receita.total" />
        <p class="nome">{{ receita.nome }}</p>
        <p class="meta dados">
            {{ receita.codigoRec }}
            <template v-if="receita.hora"> · {{ receita.hora }}</template>
            <template v-if="!receita.completa">
                · falta{{ receita.total - receita.conferidas > 1 ? 'm' : '' }}
                {{ receita.total - receita.conferidas }}
            </template>
        </p>
        <span v-if="receita.jaAvisado" class="selo">avisado</span>
    </component>
</template>

<style scoped>
.cartao {
    position: relative;
    display: block; width: 100%;
    text-align: left;
    background: var(--cor-superficie);
    border: 1px solid var(--cor-borda);
    border-radius: var(--raio);
    padding: 12px 14px;
    margin-bottom: 10px;
    font: inherit; color: inherit;
    cursor: pointer;
}
/* Receita incompleta é fisicamente diferente, não só rotulada:
   borda tracejada, recuada e sem interação. */
.cartao.pendente {
    border-style: dashed;
    background: transparent;
    color: var(--cor-texto-suave);
    cursor: default;
}
.nome { margin: 8px 0 2px; font-weight: 600; font-size: 1rem; }
.meta { margin: 0; font-size: 0.8rem; color: var(--cor-texto-suave); }
.selo {
    position: absolute; top: 12px; right: 14px;
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--cor-completo);
}
</style>
```

- [ ] **Passo 4: Criar a tela**

Criar `web/src/telas/ConferidasHoje.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import DatePicker from 'primevue/datepicker';
import Skeleton from 'primevue/skeleton';
import CartaoReceita from '@/componentes/CartaoReceita.vue';
import BarraCodigo from '@/componentes/BarraCodigo.vue';
import { buscarConferidas } from '@/api/conferidas';
import { dataParaExibicao } from '@/formatadores';
import type { Conferida } from '@/api/tipos';

const router = useRouter();

const dataSelecionada = ref<Date>(new Date());
const prontas = ref<Conferida[]>([]);
const aguardando = ref<Conferida[]>([]);
const carregando = ref(true);
const erro = ref<string | null>(null);
const demorando = ref(false);

function paraIso(data: Date): string {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
}

async function carregar() {
    carregando.value = true;
    erro.value = null;
    demorando.value = false;
    // O Firebird já levou 21s em produção. Depois de 4s a tela avisa,
    // em vez de parecer travada.
    const avisar = setTimeout(() => { demorando.value = true; }, 4000);

    try {
        const resposta = await buscarConferidas(paraIso(dataSelecionada.value));
        prontas.value = resposta.prontas;
        aguardando.value = resposta.aguardando;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
    } finally {
        clearTimeout(avisar);
        demorando.value = false;
        carregando.value = false;
    }
}

watch(dataSelecionada, carregar, { immediate: true });

function abrir(codigo: number) {
    router.push({ name: 'receita', params: { codigo: String(codigo) } });
}
</script>

<template>
    <main class="tela com-rodape-fixo">
        <header class="cabecalho">
            <p class="marca">bioessência</p>
            <h1>Conferidas</h1>
            <div class="linha-data">
                <span class="data-legivel">{{ dataParaExibicao(paraIso(dataSelecionada)) }}</span>
                <DatePicker
                    v-model="dataSelecionada"
                    date-format="dd/mm/yy"
                    show-icon
                    icon-display="input"
                    :max-date="new Date()"
                    aria-label="Escolher o dia"
                />
            </div>
        </header>

        <p v-if="demorando" class="aviso">Está demorando mais que o normal. Aguarde.</p>

        <div v-if="carregando" class="carregando">
            <Skeleton v-for="i in 4" :key="i" height="82px" border-radius="10px" class="vao" />
        </div>

        <div v-else-if="erro" class="vazio">
            <p>{{ erro }}</p>
            <button type="button" class="tentar" @click="carregar">Tentar de novo</button>
        </div>

        <template v-else>
            <section>
                <h2>Prontas para avisar <span class="conta">{{ prontas.length }}</span></h2>
                <p v-if="prontas.length === 0" class="vazio-secao">
                    Nenhuma receita conferida neste dia.
                </p>
                <CartaoReceita
                    v-for="receita in prontas"
                    :key="receita.codigoRec"
                    :receita="receita"
                    :clicavel="true"
                    @abrir="abrir"
                />
            </section>

            <section v-if="aguardando.length > 0">
                <h2>Aguardando outras fórmulas <span class="conta">{{ aguardando.length }}</span></h2>
                <CartaoReceita
                    v-for="receita in aguardando"
                    :key="receita.codigoRec"
                    :receita="receita"
                    :clicavel="false"
                />
            </section>
        </template>

        <BarraCodigo @abrir="abrir" />
    </main>
</template>

<style scoped>
.tela { max-width: 720px; margin: 0 auto; padding: 20px 16px 0; }
.marca { margin: 0; font-size: 0.8rem; letter-spacing: 0.08em; color: var(--cor-marca); }
h1 { margin: 4px 0 8px; font-size: 1.6rem; }
.linha-data { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
.data-legivel { color: var(--cor-texto-suave); font-size: 0.9rem; }
h2 {
    display: flex; align-items: center; gap: 8px;
    margin: 24px 0 12px; font-size: 0.78rem;
    text-transform: uppercase; letter-spacing: 0.07em; color: var(--cor-texto-suave);
}
.conta {
    background: var(--cor-borda); color: var(--cor-texto);
    border-radius: 20px; padding: 1px 8px; font-size: 0.75rem; letter-spacing: 0;
}
.vao { margin-bottom: 10px; }
.vazio, .vazio-secao { color: var(--cor-texto-suave); font-size: 0.9rem; }
.aviso { color: var(--cor-alerta); font-size: 0.85rem; }
.tentar {
    margin-top: 8px; padding: 10px 16px; font: inherit;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
</style>
```

- [ ] **Passo 5: Verificar na tela**

```bash
npm start && npm run dev:web
```

Abrir `http://127.0.0.1:5173` no navegador, com o DevTools em modo celular
(390 × 844).

Confirmar, um a um:
- as duas seções aparecem com as contagens corretas
- receita completa mostra todos os segmentos preenchidos
- receita parcial tem borda tracejada e **não** responde ao toque
- clicar numa pronta navega para `/receita/:codigo`
- trocar a data recarrega a lista
- receita já avisada mostra o selo

- [ ] **Passo 6: Commit**

```bash
git add web/src/estilo web/src/componentes web/src/telas/ConferidasHoje.vue
git commit -m "feat: tela de conferidas do dia com barra de completude"
```

---

### Task 5: Barra de código no rodapé

Serve as três origens de uma vez: digitação, leitor físico do balcão (que digita
e envia `Enter`) e, na Parte 8, a câmera. O código de barras contém **apenas o
número da receita** — não há string a interpretar.

**Files:**
- Create: `web/src/componentes/BarraCodigo.vue`

**Interfaces:**
- Produces: `BarraCodigo` emitindo `abrir(codigo: number)`
- Consumes: nada.

- [ ] **Passo 1: Criar o componente**

Criar `web/src/componentes/BarraCodigo.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';

const emit = defineEmits<{ abrir: [codigo: number] }>();

const valor = ref('');
const campo = ref<HTMLInputElement | null>(null);

// Foco automático: o leitor do balcão digita direto, sem a atendente
// precisar tocar no campo antes.
onMounted(() => campo.value?.focus());

function confirmar() {
    const codigo = Number(valor.value.replace(/\D/g, ''));
    if (!Number.isInteger(codigo) || codigo <= 0) return;
    emit('abrir', codigo);
    valor.value = '';
}
</script>

<template>
    <div class="barra">
        <input
            ref="campo"
            v-model="valor"
            class="campo dados"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="Digitar ou bipar a receita"
            aria-label="Código da receita"
            @keydown.enter.prevent="confirmar"
        >
        <button type="button" class="acao" @click="confirmar">Abrir</button>
    </div>
</template>

<style scoped>
.barra {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    display: flex; gap: 8px;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--cor-superficie);
    border-top: 1px solid var(--cor-borda);
}
.campo {
    flex: 1; min-width: 0;
    padding: 14px 12px; font-size: 1rem;
    border: 1px solid var(--cor-borda); border-radius: var(--raio);
    background: var(--cor-fundo); color: var(--cor-texto);
}
.acao {
    padding: 14px 20px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: #fff;
    border: 0; border-radius: var(--raio);
}
</style>
```

> O `type="text"` com `inputmode="numeric"` é deliberado. `type="number"` faria o
> navegador rejeitar entradas do leitor que tragam qualquer caractere não
> numérico, deixando o campo silenciosamente vazio.

- [ ] **Passo 2: Verificar com o leitor físico**

Abrir a tela **sem clicar em nada** e bipar um rótulo.

Esperado: o número entra no campo e a navegação para `/receita/:codigo` acontece
sozinha.

Se o número que chegar não bater com o `CODIGOREC` esperado, bipar dentro de um
bloco de notas, anotar a string exata e **reportar** — pode haver zeros à
esquerda ou dígito verificador de EAN-13, e nesse caso o tratamento vira tarefa
própria.

- [ ] **Passo 3: Commit**

```bash
git add web/src/componentes/BarraCodigo.vue
git commit -m "feat: barra de código no rodapé servindo digitação e leitor físico"
```

---

## Critério de conclusão da Parte 3

- [ ] `npm run build` gera `public/index.html`, `public/assets/`, `public/sw.js` e `public/manifest.webmanifest`
- [ ] `npm run dev:web` serve em `:5173` com proxy funcionando para `:3008`
- [ ] `npm --prefix web test` passa 5 testes
- [ ] A tela mostra as duas seções, com parciais tracejadas e não clicáveis
- [ ] Trocar a data recarrega a lista
- [ ] Carregamento usa skeleton, e acima de 4 s avisa que está demorando
- [ ] Bipar um rótulo com a tela recém-aberta navega para a receita
- [ ] **Aparelho com o PWA antigo instalado recebe a versão nova**
- [ ] Telefone e datas aparecem formatados
- [ ] Ícones definitivos da marca no lugar dos placeholders

## Pendências que saem desta Parte

| Item | Para quem |
|---|---|
| Ícones 192/512 definitivos | cliente |
| Cor da marca em `--cor-marca` e `theme_color` | cliente |
| Telas `Receita`, `Historico`, `Configuracoes` ainda são stubs | Partes 4, 8 e 6 |
