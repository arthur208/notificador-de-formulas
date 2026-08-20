<script setup lang="ts">
import { ref, onMounted } from 'vue';
import LeitorCamera from './LeitorCamera.vue';

const emit = defineEmits<{ abrir: [codigo: number] }>();

const valor = ref('');
const campo = ref<HTMLInputElement | null>(null);
const camera = ref(false);

// Sem câmera disponível — o PC do balcão, por exemplo — o botão só
// ocuparia espaço.
const temCamera = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

// Foco automático: o leitor do balcão digita direto, sem a atendente
// precisar tocar no campo antes.
onMounted(() => campo.value?.focus());

function confirmar() {
    const codigo = Number(valor.value.replace(/\D/g, ''));
    if (!Number.isInteger(codigo) || codigo <= 0) return;
    emit('abrir', codigo);
    valor.value = '';
}

function receberDaCamera(texto: string) {
    valor.value = texto.replace(/\D/g, '');
    confirmar();
}
</script>

<template>
    <div class="barra">
        <!-- Raiz única de propósito: com mais de um nó raiz — inclusive um
             comentário solto — o Vue não repassa a classe recebida de fora,
             e o flex do container não chega aqui. -->
        <div class="campo-grupo">
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
            <button
                v-if="temCamera"
                type="button"
                class="camera"
                aria-label="Ler código de barras"
                @click="camera = true"
            >▣</button>
        </div>
        <button type="button" class="acao" @click="confirmar">Abrir</button>

        <LeitorCamera v-if="camera" @lido="receberDaCamera" @fechar="camera = false" />
    </div>
</template>

<style scoped>
.barra { display: flex; gap: 8px; align-items: stretch; }
.campo-grupo {
    flex: 1; min-width: 0; display: flex; align-items: center;
    background: var(--cor-superficie);
    border: 1px solid var(--cor-borda); border-radius: var(--raio);
}
.campo-grupo:focus-within { border-color: var(--cor-marca); }
.campo {
    flex: 1; min-width: 0;
    padding: 13px 14px; font-size: 1rem;
    border: 0; background: none; color: var(--cor-texto);
}
.campo:focus { outline: none; }
.camera {
    padding: 10px 14px; margin-right: 4px; font-size: 1.1rem;
    background: none; border: 0; border-radius: 8px;
    color: var(--cor-marca); cursor: pointer;
}
.acao {
    padding: 13px 22px; font: inherit; font-weight: 600; white-space: nowrap;
    background: var(--cor-marca); color: var(--cor-sobre-marca);
    border: 0; border-radius: var(--raio);
}
</style>
