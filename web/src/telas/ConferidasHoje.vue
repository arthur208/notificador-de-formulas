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
