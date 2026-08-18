<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ conferidas: number; total: number }>();

const LIMITE_SEGMENTOS = 6;

const usarSegmentos = computed(() => props.total <= LIMITE_SEGMENTOS);
const segmentos = computed(() =>
    Array.from({ length: props.total }, (_, i) => i < props.conferidas)
);
const rotulo = computed(() => `${props.conferidas} de ${props.total} fórmulas conferidas`);
</script>

<template>
    <div class="completude" role="img" :aria-label="rotulo">
        <template v-if="usarSegmentos">
            <span v-for="(cheio, i) in segmentos" :key="i" class="seg" :class="{ cheio }" />
        </template>
        <span v-else class="numerico dados">{{ conferidas }} de {{ total }}</span>
    </div>
</template>

<style scoped>
.completude { display: flex; gap: 4px; align-items: center; }
.seg {
    width: 22px; height: 6px; border-radius: 3px;
    background: var(--cor-pendente);
}
.seg.cheio { background: var(--cor-completo); }
.numerico { font-size: 0.8rem; color: var(--cor-texto-suave); }
</style>
