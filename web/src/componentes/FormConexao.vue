<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { lerCanal, salvarCanal, type Canal } from '@/api/config';

const canal = ref<Canal | null>(null);
const token = ref('');
const clientId = ref('');
const clientSecret = ref('');
const numeroRemetente = ref('');
const botoesAtivos = ref(false);

const salvando = ref(false);
const salvo = ref(false);
const erro = ref<string | null>(null);

async function recarregar() {
    try {
        const dados = await lerCanal();
        canal.value = dados.canal;
        numeroRemetente.value = dados.canal?.numeroRemetente ?? '';
        botoesAtivos.value = dados.canal?.botoesAtivos ?? false;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
    }
}

onMounted(recarregar);

async function guardar() {
    salvando.value = true;
    salvo.value = false;
    erro.value = null;
    try {
        await salvarCanal({
            // Campo em branco significa "manter o valor atual" — a tela
            // nunca recebe o segredo cheio de volta.
            token: token.value || undefined,
            clientId: clientId.value || undefined,
            clientSecret: clientSecret.value || undefined,
            numeroRemetente: numeroRemetente.value,
            botoesAtivos: botoesAtivos.value,
            ativo: true,
        });
        token.value = '';
        clientId.value = '';
        clientSecret.value = '';
        salvo.value = true;
        await recarregar();
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível salvar.';
    } finally {
        salvando.value = false;
    }
}
</script>

<template>
    <div>
        <p class="explica">
            As credenciais ficam gravadas cifradas e nunca são exibidas por inteiro.
            Deixe um campo em branco para manter o valor atual.
        </p>
        <p v-if="erro" class="erro">{{ erro }}</p>

        <div class="campos">
            <label>
                Token da conexão
                <span class="atual">atual: {{ canal?.token ?? '—' }}</span>
                <input v-model="token" type="password" autocomplete="off" placeholder="deixe em branco para manter">
            </label>

            <label>
                client_id
                <span class="atual">atual: {{ canal?.clientId ?? '—' }}</span>
                <input v-model="clientId" type="password" autocomplete="off" placeholder="deixe em branco para manter">
            </label>

            <label>
                client_secret
                <span class="atual">atual: {{ canal?.clientSecret ?? '—' }}</span>
                <input v-model="clientSecret" type="password" autocomplete="off" placeholder="deixe em branco para manter">
            </label>

            <label>
                Número remetente
                <span class="atual">só dígitos, com DDI</span>
                <input v-model="numeroRemetente" type="text" inputmode="numeric" placeholder="5544999999999">
            </label>
        </div>

        <h3>Botões na mensagem</h3>
        <p class="explica">
            Interruptor geral. Os botões de cada mensagem são definidos em
            <strong>Mensagens</strong>, junto do texto — cada modalidade tem os seus.
        </p>

        <label class="ligar">
            <input v-model="botoesAtivos" type="checkbox"> enviar mensagens com botões
        </label>

        <div class="acoes">
            <button type="button" class="salvar" :disabled="salvando" @click="guardar">
                {{ salvando ? 'Salvando…' : 'Salvar conexão' }}
            </button>
            <span v-if="salvo" class="ok">Salvo.</span>
        </div>
    </div>
</template>

<style scoped>
.explica { color: var(--cor-texto-suave); font-size: 0.85rem; }
.campos { display: grid; gap: 16px; max-width: 520px; margin: 20px 0 32px; }
label { display: grid; gap: 4px; font-size: 0.85rem; }
.atual { font-family: var(--fonte-dados); font-size: 0.78rem; color: var(--cor-texto-suave); }
input, select {
    padding: 11px 12px; font: inherit;
    border: 1px solid var(--cor-borda); border-radius: var(--raio);
    background: var(--cor-superficie); color: var(--cor-texto);
}
h3 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--cor-texto-suave); }
.ligar { display: flex; align-items: center; gap: 8px; margin: 12px 0 16px; }
.botao {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    padding: 12px; margin-bottom: 8px;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda); border-radius: var(--raio);
}
.titulo { flex: 1; min-width: 140px; }
.adicionar { background: none; border: 0; color: var(--cor-marca); font: inherit; cursor: pointer; padding: 8px 0; }
.remover { background: none; border: 0; color: #b91c1c; font: inherit; cursor: pointer; }
.acoes { display: flex; align-items: center; gap: 12px; margin-top: 24px; }
.salvar {
    padding: 12px 22px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
.ok { color: var(--cor-completo); font-size: 0.85rem; }
.erro { color: #b91c1c; }
</style>
