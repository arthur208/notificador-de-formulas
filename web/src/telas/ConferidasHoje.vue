<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import DatePicker from 'primevue/datepicker';
import Skeleton from 'primevue/skeleton';
import CartaoReceita from '@/componentes/CartaoReceita.vue';
import BarraCodigo from '@/componentes/BarraCodigo.vue';
import CabecalhoApp from '@/componentes/CabecalhoApp.vue';
import { buscarConferidas } from '@/api/conferidas';
import { dataParaExibicao } from '@/formatadores';
import type { Conferida, RespostaConferidas, Modalidade } from '@/api/tipos';

type Aba = 'avisar' | 'avisadas' | 'aguardando';
type Grupo = 'todas' | 'retirada' | 'entrega' | 'entrega_local' | 'convenio';

// "Entrega sem prazo" é distinção de configuração; no balcão as duas são
// entrega, e separá-las no filtro só dividiria a lista sem motivo.
const GRUPO_DE: Record<Modalidade, Grupo> = {
    retirada: 'retirada',
    entrega: 'entrega',
    entrega_sem_prazo: 'entrega',
    entrega_local: 'entrega_local',
    convenio: 'convenio',
};

const NOME_GRUPO: Record<Grupo, string> = {
    todas: 'Todas',
    retirada: 'Retirada',
    entrega: 'Entrega',
    entrega_local: 'Entrega local',
    convenio: 'Convênio',
};

const ORDEM_GRUPO: Grupo[] = ['todas', 'retirada', 'entrega', 'entrega_local', 'convenio'];

const router = useRouter();

const dataSelecionada = ref<Date>(new Date());
const prontas = ref<Conferida[]>([]);
const aguardando = ref<Conferida[]>([]);
const carregando = ref(true);
const erro = ref<string | null>(null);
const demorando = ref(false);
const aba = ref<Aba>('avisar');
const grupo = ref<Grupo>('todas');

const INTERVALO_MS = 60_000;
const atualizadoEm = ref<Date | null>(null);
// Resultado que chegou sozinho e ainda não foi aplicado na tela.
const pendente = ref<RespostaConferidas | null>(null);
let relogio: ReturnType<typeof setInterval> | undefined;
// Descarta resposta atrasada: sem isto, a busca do dia 17 pode chegar
// depois da do dia 18 e sobrescrever a tela com o dia errado.
let geracao = 0;

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

function grupoDa(receita: Conferida): Grupo | null {
    return receita.modalidade ? GRUPO_DE[receita.modalidade] : null;
}

// Só os grupos que existem na aba, com quantos há em cada. Filtro que
// oferece "Convênio (0)" faz a atendente clicar para achar nada.
const FILTROS = computed(() => {
    const itens = abaAtiva.value.itens;
    const conta = new Map<Grupo, number>();
    for (const receita of itens) {
        const g = grupoDa(receita);
        if (g) conta.set(g, (conta.get(g) ?? 0) + 1);
    }
    const presentes = ORDEM_GRUPO.filter((g) => g !== 'todas' && conta.has(g));
    if (presentes.length < 2) return [];
    return [
        { id: 'todas' as Grupo, rotulo: NOME_GRUPO.todas, quantos: itens.length },
        ...presentes.map((g) => ({ id: g, rotulo: NOME_GRUPO[g], quantos: conta.get(g)! })),
    ];
});

const itensVisiveis = computed(() =>
    grupo.value === 'todas'
        ? abaAtiva.value.itens
        : abaAtiva.value.itens.filter((r) => grupoDa(r) === grupo.value)
);

// Trocar de aba pode deixar o filtro apontando para um grupo que não
// existe ali — a tela ficaria vazia sem explicar por quê.
watch([aba, FILTROS], () => {
    if (grupo.value !== 'todas' && !FILTROS.value.some((f) => f.id === grupo.value)) {
        grupo.value = 'todas';
    }
});

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

function aplicar(resposta: RespostaConferidas) {
    prontas.value = resposta.prontas;
    aguardando.value = resposta.aguardando;
    pendente.value = null;
}

