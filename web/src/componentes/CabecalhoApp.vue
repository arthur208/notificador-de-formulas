<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { usuarioAtual, podeGerir, sair } from '@/estado/sessao';

const router = useRouter();
const aberto = ref(false);
const raiz = ref<HTMLElement | null>(null);

function ir(nome: string) {
    aberto.value = false;
    router.push({ name: nome });
}

async function encerrar() {
    aberto.value = false;
    await sair();
    router.replace({ name: 'entrar' });
}

// Fecha ao tocar fora — sem isso o menu fica preso aberto no celular.
function cliqueFora(evento: MouseEvent) {
    if (raiz.value && !raiz.value.contains(evento.target as Node)) aberto.value = false;
}
onMounted(() => document.addEventListener('click', cliqueFora));
onBeforeUnmount(() => document.removeEventListener('click', cliqueFora));
</script>

<template>
    <div ref="raiz" class="menu">
        <button
            type="button"
            class="gatilho"
            :aria-expanded="aberto"
            aria-label="Abrir menu"
            @click="aberto = !aberto"
        >☰</button>

        <div v-if="aberto" class="painel" role="menu">
            <p v-if="usuarioAtual" class="quem">
                {{ usuarioAtual.nome }}
                <span class="papel">{{ usuarioAtual.papel }}</span>
            </p>

            <button type="button" role="menuitem" @click="ir('hoje')">Conferidas hoje</button>
            <button type="button" role="menuitem" @click="ir('historico')">Histórico</button>
            <button v-if="podeGerir()" type="button" role="menuitem" @click="ir('configuracoes')">
                Configurações
            </button>

            <hr>
            <button type="button" role="menuitem" class="sair" @click="encerrar">Sair</button>
        </div>
    </div>
</template>

<style scoped>
.menu { position: relative; }
.gatilho {
    background: none; border: 1px solid var(--cor-borda); border-radius: var(--raio);
    padding: 8px 12px; font-size: 1.1rem; cursor: pointer; color: var(--cor-texto);
    line-height: 1;
}
.painel {
    position: absolute; right: 0; top: calc(100% + 6px); z-index: 20;
    min-width: 210px; padding: 6px;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda);
    border-radius: var(--raio); box-shadow: 0 8px 24px rgb(0 0 0 / 0.08);
}
.quem {
    margin: 6px 10px 10px; font-size: 0.8rem; color: var(--cor-texto-suave);
    display: flex; flex-direction: column; gap: 2px;
}
.papel { text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.68rem; color: var(--cor-marca); }
.painel button {
    display: block; width: 100%; text-align: left;
    padding: 11px 10px; font: inherit; color: inherit;
    background: none; border: 0; border-radius: 6px; cursor: pointer;
}
.painel button:hover { background: var(--cor-fundo); }
hr { border: 0; border-top: 1px solid var(--cor-borda); margin: 6px 4px; }
.sair { color: #b91c1c; }
</style>
