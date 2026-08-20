<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { entrar } from '@/estado/sessao';

const router = useRouter();
const rota = useRoute();

const email = ref('');
const senha = ref('');
const erro = ref<string | null>(null);
const enviando = ref(false);

async function submeter() {
    erro.value = null;
    enviando.value = true;
    try {
        await entrar(email.value, senha.value);
        const destino = typeof rota.query.destino === 'string' ? rota.query.destino : '/';
        router.replace(destino);
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível entrar.';
    } finally {
        enviando.value = false;
    }
}
</script>

<template>
    <main class="tela">
        <form class="cartao" @submit.prevent="submeter">
            <p class="marca">bioessência</p>
            <h1>Notificador de fórmulas</h1>

            <label for="email">E-mail</label>
            <input id="email" v-model="email" type="email" autocomplete="username" required>

            <label for="senha">Senha</label>
            <input id="senha" v-model="senha" type="password" autocomplete="current-password" required>

            <p v-if="erro" class="erro">{{ erro }}</p>

            <button type="submit" :disabled="enviando">
                {{ enviando ? 'Entrando…' : 'Entrar' }}
            </button>
        </form>
    </main>
</template>

<style scoped>
.tela { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
.cartao {
    width: 100%; max-width: 380px;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda);
    border-radius: var(--raio); padding: 28px 24px;
}
.marca { margin: 0; font-size: 0.8rem; letter-spacing: 0.08em; color: var(--cor-marca); }
h1 { margin: 4px 0 24px; font-size: 1.25rem; }
label { display: block; margin: 14px 0 6px; font-size: 0.8rem; color: var(--cor-texto-suave); }
input {
    width: 100%; padding: 13px 12px; font: inherit;
    border: 1px solid var(--cor-borda); border-radius: var(--raio);
    background: var(--cor-fundo); color: var(--cor-texto);
}
.erro { color: var(--cor-erro); font-size: 0.85rem; margin: 14px 0 0; }
button {
    width: 100%; margin-top: 20px; padding: 14px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: var(--cor-sobre-marca); border: 0; border-radius: var(--raio);
}
button:disabled { background: var(--cor-pendente); color: var(--cor-texto-suave); }
</style>
