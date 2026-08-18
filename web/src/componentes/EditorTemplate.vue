<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Textarea from 'primevue/textarea';
import PreviaWhatsapp from './PreviaWhatsapp.vue';
import { salvarTemplate, TIPOS_BOTAO, type Modalidade, type Template, type BotaoDef } from '@/api/config';

const props = defineProps<{
    template: Template;
    variaveisDisponiveis: string[];
}>();

const MAX_BOTOES = 3;

const corpo = ref(props.template.corpo);
const botoes = ref<BotaoDef[]>(props.template.botoes ? [...props.template.botoes] : []);
const salvando = ref(false);
const erro = ref<string | null>(null);
const salvo = ref(false);

watch(() => props.template, (novo) => {
    corpo.value = novo.corpo;
    botoes.value = novo.botoes ? [...novo.botoes] : [];
});

// Valores de exemplo só para a prévia — nunca vão para o envio.
const EXEMPLO: Record<string, string> = {
    saudacao: 'Bom dia',
    nome: 'Gracileia Rosa Tomiello',
    codigo: '441433',
    qtdFormulas: '4',
    endereco: 'Rua das Palmeiras, 123 - Centro - Loanda/PR',
    cidade: 'Loanda',
    dias: '2',
    local: 'na Farmácia Porto Rico',
    horario: 'Seg a Sex, 8h às 18h',
};

function preencher(texto: string): string {
    return (texto ?? '').replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g,
        (achado, nome) => EXEMPLO[nome] ?? achado);
}

const textoPrevia = computed(() => preencher(corpo.value));
const botoesPrevia = computed(() =>
    botoes.value.map((b) => ({ ...b, title: preencher(b.title) }))
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
            titulo: props.template.titulo,
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
            <h3>Texto</h3>
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
        </div>

        <div class="coluna">
            <h3>Como o cliente vê</h3>
            <PreviaWhatsapp :texto="textoPrevia" :botoes="botoesPrevia" />
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
.titulo-botoes { margin-top: 28px; }
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
