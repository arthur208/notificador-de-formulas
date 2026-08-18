<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { lerCidades, lerSugestoes, salvarCidade, removerCidade, type Cidade, type Sugestao } from '@/api/config';

const cidades = ref<Cidade[]>([]);
const sugestoes = ref<Sugestao[]>([]);
const carregando = ref(true);
const erro = ref<string | null>(null);

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

async function guardar(cidade: Cidade) {
    erro.value = null;
    try {
        await salvarCidade(cidade.codigoCid, cidade);
    } catch (e) {
        erro.value = e instanceof Error ? e.message : null;
    }
}

async function adicionar(sugestao: Sugestao) {
    try {
        await salvarCidade(sugestao.codigoCid, {
            nome: sugestao.nome, uf: sugestao.uf, dias: 2, templateId: null, ativo: true,
        });
        await recarregar();
    } catch (e) {
        erro.value = e instanceof Error ? e.message : null;
    }
}

async function apagar(codigoCid: number) {
    await removerCidade(codigoCid);
    await recarregar();
}
</script>

<template>
    <div>
        <p v-if="erro" class="erro">{{ erro }}</p>

        <p v-if="!carregando && sugestoes.length > 0" class="alerta">
            Estas cidades tiveram entrega nos últimos 12 meses e ainda não têm prazo cadastrado.
            Sem cadastro, a mensagem sai sem promessa de prazo.
        </p>
        <div class="sugestoes">
            <button
                v-for="s in sugestoes.slice(0, 12)"
                :key="s.codigoCid"
                type="button"
                class="sugestao"
                @click="adicionar(s)"
            >+ {{ s.nome }}/{{ s.uf }} <span class="qtd">{{ s.entregas }} entregas</span></button>
        </div>

        <table class="grade">
            <thead>
                <tr><th>Cidade</th><th>UF</th><th>Prazo (dias úteis)</th><th>Ativa</th><th></th></tr>
            </thead>
            <tbody>
                <tr v-for="cidade in cidades" :key="cidade.codigoCid">
                    <td>{{ cidade.nome }}</td>
                    <td>{{ cidade.uf }}</td>
                    <td>
                        <input v-model.number="cidade.dias" type="number" min="0" class="dias"
                               @change="guardar(cidade)">
                    </td>
                    <td>
                        <input v-model="cidade.ativo" type="checkbox" @change="guardar(cidade)">
                    </td>
                    <td><button type="button" class="remover" @click="apagar(cidade.codigoCid)">remover</button></td>
                </tr>
                <tr v-if="!carregando && cidades.length === 0">
                    <td colspan="5" class="vazio">Nenhuma cidade cadastrada ainda.</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.alerta {
    background: #fff7ed; border: 1px solid #fed7aa; color: var(--cor-alerta);
    border-radius: var(--raio); padding: 10px 12px; font-size: 0.85rem;
}
.sugestoes { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.sugestao {
    background: var(--cor-superficie); border: 1px dashed var(--cor-borda);
    border-radius: 20px; padding: 6px 12px; font: inherit; font-size: 0.85rem; cursor: pointer;
}
.qtd { color: var(--cor-texto-suave); font-size: 0.78rem; }
.grade { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--cor-borda); }
th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cor-texto-suave); }
.dias { width: 72px; padding: 6px; font: inherit; border: 1px solid var(--cor-borda); border-radius: 6px; }
.remover { background: none; border: 0; color: #b91c1c; font: inherit; cursor: pointer; }
.vazio { color: var(--cor-texto-suave); }
.erro { color: #b91c1c; }
</style>
