<script setup lang="ts">
import BarraCompletude from './BarraCompletude.vue';
import type { Conferida } from '@/api/tipos';

const props = defineProps<{ receita: Conferida; clicavel: boolean }>();
const emit = defineEmits<{ abrir: [codigo: number] }>();

function acionar() {
    if (props.clicavel) emit('abrir', props.receita.codigoRec);
}
</script>

<template>
    <component
        :is="clicavel ? 'button' : 'div'"
        class="cartao"
        :class="{ pendente: !clicavel }"
        :type="clicavel ? 'button' : undefined"
        @click="acionar"
    >
        <BarraCompletude :conferidas="receita.conferidas" :total="receita.total" />
        <p class="nome">{{ receita.nome }}</p>
        <p class="meta dados">
            {{ receita.codigoRec }}
            <template v-if="receita.hora"> · {{ receita.hora }}</template>
            <template v-if="!receita.completa">
                · falta{{ receita.total - receita.conferidas > 1 ? 'm' : '' }}
                {{ receita.total - receita.conferidas }}
            </template>
        </p>
    </component>
</template>

<style scoped>
.cartao {
    position: relative;
    display: block; width: 100%;
    text-align: left;
    background: var(--cor-superficie);
    border: 1px solid var(--cor-borda);
    border-radius: var(--raio);
    padding: 12px 14px;
    font: inherit; color: inherit;
    cursor: pointer;
}
/* Receita incompleta é fisicamente diferente, não só rotulada:
   borda tracejada, recuada e sem interação. */
.cartao.pendente {
    border-style: dashed;
    background: transparent;
    color: var(--cor-texto-suave);
    cursor: default;
}
.nome { margin: 8px 0 2px; font-weight: 600; font-size: 1rem; }
.meta { margin: 0; font-size: 0.8rem; color: var(--cor-texto-suave); }
</style>
