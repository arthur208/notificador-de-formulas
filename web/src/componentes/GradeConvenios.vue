<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { lerConvenios, salvarConvenio, removerConvenio, type ConvenioErp } from '@/api/config';

const todos = ref<ConvenioErp[]>([]);
const filtro = ref('');
const soConfigurados = ref(false);
const erro = ref<string | null>(null);
const carregando = ref(true);

const visiveis = computed(() => {
    const busca = filtro.value.trim().toLowerCase();
    return todos.value.filter((c) => {
        if (soConfigurados.value && !c.config) return false;
        return busca === '' || c.nome.toLowerCase().includes(busca);
    });
});

async function recarregar() {
    carregando.value = true;
    try {
        todos.value = (await lerConvenios()).convenios;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
    } finally {
        carregando.value = false;
    }
}

onMounted(recarregar);

async function configurar(convenio: ConvenioErp) {
    erro.value = null;
    try {
        await salvarConvenio(convenio.codigoTs, {
            nomeErp: convenio.nome,
            nomeExibicao: convenio.config?.nomeExibicao ?? `na ${convenio.nome}`,
            dias: convenio.config?.dias ?? 2,
            variaveis: convenio.config?.variaveis ?? [],
            ativo: true,
        });
        await recarregar();
    } catch (e) {
        erro.value = e instanceof Error ? e.message : null;
    }
}

async function descartar(codigoTs: number) {
    await removerConvenio(codigoTs);
    await recarregar();
}
</script>

<template>
    <div>
        <p class="explica">
            Só os convênios configurados aqui viram local de retirada. Os demais —
            categorias de desconto, crediário — continuam sendo cliente comum.
        </p>
        <p v-if="erro" class="erro">{{ erro }}</p>

        <div class="filtros">
            <input v-model="filtro" type="search" placeholder="Buscar convênio" class="busca">
            <label><input v-model="soConfigurados" type="checkbox"> só configurados</label>
            <span class="conta">{{ visiveis.length }} de {{ todos.length }}</span>
        </div>

        <table class="grade">
            <thead>
                <tr>
                    <th>Convênio no sistema</th>
                    <th>Como aparece na mensagem</th>
                    <th>Prazo</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="c in visiveis" :key="c.codigoTs" :class="{ inativo: !c.config }">
                    <td>{{ c.nome }}</td>
                    <td>
                        <input
                            v-if="c.config"
                            v-model="c.config.nomeExibicao"
                            class="exibicao"
                            placeholder="na Farmácia Porto Rico"
                            @change="configurar(c)"
                        >
                        <span v-else class="nao-config">não é local de retirada</span>
                    </td>
                    <td>
                        <input v-if="c.config" v-model.number="c.config.dias" type="number" min="0"
                               class="dias" @change="configurar(c)">
                    </td>
                    <td>
                        <button v-if="c.config" type="button" class="remover" @click="descartar(c.codigoTs)">remover</button>
                        <button v-else type="button" class="adicionar" @click="configurar(c)">configurar</button>
                    </td>
                </tr>
                <tr v-if="!carregando && visiveis.length === 0">
                    <td colspan="4" class="vazio">Nenhum convênio encontrado para esta busca.</td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
.explica { color: var(--cor-texto-suave); font-size: 0.85rem; }
.filtros { display: flex; align-items: center; gap: 16px; margin: 16px 0; font-size: 0.85rem; }
.busca {
    flex: 1; max-width: 320px; padding: 9px 12px; font: inherit;
    border: 1px solid var(--cor-borda); border-radius: var(--raio);
}
.conta { margin-left: auto; color: var(--cor-texto-suave); }
.grade { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--cor-borda); }
th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cor-texto-suave); }
tr.inativo td { color: var(--cor-texto-suave); }
.exibicao {
    width: 100%; padding: 6px 8px; font: inherit;
    border: 1px solid var(--cor-borda); border-radius: 6px;
}
.dias { width: 68px; padding: 6px; font: inherit; border: 1px solid var(--cor-borda); border-radius: 6px; }
.nao-config { font-size: 0.82rem; }
.adicionar { background: none; border: 0; color: var(--cor-marca); font: inherit; cursor: pointer; }
.remover { background: none; border: 0; color: #b91c1c; font: inherit; cursor: pointer; }
.vazio { color: var(--cor-texto-suave); }
.erro { color: #b91c1c; }
</style>