// Comparação barata para não anunciar novidade quando nada mudou. Entram
// os campos que a tela mostra: uma fórmula a mais conferida move a receita
// de aba, e isso é mudança.
function assinatura(a: Conferida[], b: Conferida[]): string {
    return [...a, ...b]
        .map((r) => `${r.codigoRec}:${r.conferidas}/${r.total}:${r.jaAvisado ? 1 : 0}`)
        .sort().join('|');
}

function assinaturaAtual(): string {
    return assinatura(prontas.value, aguardando.value);
}

// Quais receitas da resposta ainda não estão na tela.
const novas = computed(() => {
    if (!pendente.value) return 0;
    const naTela = new Set([...prontas.value, ...aguardando.value].map((r) => r.codigoRec));
    return [...pendente.value.prontas, ...pendente.value.aguardando]
        .filter((r) => !naTela.has(r.codigoRec)).length;
});

async function carregar() {
    carregando.value = true;
    erro.value = null;
    demorando.value = false;
    pendente.value = null;
    // O Firebird já levou 21s em produção. Depois de 4s a tela avisa,
    // em vez de parecer travada.
    const avisar = setTimeout(() => { demorando.value = true; }, 4000);
    const minha = ++geracao;

    try {
        const resposta = await buscarConferidas(paraIso(dataSelecionada.value));
        if (minha !== geracao) return;
        aplicar(resposta);
        atualizadoEm.value = new Date();
    } catch (e) {
        if (minha !== geracao) return;
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
    } finally {
        clearTimeout(avisar);
        demorando.value = false;
        carregando.value = false;
    }
}

// Busca de fundo. Nunca mostra esqueleto, nunca apaga a lista boa e nunca
// mostra erro: uma queda do Firebird no meio do expediente não pode limpar
// a tela de quem está trabalhando. Se falhar, a hora congela e denuncia.
async function espiar() {
    if (carregando.value) return;
    const minha = ++geracao;
    try {
        const resposta = await buscarConferidas(paraIso(dataSelecionada.value));
        if (minha !== geracao) return;
        atualizadoEm.value = new Date();
        // Encaixar receita nova no meio da lista move os cartões debaixo do
        // dedo da atendente, e o toque cai no cliente errado. Ela decide
        // a hora de aplicar.
        if (assinatura(resposta.prontas, resposta.aguardando) === assinaturaAtual()) return;
        if (prontas.value.length === 0 && aguardando.value.length === 0) aplicar(resposta);
        else pendente.value = resposta;
    } catch {
        // Silêncio proposital: a lista continua, e a hora parada avisa.
    }
}

const horaAtualizacao = computed(() =>
    atualizadoEm.value
        ? atualizadoEm.value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : ''
);

// Dia passado não muda mais: o filtro é pela data da conferência.
function ehHoje(): boolean {
    return paraIso(dataSelecionada.value) === paraIso(new Date());
}

function agendar() {
    if (relogio) clearInterval(relogio);
    relogio = undefined;
    if (!ehHoje()) return;
    relogio = setInterval(() => {
        if (document.visibilityState === 'visible') espiar();
    }, INTERVALO_MS);
}

// Celular no bolso não roda timer. Ao voltar para a tela, busca na hora
// em vez de esperar o próximo minuto.
function aoVoltar() {
    if (document.visibilityState === 'visible' && ehHoje()) espiar();
}

watch(dataSelecionada, () => { carregar(); agendar(); }, { immediate: true });

