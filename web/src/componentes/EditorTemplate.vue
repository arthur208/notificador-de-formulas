<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Textarea from 'primevue/textarea';
import { salvarTemplate, type Modalidade, type Template } from '@/api/config';

const props = defineProps<{
    template: Template;
    variaveisDisponiveis: string[];
}>();

const corpo = ref(props.template.corpo);
const salvando = ref(false);
const erro = ref<string | null>(null);
const salvo = ref(false);

watch(() => props.template, (novo) => { corpo.value = novo.corpo; });

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

const previa = computed(() =>
    corpo.value.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g,
        (achado, nome) => EXEMPLO[nome] ?? achado)
);

// O rótulo é montado aqui porque o compilador do Vue termina a interpolação
// no primeiro par de chaves de fechamento que encontra, mesmo dentro de uma
// string — montar isso no template não compila.
function rotulo(nome: string): string {
    return `{{${nome}}}`;
}

function inserir(nome: string) {
    corpo.value += `{{${nome}}}`;
    salvo.value = false;
}

async function guardar() {
    salvando.value = true;
    erro.value = null;
    salvo.value = false;
    try {
        await salvarTemplate(props.template.modalidade as Modalidade, {
            titulo: props.template.titulo, corpo: corpo.value,
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
            <Textarea v-model="corpo" auto-resize rows="12" class="campo" />

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
        </div>

        <div class="coluna">
            <h3>Prévia</h3>
            <pre class="previa">{{ previa }}</pre>
        </div>

        <div class="acoes">
            <button type="button" class="salvar" :disabled="salvando" @click="guardar">
                {{ salvando ? 'Salvando…' : 'Salvar texto' }}
            </button>
            <span v-if="salvo" class="ok">Salvo.</span>
            <span v-if="erro" class="erro">{{ erro }}</span>
        </div>
    </div>
</template>

<style scoped>
.editor { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.acoes { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
h3 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--cor-texto-suave); }
.campo { width: 100%; font-family: var(--fonte-dados); font-size: 0.9rem; }
.previa {
    white-space: pre-wrap; word-break: break-word; margin: 0;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda);
    border-radius: var(--raio); padding: 14px; min-height: 240px; font: inherit;
}
.dica { font-size: 0.8rem; color: var(--cor-texto-suave); margin: 12px 0 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
    font-family: var(--fonte-dados); font-size: 0.78rem;
    background: var(--cor-fundo); border: 1px solid var(--cor-borda);
    border-radius: 20px; padding: 4px 10px; cursor: pointer; color: inherit;
}
.salvar {
    padding: 12px 22px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
.ok { color: var(--cor-completo); font-size: 0.85rem; }
.erro { color: #b91c1c; font-size: 0.85rem; }

@media (max-width: 720px) {
    .editor { grid-template-columns: 1fr; }
}
</style>
