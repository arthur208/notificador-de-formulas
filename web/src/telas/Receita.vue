<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Skeleton from 'primevue/skeleton';
import {
    buscarReceita, buscarMensagem, enviarAviso, listarTelefones, validarNumeros,
    type DetalheReceita, type Telefone, type Situacao, type Previa,
} from '@/api/receita';
import { formatarTelefone } from '@/formatadores';
import CabecalhoApp from '@/componentes/CabecalhoApp.vue';
import PreviaWhatsapp from '@/componentes/PreviaWhatsapp.vue';

const rota = useRoute();
const router = useRouter();
const toast = useToast();

const codigo = Number(rota.params.codigo);
const detalhe = ref<DetalheReceita | null>(null);
const telefones = ref<Telefone[]>([]);
const escolhido = ref<string | null>(null);
const previa = ref<Previa | null>(null);
const carregando = ref(true);
const enviando = ref(false);
const erro = ref<string | null>(null);
const convenioEscolhido = ref<number | null>(null);

// A tela não redige, confere. O texto final é montado pelo servidor a
// partir do template vigente; aqui só mostramos como vai chegar.
const faltando = ref<string[] | null>(null);

// Situação de cada número, por número. A API devolve o número normalizado
// (o ERP tem telefone sem DDI), e é ele que vai no envio.
const situacoes = ref<Record<string, Situacao>>({});
const numeroEnvio = ref<Record<string, string>>({});
const validando = ref(false);

const avulso = ref('');
const avulsoAberto = ref(false);
const validandoAvulso = ref(false);

const SELO: Record<Situacao, string> = {
    tem: 'tem WhatsApp',
    nao_tem: 'sem WhatsApp',
    desconhecido: 'não checado',
    invalido: 'número inválido',
};

const escolhidoSemWhatsapp = computed(
    () => escolhido.value !== null && situacoes.value[escolhido.value] === 'nao_tem'
);

function guardar(resultados: { numero: string; situacao: Situacao; numeroEnvio: string | null }[]) {
    for (const r of resultados) {
        situacoes.value[r.numero] = r.situacao;
        if (r.numeroEnvio) numeroEnvio.value[r.numero] = r.numeroEnvio;
    }
}

// A validação não bloqueia a tela: ela chega depois e só acrescenta selo.
// Se a API estiver fora, todos ficam "não checado" e o envio continua.
async function checarTelefones() {
    if (telefones.value.length === 0) return;
    validando.value = true;
    try {
        guardar(await validarNumeros(telefones.value.map((t) => t.numero)));
        // Com um número que tem WhatsApp e o atual sem, troca a sugestão.
        const comWhats = telefones.value.find((t) => situacoes.value[t.numero] === 'tem');
        if (comWhats && situacoes.value[escolhido.value ?? ''] !== 'tem') {
            escolhido.value = comWhats.numero;
        }
    } catch {
        // Sem selo é o estado anterior do sistema; não é motivo de alarme.
    } finally {
        validando.value = false;
    }
}

async function usarAvulso() {
    const numero = avulso.value.trim();
    if (numero === '') return;
    validandoAvulso.value = true;
    try {
        const [resultado] = await validarNumeros([numero]);
        if (resultado.situacao === 'invalido') {
            toast.add({ severity: 'warn', summary: 'Número inválido', detail: 'Verifique o DDD.', life: 4000 });
            return;
        }
        if (!telefones.value.some((t) => t.numero === numero)) {
            telefones.value = [...telefones.value, { rotulo: 'digitado', numero }];
        }
        guardar([resultado]);
        escolhido.value = numero;
        avulso.value = '';
        avulsoAberto.value = false;
    } catch {
        toast.add({ severity: 'error', summary: 'Não foi possível validar', life: 4000 });
    } finally {
        validandoAvulso.value = false;
    }
}

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
        previa.value = dados.previa;
        faltando.value = dados.faltando;
        // Sugere marcado quando há exatamente um. Com dois, a tela pergunta:
        // 17 clientes têm dois convênios e não cabe ao sistema escolher.
        if (dados.conveniosSugeridos?.length === 1) {
            convenioEscolhido.value = dados.conveniosSugeridos[0].codigoTs;
        }
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Receita não encontrada.';
    } finally {
        carregando.value = false;
    }
    checarTelefones();
});

// Convênio troca o template inteiro; a prévia tem que acompanhar, senão
// a atendente lê uma mensagem e o cliente recebe outra.
watch(convenioEscolhido, async (valor) => {
    try {
        previa.value = await buscarMensagem(codigo, valor);
        faltando.value = null;
    } catch {
        previa.value = null;
        faltando.value = ['convênio'];
    }
});

