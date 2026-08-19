<script setup lang="ts">
import { computed } from 'vue';
import type { BotaoDef } from '@/api/config';

const props = defineProps<{
    texto: string;
    botoes: BotaoDef[];
    cabecalho?: string;
    remetente?: string;
}>();

const ICONE: Record<string, string> = {
    cta_call: '📞',
    cta_url: '🔗',
    cta_copy: '📋',
    reply: '↩',
};

// Negrito, itálico e riscado do WhatsApp. Escapamos antes para o texto do
// template nunca virar HTML — ele é digitado por gente e sai para o cliente.
function formatar(texto: string): string {
    const escapado = (texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return escapado
        .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
        .replace(/_([^_\n]+)_/g, '<em>$1</em>')
        .replace(/~([^~\n]+)~/g, '<s>$1</s>')
        .replace(/\n/g, '<br>');
}

const textoFormatado = computed(() => formatar(props.texto));
const cabecalhoLimpo = computed(() => (props.cabecalho ?? '').trim());

const agora = computed(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
});
</script>

<template>
    <div class="telefone">
        <div class="barra-topo">
            <span class="voltar">‹</span>
            <span class="avatar">B</span>
            <div class="contato">
                <strong>{{ remetente || 'Farmácia Bioessência' }}</strong>
                <span>online</span>
            </div>
        </div>

        <div class="conversa">
            <div class="balao">
                <p v-if="cabecalhoLimpo" class="cabecalho">{{ cabecalhoLimpo }}</p>
                <p class="corpo" v-html="textoFormatado" />
                <span class="hora">{{ agora }}</span>

                <div v-if="botoes.length > 0" class="botoes">
                    <button
                        v-for="(botao, i) in botoes"
                        :key="i"
                        type="button"
                        class="botao"
                        disabled
                    >
                        <span class="icone">{{ ICONE[botao.type] ?? '•' }}</span>
                        {{ botao.title || 'sem texto' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.telefone {
    max-width: 340px;
    border: 1px solid var(--cor-borda);
    border-radius: 18px;
    overflow: hidden;
    background: #efe7dd;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.08);
}
.barra-topo {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; background: #075e54; color: #fff;
}
.voltar { font-size: 1.3rem; line-height: 1; opacity: 0.9; }
.avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: #cfd8d4; color: #075e54;
    display: grid; place-items: center; font-weight: 700; font-size: 0.9rem;
}
.contato { display: flex; flex-direction: column; line-height: 1.2; }
.contato strong { font-size: 0.85rem; }
.contato span { font-size: 0.7rem; opacity: 0.8; }

.conversa { padding: 16px 10px 22px; min-height: 240px; }
.balao {
    max-width: 88%;
    background: #fff;
    border-radius: 0 8px 8px 8px;
    padding: 8px 10px 6px;
    box-shadow: 0 1px 1px rgb(0 0 0 / 0.12);
    position: relative;
}
.cabecalho {
    margin: 0 0 6px; font-size: 0.9rem; font-weight: 700; line-height: 1.3;
    color: #111b21; word-break: break-word;
}
.corpo {
    margin: 0; font-size: 0.86rem; line-height: 1.45;
    color: #111b21; word-break: break-word; white-space: normal;
}
.hora { display: block; text-align: right; font-size: 0.65rem; color: #667781; margin-top: 2px; }

.botoes { margin: 8px -10px -6px; border-top: 1px solid #e9edef; }
.botao {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    width: 100%; padding: 10px 8px;
    background: none; border: 0; border-top: 1px solid #e9edef;
    color: #00a5f4; font: inherit; font-size: 0.82rem;
    cursor: default;
}
.botao:first-child { border-top: 0; }
.icone { font-size: 0.8rem; }
</style>
