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
const total = ref(0);
const carregando = ref(true);
const erro = ref<string | null>(null);

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
    erro.value = null;
    try {
        const resposta = await buscarHistorico({
            page: pagina.value, busca: busca.value, ...intervalo(),
        });
        envios.value = anexar ? [...envios.value, ...resposta.logs] : resposta.logs;
        temMais.value = resposta.hasMore;
        total.value = resposta.total;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
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
            <span v-if="!carregando" class="conta">{{ total }}</span>
        </header>

        <input v-model="busca" type="search" class="busca" placeholder="Nome do cliente ou número da receita">

        <nav class="periodos">
            <button type="button" :class="{ ativo: periodo === 'hoje' }" @click="periodo = 'hoje'">hoje</button>
            <button type="button" :class="{ ativo: periodo === '7dias' }" @click="periodo = '7dias'">7 dias</button>
            <button type="button" :class="{ ativo: periodo === 'tudo' }" @click="periodo = 'tudo'">tudo</button>
        </nav>

        <p v-if="erro" class="erro">{{ erro }}</p>

        <div v-if="carregando && envios.length === 0">
            <Skeleton v-for="i in 5" :key="i" height="76px" border-radius="10px" class="vao" />
        </div>

        <p v-else-if="envios.length === 0" class="vazio">
            Nenhum envio encontrado para esta busca.
        </p>

        <article v-for="envio in envios" :key="envio._id" class="cartao" :class="envio.status">
            <p class="nome">{{ envio.nomeCliente }}</p>
            <p class="meta dados">{{ envio.codigoReceita }} · {{ dataHora(envio.timestamp) }}</p>
            <p class="meta dados">{{ formatarTelefone(envio.telefoneEnviado) }}</p>
            <span class="estado">
                {{ envio.status === 'sucesso' ? 'enviado' : 'falhou' }}
                <template v-if="envio.tentativas > 1"> · {{ envio.tentativas }}x</template>
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
.conta {
    margin-left: auto; background: var(--cor-borda); color: var(--cor-texto);
    border-radius: 20px; padding: 2px 10px; font-size: 0.78rem;
}
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
.vazio, .erro { color: var(--cor-texto-suave); }
.erro { color: #b91c1c; }
</style>
