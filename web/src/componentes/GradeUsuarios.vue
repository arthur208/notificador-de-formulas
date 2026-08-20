<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
    lerUsuarios, criarUsuario, atualizarUsuario, redefinirSenha,
    type Usuario,
} from '@/api/config';
import { usuarioAtual } from '@/estado/sessao';

const usuarios = ref<Usuario[]>([]);
const papeis = ref<string[]>([]);
const erro = ref<string | null>(null);
const carregando = ref(true);

const novo = ref({ nome: '', email: '', senha: '', papel: 'atendente' });
const criando = ref(false);

const trocandoSenhaDe = ref<string | null>(null);
const senhaNova = ref('');

const DESCRICAO: Record<string, string> = {
    atendente: 'vê a lista, busca e envia aviso',
    gestor: 'e também edita mensagens, cidades e convênios',
    admin: 'e também mexe em credenciais e usuários',
};

async function recarregar() {
    carregando.value = true;
    try {
        const dados = await lerUsuarios();
        usuarios.value = dados.usuarios;
        papeis.value = dados.papeis;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
    } finally {
        carregando.value = false;
    }
}

onMounted(recarregar);

async function adicionar() {
    erro.value = null;
    criando.value = true;
    try {
        await criarUsuario(novo.value);
        novo.value = { nome: '', email: '', senha: '', papel: 'atendente' };
        await recarregar();
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível criar.';
    } finally {
        criando.value = false;
    }
}

async function guardar(usuario: Usuario) {
    erro.value = null;
    try {
        await atualizarUsuario(usuario._id, {
            nome: usuario.nome, papel: usuario.papel, ativo: usuario.ativo,
        });
    } catch (e) {
        erro.value = e instanceof Error ? e.message : null;
        await recarregar(); // desfaz a mudança recusada na tela
    }
}

async function confirmarSenha(id: string) {
    erro.value = null;
    try {
        await redefinirSenha(id, senhaNova.value);
        trocandoSenhaDe.value = null;
        senhaNova.value = '';
    } catch (e) {
        erro.value = e instanceof Error ? e.message : null;
    }
}

function ehVoce(id: string): boolean {
    return usuarioAtual.value?._id === id;
}

function formatarAcesso(iso: string | null): string {
    if (!iso) return 'nunca entrou';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<template>
    <div>
        <p v-if="erro" class="erro">{{ erro }}</p>

        <table class="grade">
            <thead>
                <tr>
                    <th>Nome</th><th>E-mail</th><th>Papel</th>
                    <th>Último acesso</th><th>Ativo</th><th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="u in usuarios" :key="u._id" :class="{ inativo: !u.ativo }">
                    <td>
                        <input v-model="u.nome" class="nome" @change="guardar(u)">
                        <span v-if="ehVoce(u._id)" class="voce">você</span>
                    </td>
                    <td class="dados email">{{ u.email }}</td>
                    <td>
                        <select v-model="u.papel" @change="guardar(u)">
                            <option v-for="p in papeis" :key="p" :value="p">{{ p }}</option>
                        </select>
                    </td>
                    <td class="acesso">{{ formatarAcesso(u.ultimoAcesso) }}</td>
                    <td><input v-model="u.ativo" type="checkbox" @change="guardar(u)"></td>
                    <td>
                        <button type="button" class="senha" @click="trocandoSenhaDe = u._id">
                            trocar senha
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>

        <div v-if="trocandoSenhaDe" class="troca-senha">
            <input
                v-model="senhaNova"
                type="password"
                placeholder="Nova senha, mínimo 8 caracteres"
                autocomplete="new-password"
            >
            <button type="button" class="confirmar" @click="confirmarSenha(trocandoSenhaDe)">Confirmar</button>
            <button type="button" class="cancelar" @click="trocandoSenhaDe = null; senhaNova = ''">cancelar</button>
            <p class="dica">Trocar a senha encerra as sessões abertas desta pessoa.</p>
        </div>

        <h3>Novo usuário</h3>
        <div class="novo">
            <input v-model="novo.nome" placeholder="Nome" autocomplete="off">
            <input v-model="novo.email" type="email" placeholder="E-mail" autocomplete="off">
            <input v-model="novo.senha" type="password" placeholder="Senha, mínimo 8 caracteres" autocomplete="new-password">
            <select v-model="novo.papel">
                <option v-for="p in papeis" :key="p" :value="p">{{ p }}</option>
            </select>
            <button type="button" class="adicionar" :disabled="criando" @click="adicionar">
                {{ criando ? 'Criando…' : 'Criar usuário' }}
            </button>
        </div>

        <dl class="papeis">
            <template v-for="p in papeis" :key="p">
                <dt>{{ p }}</dt>
                <dd>{{ DESCRICAO[p] }}</dd>
            </template>
        </dl>
    </div>
</template>

<style scoped>
.grade { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--cor-borda); }
th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cor-texto-suave); }
tr.inativo td { color: var(--cor-texto-suave); opacity: 0.7; }
.email { font-size: 0.85rem; }
.acesso { font-size: 0.8rem; color: var(--cor-texto-suave); white-space: nowrap; }
.voce {
    margin-left: 6px; font-size: 0.68rem; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--cor-marca);
}
input, select {
    padding: 8px 10px; font: inherit; font-size: 0.88rem;
    border: 1px solid var(--cor-borda); border-radius: 6px;
    background: var(--cor-superficie); color: var(--cor-texto);
}
.nome { width: 180px; }
.senha { background: none; border: 0; color: var(--cor-marca); font: inherit; cursor: pointer; }

.troca-senha {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    margin: 16px 0; padding: 14px;
    background: var(--cor-superficie); border: 1px solid var(--cor-marca); border-radius: var(--raio);
}
.troca-senha input { min-width: 260px; }
.confirmar {
    padding: 9px 16px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: var(--cor-sobre-marca); border: 0; border-radius: 6px;
}
.cancelar { background: none; border: 0; color: var(--cor-texto-suave); font: inherit; cursor: pointer; }
.dica { width: 100%; margin: 0; font-size: 0.78rem; color: var(--cor-texto-suave); }

h3 { margin-top: 32px; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--cor-texto-suave); }
.novo { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.adicionar {
    padding: 9px 18px; font: inherit; font-weight: 600;
    background: var(--cor-marca); color: var(--cor-sobre-marca); border: 0; border-radius: 6px;
}
.adicionar:disabled { background: var(--cor-pendente); color: var(--cor-texto-suave); }

.papeis {
    display: grid; grid-template-columns: auto 1fr; gap: 4px 12px;
    margin-top: 28px; font-size: 0.82rem; color: var(--cor-texto-suave);
}
.papeis dt { font-weight: 600; color: var(--cor-texto); text-transform: capitalize; }
.papeis dd { margin: 0; }
.erro { color: var(--cor-erro); }
</style>
