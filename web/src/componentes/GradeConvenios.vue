<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { lerConvenios, salvarConvenio, removerConvenio, type ConvenioErp } from '@/api/config';

const todos = ref<ConvenioErp[]>([]);
const carregando = ref(true);
const erro = ref<string | null>(null);
const salvando = ref(false);

const escolhido = ref<number | null>(null);
const nomeExibicao = ref('');
const dias = ref(2);

const expandido = ref<number | null>(null);

const configurados = computed(() => todos.value.filter((c) => c.config));
const disponiveis = computed(() => todos.value.filter((c) => !c.config));

const EXCECOES = ['de', 'da', 'do', 'das', 'dos', 'e'];

function emCaixaDeNome(texto: string): string {
    return texto.toLowerCase().split(' ')
        .map((p, i) => (i > 0 && EXCECOES.includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join(' ');
}

// Sugere a preposição, mas deixa editável: "na Farmácia Porto Rico" está
// certo, "na HPNL" não — quem sabe é quem cadastra.
watch(escolhido, (codigo) => {
    const convenio = todos.value.find((c) => c.codigoTs === codigo);
    nomeExibicao.value = convenio ? `na ${emCaixaDeNome(convenio.nome)}` : '';
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

async function adicionar() {
    if (!escolhido.value) return;
    const convenio = todos.value.find((c) => c.codigoTs === escolhido.value);
    erro.value = null;
    salvando.value = true;
    try {
        await salvarConvenio(escolhido.value, {
            nomeErp: convenio?.nome,
            nomeExibicao: nomeExibicao.value,
            dias: dias.value,
            variaveis: [],
            ativo: true,
        });
        escolhido.value = null;
        nomeExibicao.value = '';
        dias.value = 2;
        await recarregar();
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível adicionar.';
    } finally {
        salvando.value = false;
    }
}

async function guardar(convenio: ConvenioErp) {
    if (!convenio.config) return;
    erro.value = null;
    try {
        await salvarConvenio(convenio.codigoTs, {
            nomeErp: convenio.nome,
            nomeExibicao: convenio.config.nomeExibicao,
            dias: convenio.config.dias,
            variaveis: convenio.config.variaveis ?? [],
            ativo: convenio.config.ativo,
        });
    } catch (e) {
        erro.value = e instanceof Error ? e.message : null;
        await recarregar();
    }
}

async function descartar(codigoTs: number) {
    await removerConvenio(codigoTs);
    await recarregar();
}

function acrescentarVariavel(convenio: ConvenioErp) {
    if (!convenio.config) return;
    convenio.config.variaveis = [...(convenio.config.variaveis ?? []), { chave: '', valor: '' }];
}

// O compilador do Vue termina a interpolação no primeiro par de chaves de
// fechamento, mesmo dentro de string — montar isso no template não compila.
function rotulo(nome: string): string {
    return `{{${nome}}}`;
}

function removerVariavel(convenio: ConvenioErp, indice: number) {
    convenio.config?.variaveis.splice(indice, 1);
    guardar(convenio);
}
</script>

<template>
    <div>
        <p class="explica">
            Só os convênios adicionados aqui viram local de retirada. Os demais —
            categorias de desconto, crediário — continuam sendo cliente comum.
        </p>
        <p v-if="erro" class="erro">{{ erro }}</p>

        <div class="formulario">
            <label>
                Convênio
                <select v-model="escolhido">
                    <option :value="null" disabled>Escolha um convênio…</option>
                    <option v-for="c in disponiveis" :key="c.codigoTs" :value="c.codigoTs">
                        {{ c.nome }}
                    </option>
                </select>
            </label>

            <label class="cresce">
                Como aparece na mensagem
                <input v-model="nomeExibicao" placeholder="na Farmácia Porto Rico">
            </label>

            <label class="estreito">
                Prazo (dias úteis)
                <input v-model.number="dias" type="number" min="0">
            </label>

            <button
                type="button"
                class="adicionar"
                :disabled="!escolhido || !nomeExibicao.trim() || salvando"
                @click="adicionar"
            >{{ salvando ? 'Adicionando…' : 'Adicionar' }}</button>
        </div>

        <p class="dica">
            A preposição faz parte do nome: <span class="dados">na Farmácia Porto Rico</span>,
            <span class="dados">no HPNL</span>. A mensagem escreve apenas
            <span class="dados">retirada {{ rotulo('local') }}</span>.
        </p>

        <h3>Convênios configurados <span class="conta">{{ configurados.length }}</span></h3>

        <p v-if="!carregando && configurados.length === 0" class="vazio">
            Nenhum ainda. Escolha um acima para começar.
        </p>

        <table v-else class="grade">
            <thead>
                <tr><th>No sistema</th><th>Na mensagem</th><th>Prazo</th><th>Ativo</th><th></th></tr>
            </thead>
            <tbody>
                <template v-for="c in configurados" :key="c.codigoTs">
                    <tr>
                        <td class="erp">{{ c.nome }}</td>
                        <td><input v-model="c.config!.nomeExibicao" class="exibicao" @change="guardar(c)"></td>
                        <td><input v-model.number="c.config!.dias" type="number" min="0" class="dias" @change="guardar(c)"></td>
                        <td><input v-model="c.config!.ativo" type="checkbox" @change="guardar(c)"></td>
                        <td class="acoes">
                            <button type="button" class="extras" @click="expandido = expandido === c.codigoTs ? null : c.codigoTs">
                                variáveis
                                <span v-if="c.config!.variaveis?.length" class="qtd">{{ c.config!.variaveis.length }}</span>
                            </button>
                            <button type="button" class="remover" @click="descartar(c.codigoTs)">remover</button>
                        </td>
                    </tr>
                    <tr v-if="expandido === c.codigoTs" class="linha-extras">
                        <td colspan="5">
                            <p class="dica">
                                Variáveis extras desta mensagem, usadas como
                                <span class="dados">{{ rotulo('horario') }}</span> no texto do convênio.
                            </p>
                            <div v-for="(v, i) in c.config!.variaveis ?? []" :key="i" class="variavel">
                                <input v-model="v.chave" placeholder="horario" class="chave dados" @change="guardar(c)">
                                <input v-model="v.valor" placeholder="Seg a Sex, 8h às 18h" class="valor" @change="guardar(c)">
                                <button type="button" class="remover" @click="removerVariavel(c, i)">remover</button>
                            </div>
                            <button type="button" class="adicionar-var" @click="acrescentarVariavel(c)">
                                + acrescentar variável
                            </button>
                        </td>
                    </tr>
                </template>
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
.cresce { flex: 1; min-width: 220px; }
.estreito { width: 130px; }
select, input {
    padding: 10px 12px; font: inherit; font-size: 0.9rem; color: var(--cor-texto);
    border: 1px solid var(--cor-borda); border-radius: 6px; background: var(--cor-fundo);
}
select { min-width: 260px; }
.adicionar {
    padding: 11px 22px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: 6px;
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
.erp { font-size: 0.82rem; color: var(--cor-texto-suave); }
.exibicao { width: 100%; }
.dias { width: 68px; }
.acoes { display: flex; gap: 12px; white-space: nowrap; }
.extras, .adicionar-var { background: none; border: 0; color: var(--cor-marca); font: inherit; cursor: pointer; padding: 0; }
.qtd { background: var(--cor-borda); border-radius: 20px; padding: 0 6px; font-size: 0.72rem; color: var(--cor-texto); }
.remover { background: none; border: 0; color: #b91c1c; font: inherit; cursor: pointer; padding: 0; }

.linha-extras td { background: var(--cor-fundo); }
.variavel { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.chave { width: 160px; }
.valor { flex: 1; }
.vazio { color: var(--cor-texto-suave); font-size: 0.9rem; }
.erro { color: #b91c1c; }
</style>
