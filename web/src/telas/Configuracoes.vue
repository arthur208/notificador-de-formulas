<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import EditorTemplate from '@/componentes/EditorTemplate.vue';
import GradeCidades from '@/componentes/GradeCidades.vue';
import GradeConvenios from '@/componentes/GradeConvenios.vue';
import FormConexao from '@/componentes/FormConexao.vue';
import GradeUsuarios from '@/componentes/GradeUsuarios.vue';
import ListaAuditoria from '@/componentes/ListaAuditoria.vue';
import { lerTemplates, type Template, type Variaveis, type Modalidade } from '@/api/config';
import { podeGerir, ehAdmin, usuarioAtual } from '@/estado/sessao';
import CabecalhoApp from '@/componentes/CabecalhoApp.vue';

const router = useRouter();

const secao = ref<'templates' | 'cidades' | 'convenios' | 'conexao' | 'usuarios' | 'auditoria'>('templates');
const templates = ref<Template[]>([]);
const variaveis = ref<Variaveis | null>(null);
const modalidadeAtiva = ref<Modalidade>('retirada');
const erro = ref<string | null>(null);

// Ordem e nomes fixos: o Mongo devolve na ordem de inserção, e
// "entrega_local" com underscore não é nome para mostrar a ninguém.
const ORDEM: Modalidade[] = ['retirada', 'entrega', 'entrega_local', 'convenio'];
const NOME_MODALIDADE: Record<string, string> = {
    retirada: 'Retirada na loja',
    entrega: 'Entrega',
    entrega_local: 'Entrega local',
    convenio: 'Convênio',
};

const templatesOrdenados = computed(() =>
    [...templates.value].sort(
        (a, b) => ORDEM.indexOf(a.modalidade) - ORDEM.indexOf(b.modalidade)
    )
);

const templateAtivo = computed(() =>
    templates.value.find((t) => t.modalidade === modalidadeAtiva.value) ?? null
);

const variaveisDaModalidade = computed(() => {
    if (!variaveis.value) return [];
    return [
        ...variaveis.value.globais,
        ...(variaveis.value.porModalidade[modalidadeAtiva.value] ?? []),
    ];
});

onMounted(async () => {
    if (!podeGerir()) return;
    try {
        const dados = await lerTemplates();
        templates.value = dados.templates;
        variaveis.value = dados.variaveis;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
    }
});
</script>

<template>
    <main class="tela">
        <header class="topo">
            <button type="button" class="voltar" @click="router.push({ name: 'hoje' })" aria-label="Voltar">←</button>
            <h1>Configurações</h1>
            <span v-if="usuarioAtual" class="quem">{{ usuarioAtual.nome }} · {{ usuarioAtual.papel }}</span>
            <CabecalhoApp />
        </header>

        <p v-if="!podeGerir()" class="sem-permissao">
            Seu perfil não permite alterar configurações. Fale com um gestor.
        </p>

        <template v-else>
            <p v-if="erro" class="erro">{{ erro }}</p>

            <nav class="abas">
                <button type="button" :class="{ ativa: secao === 'templates' }" @click="secao = 'templates'">Mensagens</button>
                <button type="button" :class="{ ativa: secao === 'cidades' }" @click="secao = 'cidades'">Cidades e prazos</button>
                <button type="button" :class="{ ativa: secao === 'convenios' }" @click="secao = 'convenios'">Convênios</button>
                <button v-if="ehAdmin()" type="button" :class="{ ativa: secao === 'conexao' }" @click="secao = 'conexao'">Conexão</button>
                <button v-if="ehAdmin()" type="button" :class="{ ativa: secao === 'usuarios' }" @click="secao = 'usuarios'">Usuários</button>
                <button v-if="ehAdmin()" type="button" :class="{ ativa: secao === 'auditoria' }" @click="secao = 'auditoria'">Auditoria</button>
            </nav>

            <section v-if="secao === 'templates'">
                <nav class="modalidades">
                    <button
                        v-for="t in templatesOrdenados"
                        :key="t.modalidade"
                        type="button"
                        :class="{ ativa: modalidadeAtiva === t.modalidade }"
                        @click="modalidadeAtiva = t.modalidade as Modalidade"
                    >{{ NOME_MODALIDADE[t.modalidade] ?? t.modalidade }}</button>
                </nav>
                <EditorTemplate
                    v-if="templateAtivo"
                    :key="templateAtivo.modalidade"
                    :template="templateAtivo"
                    :variaveis-disponiveis="variaveisDaModalidade"
                />
            </section>

            <section v-else-if="secao === 'cidades'">
                <GradeCidades />
            </section>

            <section v-else-if="secao === 'convenios'">
                <GradeConvenios />
            </section>

            <section v-else-if="secao === 'usuarios'">
                <GradeUsuarios />
            </section>

            <section v-else-if="secao === 'auditoria'">
                <ListaAuditoria />
            </section>

            <section v-else>
                <FormConexao />
            </section>
        </template>
    </main>
</template>

<style scoped>
.tela { max-width: 1040px; margin: 0 auto; padding: 24px 20px 60px; }
.topo { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.voltar { font-size: 1.4rem; background: none; border: 0; padding: 4px 8px; cursor: pointer; color: inherit; }
h1 { font-size: 1.5rem; margin: 0; }
.quem { margin-left: auto; font-size: 0.8rem; color: var(--cor-texto-suave); }
.abas, .modalidades { display: flex; gap: 4px; margin-bottom: 24px; flex-wrap: wrap; }
.abas button, .modalidades button {
    padding: 10px 16px; font: inherit; cursor: pointer;
    background: transparent; border: 1px solid var(--cor-borda);
    border-radius: var(--raio); color: var(--cor-texto-suave); text-transform: capitalize;
}
.abas button.ativa, .modalidades button.ativa {
    background: var(--cor-superficie); color: var(--cor-texto); border-color: var(--cor-marca);
}
.modalidades button { text-transform: none; }
.sem-permissao, .aviso-conexao { color: var(--cor-texto-suave); }
.erro { color: #b91c1c; }
</style>
