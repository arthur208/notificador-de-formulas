<script setup lang="ts">
import BarraCompletude from './BarraCompletude.vue';
import type { Conferida, Modalidade } from '@/api/tipos';

// "entrega sem prazo" é distinção de configuração, não de balcão: para a
// atendente as duas são entrega. O aviso de prazo faltando vem à parte.
const ROTULO: Record<Modalidade, string> = {
    retirada: 'Retirada',
    entrega: 'Entrega',
    entrega_sem_prazo: 'Entrega',
    entrega_local: 'Entrega local',
    convenio: 'Convênio',
};

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

        <p v-if="receita.modalidade" class="selos">
            <span :class="['selo', receita.modalidade]">{{ ROTULO[receita.modalidade] }}</span>
            <span v-if="receita.detalhe" class="detalhe">{{ receita.detalhe }}</span>
            <span v-if="receita.semPrazo" class="sem-prazo" title="Cidade sem prazo cadastrado">
                sem prazo
            </span>
        </p>

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
.selos { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 0; }
.selo {
    font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 20px;
    text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
}
.selo.retirada { background: #e0e7ff; color: #3730a3; }
.selo.entrega, .selo.entrega_sem_prazo { background: #ffedd5; color: #9a3412; }
.selo.entrega_local { background: #cffafe; color: #155e75; }
.selo.convenio { background: #f3e8ff; color: #6b21a8; }
.detalhe { font-size: 0.75rem; color: var(--cor-texto-suave); }
.sem-prazo {
    font-size: 0.68rem; padding: 2px 7px; border-radius: 20px;
    background: #fef3c7; color: #92400e; white-space: nowrap;
}
.cartao.pendente .selo { opacity: 0.65; }

.nome { margin: 6px 0 2px; font-weight: 600; font-size: 1rem; }
.meta { margin: 0; font-size: 0.8rem; color: var(--cor-texto-suave); }
</style>
