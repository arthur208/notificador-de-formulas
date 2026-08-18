<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import DatePicker from 'primevue/datepicker';
import Skeleton from 'primevue/skeleton';
import CartaoReceita from '@/componentes/CartaoReceita.vue';
import BarraCodigo from '@/componentes/BarraCodigo.vue';
import CabecalhoApp from '@/componentes/CabecalhoApp.vue';
import { buscarConferidas } from '@/api/conferidas';
import { dataParaExibicao } from '@/formatadores';
import type { Conferida } from '@/api/tipos';

type Aba = 'avisar' | 'avisadas' | 'aguardando';

const router = useRouter();

const dataSelecionada = ref<Date>(new Date());
const prontas = ref<Conferida[]>([]);
const aguardando = ref<Conferida[]>([]);
const carregando = ref(true);
const erro = ref<string | null>(null);
const demorando = ref(false);
const aba = ref<Aba>('avisar');

// A API devolve completas e parciais; a separação entre "falta avisar" e
// "já avisada" é do front, com o jaAvisado que já vem em cada receita.
const aAvisar = computed(() => prontas.value.filter((r) => !r.jaAvisado));
const avisadas = computed(() => prontas.value.filter((r) => r.jaAvisado));

const ABAS = computed(() => [
    { id: 'avisar' as Aba, rotulo: 'Prontas para avisar', itens: aAvisar.value },
    { id: 'avisadas' as Aba, rotulo: 'Avisadas', itens: avisadas.value },
    { id: 'aguardando' as Aba, rotulo: 'Aguardando outras fórmulas', itens: aguardando.value },
]);

const abaAtiva = computed(() => ABAS.value.find((a) => a.id === aba.value)!);

const VAZIO: Record<Aba, string> = {
    avisar: 'Tudo avisado neste dia. Nada pendente.',
    avisadas: 'Nenhum aviso enviado neste dia ainda.',
    aguardando: 'Nenhuma receita esperando outras fórmulas.',
};

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
    <main class="tela">
        <header class="cabecalho">
            <div class="linha-marca">
                <div>
                    <p class="marca">bioessência</p>
                    <h1>Conferidas</h1>
                </div>
                <CabecalhoApp />
            </div>

            <div class="ferramentas">
                <BarraCodigo class="codigo" @abrir="abrir" />
                <div class="data">
                    <DatePicker
                        v-model="dataSelecionada"
                        date-format="dd/mm/yy"
                        show-icon
                        icon-display="input"
                        :max-date="new Date()"
                        aria-label="Escolher o dia"
                    />
                    <span class="data-legivel">{{ dataParaExibicao(paraIso(dataSelecionada)) }}</span>
                </div>
            </div>

            <nav class="abas" role="tablist">
                <button
                    v-for="a in ABAS"
                    :key="a.id"
                    type="button"
                    role="tab"
                    :aria-selected="aba === a.id"
                    :class="['aba', a.id, { ativa: aba === a.id }]"
                    @click="aba = a.id"
                >
                    {{ a.rotulo }}
                    <span class="conta">{{ a.itens.length }}</span>
                </button>
            </nav>
        </header>

        <p v-if="demorando" class="aviso">Está demorando mais que o normal. Aguarde.</p>

        <div v-if="carregando" class="grade">
            <Skeleton v-for="i in 6" :key="i" height="92px" border-radius="10px" />
        </div>

        <div v-else-if="erro" class="vazio">
            <p>{{ erro }}</p>
            <button type="button" class="tentar" @click="carregar">Tentar de novo</button>
        </div>

        <template v-else>
            <p v-if="abaAtiva.itens.length === 0" class="vazio">{{ VAZIO[aba] }}</p>

            <div v-else class="grade">
                <CartaoReceita
                    v-for="receita in abaAtiva.itens"
                    :key="receita.codigoRec"
                    :receita="receita"
                    :clicavel="aba !== 'aguardando'"
                    @abrir="abrir"
                />
            </div>
        </template>
    </main>
</template>

<style scoped>
.tela { max-width: 1180px; margin: 0 auto; padding: 20px 16px 48px; }
.linha-marca { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.marca { margin: 0; font-size: 0.8rem; letter-spacing: 0.08em; color: var(--cor-marca); }
h1 { margin: 4px 0 0; font-size: 1.6rem; }

.ferramentas { display: flex; gap: 12px; align-items: center; margin: 18px 0 20px; flex-wrap: wrap; }
.codigo { flex: 1; min-width: 260px; }
.data { display: flex; align-items: center; gap: 10px; }
.data-legivel { color: var(--cor-texto-suave); font-size: 0.85rem; white-space: nowrap; }

.abas {
    display: flex; gap: 4px; flex-wrap: wrap;
    border-bottom: 1px solid var(--cor-borda); margin-bottom: 20px;
}
.aba {
    display: flex; align-items: center; gap: 8px;
    padding: 11px 14px; margin-bottom: -1px;
    font: inherit; font-size: 0.9rem; cursor: pointer;
    background: none; border: 0; border-bottom: 2px solid transparent;
    color: var(--cor-texto-suave);
}
.aba.ativa { color: var(--cor-texto); border-bottom-color: var(--cor-marca); font-weight: 600; }
.conta {
    background: var(--cor-borda); color: var(--cor-texto);
    border-radius: 20px; padding: 1px 8px; font-size: 0.75rem; font-weight: 400;
}
.aba.avisar.ativa .conta { background: var(--cor-marca); color: #fff; }
.aba.aguardando.ativa .conta { background: var(--cor-alerta); color: #fff; }

/* Coluna única no celular; no desktop a largura vira mais cartão por linha,
   em vez de uma coluna estreita com muito vazio dos lados. */
.grade {
    display: grid; gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.vazio { color: var(--cor-texto-suave); font-size: 0.9rem; }
.aviso { color: var(--cor-alerta); font-size: 0.85rem; }
.tentar {
    margin-top: 8px; padding: 10px 16px; font: inherit;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
</style>
