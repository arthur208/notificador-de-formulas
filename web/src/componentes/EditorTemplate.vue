<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Textarea from 'primevue/textarea';
import PreviaWhatsapp from './PreviaWhatsapp.vue';
import { salvarTemplate, TIPOS_BOTAO, type Modalidade, type Template, type BotaoDef } from '@/api/config';

const props = defineProps<{
    template: Template;
    variaveisDisponiveis: string[];
    // Desligado enquanto o endpoint de botões do provedor devolve 500.
    // As definições continuam salvas e voltam sozinhas quando religar.
    botoesDisponiveis?: boolean;
}>();

const MAX_BOTOES = 3;
// O fornecedor não documenta limite. O número vem da API oficial do
// WhatsApp e serve de aviso: passando disso, ela corta na exibição.
const CABECALHO_RECOMENDADO = 60;

const cabecalho = ref(props.template.cabecalho ?? '');
const corpo = ref(props.template.corpo);
const botoes = ref<BotaoDef[]>(props.template.botoes ? [...props.template.botoes] : []);
const salvando = ref(false);
const erro = ref<string | null>(null);
const salvo = ref(false);

watch(() => props.template, (novo) => {
    cabecalho.value = novo.cabecalho ?? '';
    corpo.value = novo.corpo;
    botoes.value = novo.botoes ? [...novo.botoes] : [];
});

// Valores de exemplo só para a prévia — nunca vão para o envio.
const EXEMPLO: Record<string, string> = {
    saudacao: 'Bom dia',
    nome: 'Gracileia Rosa Tomiello',
    codigo: '441433',
    qtdFormulas: '4',
    endereco: 'Rua das Palmeiras, 123 - Centro - Querência do Norte/PR',
    cidade: 'Querência do Norte',
    dias: '3 dias úteis',
    local: 'na Farmácia Porto Rico',
    horario: 'Seg a Sex, 8h às 18h',
};

// Entrega local é a cidade da própria farmácia; qualquer outra cidade no
// exemplo faria a prévia mentir sobre quando a modalidade é usada.
const EXEMPLO_LOCAL: Record<string, string> = {
    endereco: 'Rua das Palmeiras, 123 - Centro - Loanda/PR',
    cidade: 'Loanda',
};

const exemplos = computed(() =>
    props.template.modalidade === 'entrega_local'
        ? { ...EXEMPLO, ...EXEMPLO_LOCAL }
        : EXEMPLO
);

function preencher(texto: string): string {
    return (texto ?? '').replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g,
        (achado, nome) => exemplos.value[nome] ?? achado);
}

const textoPrevia = computed(() => preencher(corpo.value));
const cabecalhoPrevia = computed(() => preencher(cabecalho.value));
const longoDemais = computed(() => cabecalho.value.length > CABECALHO_RECOMENDADO);
// Prévia não pode mostrar botão que não vai sair.
const botoesPrevia = computed(() =>
    props.botoesDisponiveis
        ? botoes.value.map((b) => ({ ...b, title: preencher(b.title) }))
        : []
);

// O compilador do Vue termina a interpolação no primeiro par de chaves de
// fechamento, mesmo dentro de string — montar isso no template não compila.
function rotulo(nome: string): string {
    return `{{${nome}}}`;
}

function inserir(nome: string) {
    corpo.value += rotulo(nome);
    salvo.value = false;
}

function acrescentarBotao() {
    if (botoes.value.length >= MAX_BOTOES) return;
    botoes.value.push({ type: 'cta_call', title: '', phone_number: '' });
    salvo.value = false;
}

function removerBotao(indice: number) {
    botoes.value.splice(indice, 1);
    salvo.value = false;
}

