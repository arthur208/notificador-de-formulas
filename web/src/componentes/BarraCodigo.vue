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
        <button type="button" class="acao" @click="confirmar">Abrir</button>
    </div>

    <LeitorCamera v-if="camera" @lido="receberDaCamera" @fechar="camera = false" />
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
.camera {
    padding: 14px 16px; font-size: 1.1rem;
    background: transparent; border: 1px solid var(--cor-borda);
    border-radius: var(--raio); color: var(--cor-marca); cursor: pointer;
}
.acao {
    padding: 14px 20px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: #fff;
    border: 0; border-radius: var(--raio);
}
</style>