async function enviar() {
    if (!escolhido.value || !detalhe.value) return;
    enviando.value = true;
    try {
        const r = await enviarAviso({
            codigoReceita: codigo,
            // O número que a API normalizou, quando existe: o ERP guarda
            // telefone sem DDI e é esse que o WhatsApp reconhece.
            telefoneEscolhido: numeroEnvio.value[escolhido.value] ?? escolhido.value,
            nomeCliente: detalhe.value.dadosCliente.nome,
            convenioTs: convenioEscolhido.value ?? undefined,
        });
        toast.add(
            r?.semBotoes
                ? {
                    severity: 'warn',
                    summary: 'Enviado sem os botões',
                    detail: 'O provedor recusou os botões; o texto foi entregue.',
                    life: 6000,
                }
                : { severity: 'success', summary: 'Aviso enviado', life: 3000 }
        );
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
            <span class="espaco" />
            <CabecalhoApp />
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

            <p v-if="detalhe.jaEnviado" class="ja-avisado">
                Esta receita já foi avisada. Enviar de novo repete a mensagem para o cliente.
            </p>

            <h2>
                Para qual número?
                <span v-if="validando" class="checando">checando no WhatsApp…</span>
            </h2>
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
                <span
                    v-if="situacoes[telefone.numero]"
                    :class="['selo', situacoes[telefone.numero]]"
                >{{ SELO[situacoes[telefone.numero]] }}</span>
            </button>

            <button
                v-if="!avulsoAberto"
                type="button"
                class="outro"
                @click="avulsoAberto = true"
            >+ usar outro número</button>

            <div v-else class="linha-avulso">
                <input
                    v-model="avulso"
                    type="tel"
                    inputmode="numeric"
                    placeholder="44 99113-5801"
                    class="campo-avulso dados"
                    @keyup.enter="usarAvulso"
                >
                <button
                    type="button"
                    class="checar"
                    :disabled="avulso.trim() === '' || validandoAvulso"
                    @click="usarAvulso"
                >{{ validandoAvulso ? 'Checando…' : 'Checar' }}</button>
                <button type="button" class="cancelar" @click="avulsoAberto = false">cancelar</button>
            </div>

            <p v-if="escolhidoSemWhatsapp" class="alerta-numero">
                Este número não tem WhatsApp. O envio vai falhar — escolha outro
                ou digite um número novo.
            </p>

            <h2>Como vai chegar</h2>
            <p v-if="faltando" class="alerta-numero">
                O template desta modalidade usa {{ faltando.join(', ') }}, que não
                está disponível aqui. Ajuste em Configurações — sem isso o envio falha.
            </p>
            <template v-else-if="previa">
                <PreviaWhatsapp
                    class="previa"
                    :texto="previa.texto"
                    :cabecalho="previa.cabecalho"
                    :botoes="previa.botoes"
                />
                <p class="dica-texto">
                    Para mudar este texto, edite o template em
                    <button type="button" class="atalho" @click="router.push({ name: 'configuracoes' })">
                        Configurações
                    </button>.
                </p>
            </template>

            <div class="rodape">
                <button
                    type="button"
                    class="enviar"
                    :disabled="!escolhido || enviando || faltando !== null || previa === null"
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
.espaco { flex: 1; }
h1 { margin: 0 0 4px; font-size: 1.4rem; }
.modalidade { margin: 0 0 20px; color: var(--cor-marca); font-size: 0.85rem; }
.ja-avisado {
    background: var(--cor-aviso-fundo); border: 1px solid var(--cor-aviso-borda); color: var(--cor-alerta);
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
.rotulo { color: var(--cor-texto-suave); font-size: 0.8rem; margin-left: auto; margin-right: 10px; }
.checando { text-transform: none; letter-spacing: 0; font-weight: 400; margin-left: 8px; }

.selo { font-size: 0.72rem; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
.selo.tem { background: var(--cor-ok-fundo); color: var(--cor-ok); }
.selo.nao_tem { background: var(--cor-erro-fundo); color: var(--cor-erro); }
.selo.desconhecido { background: var(--cor-borda); color: var(--cor-texto-suave); }
.selo.invalido { background: var(--selo-neutro-fundo); color: var(--cor-aviso); }

.outro { background: none; border: 0; color: var(--cor-marca); font: inherit; cursor: pointer; padding: 6px 0; }
.linha-avulso { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
.campo-avulso {
    flex: 1; min-width: 0; padding: 13px 12px; font-size: 0.95rem; color: var(--cor-texto);
    border: 1px solid var(--cor-borda); border-radius: var(--raio); background: var(--cor-superficie);
}
.checar {
    padding: 13px 18px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: var(--cor-sobre-marca); border: 0; border-radius: var(--raio); cursor: pointer;
}
.checar:disabled { background: var(--cor-pendente); color: var(--cor-texto-suave); }
.cancelar { background: none; border: 0; color: var(--cor-texto-suave); font: inherit; cursor: pointer; }
.alerta-numero {
    margin: 10px 0 0; padding: 10px 12px; font-size: 0.85rem;
    background: var(--cor-erro-fundo); border: 1px solid var(--cor-erro-borda); color: var(--cor-erro); border-radius: var(--raio);
}
.previa { margin: 0 auto; }
.dica-texto { margin: 10px 0 0; font-size: 0.78rem; color: var(--cor-texto-suave); text-align: center; }
.atalho { background: none; border: 0; padding: 0; font: inherit; color: var(--cor-marca); cursor: pointer; }
.convenios { margin: 16px 0; }
.rotulo-convenio {
    margin: 0 0 8px; font-size: 0.78rem; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--cor-texto-suave);
}
.chip-convenio {
    padding: 8px 14px; margin: 0 6px 6px 0; font: inherit;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda);
    border-radius: 20px; cursor: pointer; color: inherit;
}
.chip-convenio.ativo { border-color: var(--cor-marca); border-width: 2px; color: var(--cor-marca); }
.dica-convenio { margin: 4px 0 0; font-size: 0.78rem; color: var(--cor-texto-suave); }
.rodape {
    position: fixed; left: 0; right: 0; bottom: 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--cor-superficie); border-top: 1px solid var(--cor-borda);
}
.enviar {
    width: 100%; padding: 16px; font: inherit; font-weight: 600; font-size: 1rem;
    background: var(--cor-marca); color: var(--cor-sobre-marca); border: 0; border-radius: var(--raio);
}
.enviar:disabled { background: var(--cor-pendente); color: var(--cor-texto-suave); }
.vazio { color: var(--cor-texto-suave); }
.tentar {
    margin-top: 8px; padding: 10px 16px; font: inherit;
    background: var(--cor-marca); color: var(--cor-sobre-marca); border: 0; border-radius: var(--raio);
}
</style>
