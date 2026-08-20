<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { lerCidades, lerSugestoes, salvarCidade, removerCidade, type Cidade, type Sugestao } from '@/api/config';

const cidades = ref<Cidade[]>([]);
const sugestoes = ref<Sugestao[]>([]);
const carregando = ref(true);
const erro = ref<string | null>(null);
const salvando = ref(false);

const escolhida = ref<number | null>(null);
const dias = ref(2);
const local = ref(false);

// A sugestão traz só cidades com entrega recente e ainda sem cadastro —
// é exatamente a lista que faz sentido oferecer.
watch(escolhida, () => { dias.value = 2; local.value = false; });

async function recarregar() {
    carregando.value = true;
    erro.value = null;
    try {
        const [a, b] = await Promise.all([lerCidades(), lerSugestoes()]);
        cidades.value = a.cidades;
        sugestoes.value = b.sugestoes;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
    } finally {
        carregando.value = false;
    }
}

onMounted(recarregar);

async function adicionar() {
    if (!escolhida.value) return;
    const cidade = sugestoes.value.find((s) => s.codigoCid === escolhida.value);
    erro.value = null;
    salvando.value = true;
    try {
        await salvarCidade(escolhida.value, {
            nome: cidade?.nome, uf: cidade?.uf,
            dias: dias.value, local: local.value, ativo: true,
        });
        escolhida.value = null;
        await recarregar();
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível adicionar.';
    } finally {
        salvando.value = false;
    }
}

async function guardar(cidade: Cidade) {
    erro.value = null;
    try {
        await salvarCidade(cidade.codigoCid, cidade);
    } catch (e) {
        erro.value = e instanceof Error ? e.message : null;
        await recarregar();
    }
}

async function apagar(codigoCid: number) {
    await removerCidade(codigoCid);
    await recarregar();
}
</script>

<template>
    <div>
        <p class="explica">
            Só as cidades cadastradas aqui ganham promessa de prazo. Para as demais,
            a mensagem sai sem prazo em vez de inventar um.
        </p>
        <p v-if="erro" class="erro">{{ erro }}</p>

        <div class="formulario">
            <label class="cresce">
                Cidade
                <select v-model="escolhida">
                    <option :value="null" disabled>Escolha uma cidade…</option>
                    <option v-for="s in sugestoes" :key="s.codigoCid" :value="s.codigoCid">
                        {{ s.nome }}/{{ s.uf }} — {{ s.entregas }} entregas
                    </option>
                </select>
            </label>

            <label class="estreito">
                Prazo (dias úteis)
                <input v-model.number="dias" type="number" min="0" :disabled="local">
            </label>

            <label class="marcacao" :class="{ ligado: local }">
                <input v-model="local" type="checkbox">
                entrega local
            </label>

            <button
                type="button"
                class="adicionar"
                :disabled="!escolhida || salvando"
                @click="adicionar"
            >{{ salvando ? 'Adicionando…' : 'Adicionar' }}</button>
        </div>

        <p class="dica">
            <template v-if="sugestoes.length > 0">
                <strong>{{ sugestoes.length }}</strong> cidades tiveram entrega nos últimos 12 meses
                e ainda não têm prazo cadastrado.
            </template>
            <template v-else>Todas as cidades com entrega recente já estão cadastradas.</template>
            Marque <strong>entrega local</strong> na cidade da farmácia: ela usa a mensagem
            "Entrega local", que fala em sair hoje em vez de prometer prazo.
        </p>

        <h3>Cidades cadastradas <span class="conta">{{ cidades.length }}</span></h3>

        <p v-if="!carregando && cidades.length === 0" class="vazio">
            Nenhuma ainda. Escolha uma acima para começar.
        </p>

        <table v-else class="grade">
            <thead>
                <tr><th>Cidade</th><th>UF</th><th>Prazo (dias úteis)</th><th>Entrega local</th><th>Ativa</th><th></th></tr>
            </thead>
            <tbody>
                <tr v-for="cidade in cidades" :key="cidade.codigoCid">
                    <td>{{ cidade.nome }}</td>
                    <td class="uf">{{ cidade.uf }}</td>
                    <td>
                        <input v-model.number="cidade.dias" type="number" min="0" class="dias"
                               :disabled="cidade.local" @change="guardar(cidade)">
                        <span v-if="cidade.local" class="sem-prazo">sai hoje</span>
                    </td>
                    <td><input v-model="cidade.local" type="checkbox" @change="guardar(cidade)"></td>
                    <td><input v-model="cidade.ativo" type="checkbox" @change="guardar(cidade)"></td>
                    <td><button type="button" class="remover" @click="apagar(cidade.codigoCid)">remover</button></td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.explica { color: var(--cor-texto-suave); font-size: 0.85rem; }
.formulario {
    display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end;
    margin: 18px 0 8px; padding: 16px;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda); border-radius: var(--raio);
}
label { display: grid; gap: 4px; font-size: 0.8rem; color: var(--cor-texto-suave); }
.cresce { flex: 1; min-width: 260px; }
.estreito { width: 130px; }
select, input {
    padding: 10px 12px; font: inherit; font-size: 0.9rem; color: var(--cor-texto);
    border: 1px solid var(--cor-borda); border-radius: 6px; background: var(--cor-fundo);
}
input:disabled { background: var(--cor-borda); color: var(--cor-texto-suave); }
/* Sem isto o input[type=number] usa a largura intrínseca dele (196px),
   estoura o rótulo de 130px e passa por baixo da caixa ao lado. */
.formulario select, .formulario input:not([type='checkbox']) { width: 100%; min-width: 0; }

/* Caixa da mesma altura dos campos: solto, o checkbox de 13px ficava
   flutuando ao lado de campos de 44px. */
.marcacao {
    display: flex; align-items: center; gap: 9px;
    height: 44px; padding: 0 14px; cursor: pointer;
    font-size: 0.88rem; color: var(--cor-texto);
    border: 1px solid var(--cor-borda); border-radius: 6px; background: var(--cor-fundo);
}
.marcacao.ligado { border-color: var(--cor-marca); color: var(--cor-marca); font-weight: 600; }
.marcacao input { width: 16px; height: 16px; margin: 0; padding: 0; cursor: pointer; }
input[type='checkbox'] { accent-color: var(--cor-marca); width: 16px; height: 16px; }
.adicionar {
    padding: 11px 22px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: var(--cor-sobre-marca); border: 0; border-radius: 6px;
}
.adicionar:disabled { background: var(--cor-pendente); color: var(--cor-texto-suave); }
.dica { font-size: 0.8rem; color: var(--cor-texto-suave); margin: 0 0 24px; }

h3 {
    display: flex; align-items: center; gap: 8px;
    font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--cor-texto-suave);
}
.conta { background: var(--cor-borda); color: var(--cor-texto); border-radius: 20px; padding: 1px 8px; font-size: 0.75rem; }

.grade { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--cor-borda); }
th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cor-texto-suave); }
.uf { color: var(--cor-texto-suave); font-size: 0.85rem; }
.dias { width: 68px; }
.sem-prazo { margin-left: 8px; font-size: 0.78rem; color: var(--cor-texto-suave); }
.remover { background: none; border: 0; color: var(--cor-erro); font: inherit; cursor: pointer; padding: 0; }
.vazio { color: var(--cor-texto-suave); font-size: 0.9rem; }
.erro { color: var(--cor-erro); }
</style>