onMounted(() => document.addEventListener('visibilitychange', aoVoltar));
onUnmounted(() => {
    document.removeEventListener('visibilitychange', aoVoltar);
    if (relogio) clearInterval(relogio);
});

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
                <button type="button" class="atualizar" :disabled="carregando" @click="carregar()">
                    <span aria-hidden="true">↻</span>
                    <span v-if="atualizadoEm" class="hora-att">{{ horaAtualizacao }}</span>
                    <span v-else>Atualizar</span>
                </button>
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

            <nav v-if="FILTROS.length > 0" class="filtros" aria-label="Filtrar por tipo">
                <button
                    v-for="f in FILTROS"
                    :key="f.id"
                    type="button"
                    :class="['filtro', f.id, { ativo: grupo === f.id }]"
                    :aria-pressed="grupo === f.id"
                    @click="grupo = f.id"
                >
                    {{ f.rotulo }}
                    <span class="quantos">{{ f.quantos }}</span>
                </button>
            </nav>
        </header>

        <p v-if="demorando" class="aviso">Está demorando mais que o normal. Aguarde.</p>

        <button v-if="pendente" type="button" class="novidade" @click="aplicar(pendente)">
            <template v-if="novas > 0">
                {{ novas }} {{ novas === 1 ? 'receita nova' : 'receitas novas' }} · mostrar
            </template>
            <template v-else>A lista mudou · mostrar</template>
        </button>

        <div v-if="carregando" class="grade">
            <Skeleton v-for="i in 6" :key="i" height="92px" border-radius="10px" />
        </div>

        <div v-else-if="erro" class="vazio">
            <p>{{ erro }}</p>
            <button type="button" class="tentar" @click="carregar">Tentar de novo</button>
        </div>

        <template v-else>
            <p v-if="abaAtiva.itens.length === 0" class="vazio">{{ VAZIO[aba] }}</p>

            <p v-else-if="itensVisiveis.length === 0" class="vazio">
                Nenhuma receita de {{ NOME_GRUPO[grupo].toLowerCase() }} nesta aba.
            </p>

            <div v-else class="grade">
                <CartaoReceita
                    v-for="receita in itensVisiveis"
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
.atualizar {
    display: flex; align-items: center; gap: 7px; white-space: nowrap;
    padding: 10px 14px; font: inherit; font-size: 0.85rem; cursor: pointer;
    color: var(--cor-texto-suave); background: var(--cor-fundo);
    border: 1px solid var(--cor-borda); border-radius: 8px;
}
.atualizar:hover:not(:disabled) { color: var(--cor-marca); border-color: var(--cor-marca); }
.atualizar:disabled { opacity: 0.5; cursor: default; }
.hora-att { font-variant-numeric: tabular-nums; }

.novidade {
    display: block; width: 100%; margin-bottom: 16px;
    padding: 11px 16px; font: inherit; font-size: 0.9rem; font-weight: 600; cursor: pointer;
    color: var(--cor-sobre-marca); background: var(--cor-marca); border: 0; border-radius: var(--raio);
}
.data-legivel { color: var(--cor-texto-suave); font-size: 0.85rem; white-space: nowrap; }

.abas {
    display: flex; gap: 4px; flex-wrap: wrap;
    border-bottom: 1px solid var(--cor-borda);
}

.filtros { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 20px; }
.filtro {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 12px; font: inherit; font-size: 0.82rem; cursor: pointer;
    color: var(--cor-texto-suave);
    background: var(--cor-fundo);
    border: 1px solid var(--cor-borda); border-radius: 20px;
}
.filtro:hover { color: var(--cor-texto); }
.filtro .quantos {
    font-size: 0.72rem; font-variant-numeric: tabular-nums;
    background: var(--cor-borda); color: var(--cor-texto);
    border-radius: 20px; padding: 0 6px;
}
/* Ativo assume a cor do selo do cartão: o filtro e o que ele filtra
   precisam ser reconhecíveis como a mesma coisa. */
.filtro.ativo { font-weight: 600; }
.filtro.todas.ativo { background: var(--cor-marca); border-color: var(--cor-marca); color: var(--cor-sobre-marca); }
.filtro.retirada.ativo { background: var(--selo-retirada-fundo); border-color: var(--selo-retirada-texto); color: var(--selo-retirada-texto); }
.filtro.entrega.ativo { background: var(--selo-entrega-fundo); border-color: var(--selo-entrega-texto); color: var(--selo-entrega-texto); }
.filtro.entrega_local.ativo { background: var(--selo-local-fundo); border-color: var(--selo-local-texto); color: var(--selo-local-texto); }
.filtro.convenio.ativo { background: var(--selo-convenio-fundo); border-color: var(--selo-convenio-texto); color: var(--selo-convenio-texto); }
.filtro.ativo .quantos { background: rgb(255 255 255 / 0.55); }
.filtro.todas.ativo .quantos { background: rgb(255 255 255 / 0.25); color: var(--cor-sobre-marca); }
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
.aba.avisar.ativa .conta { background: var(--cor-marca); color: var(--cor-sobre-marca); }
.aba.aguardando.ativa .conta { background: var(--cor-alerta); color: var(--cor-fundo); }

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
    background: var(--cor-marca); color: var(--cor-sobre-marca); border: 0; border-radius: var(--raio);
}
</style>
