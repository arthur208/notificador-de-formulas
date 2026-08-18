<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Html5Qrcode } from 'html5-qrcode';

const emit = defineEmits<{ lido: [codigo: string]; fechar: [] }>();

const ID_ELEMENTO = 'leitor-camera';
const erro = ref<string | null>(null);
let leitor: Html5Qrcode | null = null;

onMounted(async () => {
    try {
        leitor = new Html5Qrcode(ID_ELEMENTO);
        await leitor.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 280, height: 140 } },
            (texto) => {
                emit('lido', texto);
                emit('fechar');
            },
            () => { /* quadro sem código: normal, não é erro */ }
        );
    } catch {
        // Causa mais comum: página servida sem HTTPS. A câmera exige
        // contexto seguro; localhost é aceito, IP da rede local não.
        erro.value = 'Não foi possível abrir a câmera. Verifique a permissão e se o endereço usa HTTPS.';
    }
});

onBeforeUnmount(async () => {
    try {
        if (leitor?.isScanning) await leitor.stop();
        leitor?.clear();
    } catch { /* já parado */ }
});
</script>

<template>
    <div class="sobreposicao">
        <div class="cabecalho">
            <span>Aponte para o código de barras</span>
            <button type="button" class="fechar" @click="emit('fechar')" aria-label="Fechar">✕</button>
        </div>

        <div :id="ID_ELEMENTO" class="visor" />

        <p v-if="erro" class="erro">
            {{ erro }}
            <br>Use o leitor do balcão ou digite o número.
        </p>
    </div>
</template>

<style scoped>
.sobreposicao {
    position: fixed; inset: 0; z-index: 50;
    background: #000; color: #fff;
    display: flex; flex-direction: column;
}
.cabecalho {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px calc(16px + env(safe-area-inset-right)) 16px 16px;
    font-size: 0.9rem;
}
.fechar { background: none; border: 0; color: #fff; font-size: 1.2rem; cursor: pointer; }
.visor { flex: 1; }
.erro { padding: 20px; font-size: 0.9rem; line-height: 1.5; }
</style>