async function guardar() {
    salvando.value = true;
    erro.value = null;
    salvo.value = false;
    try {
        await salvarTemplate(props.template.modalidade as Modalidade, {
            cabecalho: cabecalho.value,
            corpo: corpo.value,
            botoes: botoes.value,
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
            <h3>Cabeçalho</h3>
            <div class="linha-cabecalho">
                <input
                    v-model="cabecalho"
                    type="text"
                    class="campo-cabecalho"
                    placeholder="Farmácia Bioessência Informa:"
                    @input="salvo = false"
                >
                <span :class="['contador', { estourou: longoDemais }]">
                    {{ cabecalho.length }}/{{ CABECALHO_RECOMENDADO }}
                </span>
            </div>
            <p class="dica">
                <template v-if="botoesDisponiveis && botoes.length > 0">
                    Vai no campo de título da mensagem com botões. Vazio, sai
                    <span class="exemplo">Farmácia Bioessência Informa:</span>.
                </template>
                <template v-else>
                    Sem botões, o WhatsApp não tem campo de cabeçalho: ele entra como
                    primeira linha em negrito. Vazio, a mensagem sai sem cabeçalho.
                </template>
                <span v-if="longoDemais" class="alerta">
                    Acima de {{ CABECALHO_RECOMENDADO }} caracteres o WhatsApp pode cortar.
                </span>
            </p>

            <h3 class="secao">Texto</h3>
            <Textarea v-model="corpo" auto-resize rows="10" class="campo" />

            <p class="dica">Clique para inserir:</p>
            <div class="chips">
                <button
                    v-for="nome in variaveisDisponiveis"
                    :key="nome"
                    type="button"
                    class="chip"
                    @click="inserir(nome)"
                >{{ rotulo(nome) }}</button>
            </div>
            <p v-if="variaveisDisponiveis.includes('dias')" class="dica">
                <span class="exemplo">{{ rotulo('dias') }}</span> já vem por extenso —
                <span class="exemplo">1 dia útil</span>, <span class="exemplo">2 dias úteis</span>.
                Escreva só "em {{ rotulo('dias') }}", sem repetir a unidade.
            </p>

            <template v-if="botoesDisponiveis">
            <h3 class="titulo-botoes">Botões desta mensagem</h3>
            <p class="dica">
                No máximo 3. O clique do cliente gera atendimento no MultiAtendWeb —
                este sistema não lê a resposta.
            </p>

            <div v-for="(botao, i) in botoes" :key="i" class="linha-botao">
                <select v-model="botao.type" @change="salvo = false">
                    <option v-for="t in TIPOS_BOTAO" :key="t.valor" :value="t.valor">{{ t.rotulo }}</option>
                </select>
                <input v-model="botao.title" type="text" placeholder="Texto do botão" class="titulo-campo">
                <input v-if="botao.type === 'cta_call'" v-model="botao.phone_number" type="text" placeholder="5544999999999">
                <input v-if="botao.type === 'cta_url'" v-model="botao.url" type="url" placeholder="https://...">
                <input v-if="botao.type === 'cta_copy'" v-model="botao.copy_code" type="text" placeholder="texto a copiar">
                <input v-if="botao.type === 'reply'" v-model="botao.id" type="text" placeholder="identificador">
                <button type="button" class="remover" @click="removerBotao(i)">remover</button>
            </div>

            <button v-if="botoes.length < MAX_BOTOES" type="button" class="adicionar" @click="acrescentarBotao">
                + acrescentar botão
            </button>
            </template>
        </div>

        <div class="coluna">
            <h3>Como o cliente vê</h3>
            <PreviaWhatsapp :texto="textoPrevia" :cabecalho="cabecalhoPrevia" :botoes="botoesPrevia" />
        </div>

        <div class="acoes">
            <button type="button" class="salvar" :disabled="salvando" @click="guardar">
                {{ salvando ? 'Salvando…' : 'Salvar mensagem' }}
            </button>
            <span v-if="salvo" class="ok">Salvo.</span>
            <span v-if="erro" class="erro">{{ erro }}</span>
        </div>
    </div>
</template>

<style scoped>
.editor { display: grid; grid-template-columns: 1fr auto; gap: 28px; align-items: start; }
.acoes { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
h3 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--cor-texto-suave); }
.titulo-botoes, .secao { margin-top: 28px; }
.linha-cabecalho { display: flex; align-items: center; gap: 10px; }
.campo-cabecalho {
    flex: 1; min-width: 0; padding: 10px 12px;
    font: inherit; font-size: 0.9rem; color: var(--cor-texto);
    border: 1px solid var(--cor-borda); border-radius: 6px; background: var(--cor-fundo);
}
.contador { font-size: 0.75rem; color: var(--cor-texto-suave); font-variant-numeric: tabular-nums; }
.contador.estourou { color: #b45309; font-weight: 600; }
.exemplo { font-family: var(--fonte-dados); font-size: 0.78rem; }
.alerta { display: block; margin-top: 4px; color: #b45309; }
.campo { width: 100%; font-family: var(--fonte-dados); font-size: 0.9rem; }
.dica { font-size: 0.8rem; color: var(--cor-texto-suave); margin: 12px 0 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
    font-family: var(--fonte-dados); font-size: 0.78rem;
    background: var(--cor-fundo); border: 1px solid var(--cor-borda);
    border-radius: 20px; padding: 4px 10px; cursor: pointer; color: inherit;
}
.linha-botao {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    padding: 10px; margin-bottom: 8px;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda); border-radius: var(--raio);
}
.linha-botao select, .linha-botao input {
    padding: 9px 10px; font: inherit; font-size: 0.85rem;
    border: 1px solid var(--cor-borda); border-radius: 6px;
    background: var(--cor-fundo); color: var(--cor-texto);
}
.titulo-campo { flex: 1; min-width: 130px; }
.adicionar { background: none; border: 0; color: var(--cor-marca); font: inherit; cursor: pointer; padding: 6px 0; }
.remover { background: none; border: 0; color: #b91c1c; font: inherit; cursor: pointer; }
.salvar {
    padding: 12px 22px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
.ok { color: var(--cor-completo); font-size: 0.85rem; }
.erro { color: #b91c1c; font-size: 0.85rem; }

@media (max-width: 900px) {
    .editor { grid-template-columns: 1fr; }
}
</style>
