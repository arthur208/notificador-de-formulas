<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { lerAuditoria, type RegistroAuditoria } from '@/api/config';

const registros = ref<RegistroAuditoria[]>([]);
const carregando = ref(true);
const erro = ref<string | null>(null);

const ROTULO_ENTIDADE: Record<string, string> = {
    canal_config: 'conexão',
    template: 'mensagem',
    cidade: 'cidade',
    convenio: 'convênio',
    usuario: 'usuário',
};

onMounted(async () => {
    try {
        registros.value = (await lerAuditoria(200)).registros;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Não foi possível carregar.';
    } finally {
        carregando.value = false;
    }
});

function quando(iso: string): string {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Mostra só o que mudou, em uma linha. Os segredos já chegam mascarados
// pelo servidor — aqui nunca há valor sensível para esconder.
function resumo(registro: RegistroAuditoria): string {
    const novo = registro.valorNovo as Record<string, unknown> | undefined;
    if (!novo || typeof novo !== 'object') return '';
    return Object.entries(novo)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(' · ')
        .slice(0, 160);
}
</script>

<template>
    <div>
        <p class="explica">
            Registro de quem mudou o quê. Segredos aparecem como
            <span class="dados">(alterado, final ····)</span> — nunca o valor.
        </p>
        <p v-if="erro" class="erro">{{ erro }}</p>

        <p v-if="!carregando && registros.length === 0" class="vazio">
            Nenhuma alteração registrada ainda.
        </p>

        <ol class="linha-tempo">
            <li v-for="r in registros" :key="r._id">
                <div class="cabeca">
                    <strong>{{ r.usuarioNome }}</strong>
                    <span class="acao">{{ r.acao }}</span>
                    <span class="entidade">{{ ROTULO_ENTIDADE[r.entidade] ?? r.entidade }}</span>
                    <span v-if="r.entidadeId" class="dados alvo">{{ r.entidadeId }}</span>
                    <time class="quando">{{ quando(r.quando) }}</time>
                </div>
                <p v-if="resumo(r)" class="detalhe dados">{{ resumo(r) }}</p>
            </li>
        </ol>
    </div>
</template>

<style scoped>
.explica { color: var(--cor-texto-suave); font-size: 0.85rem; }
.linha-tempo { list-style: none; margin: 20px 0 0; padding: 0; }
.linha-tempo li {
    padding: 11px 0; border-bottom: 1px solid var(--cor-borda);
}
.cabeca { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; font-size: 0.88rem; }
.acao { color: var(--cor-marca); }
.entidade { color: var(--cor-texto-suave); }
.alvo { font-size: 0.78rem; color: var(--cor-texto-suave); }
.quando { margin-left: auto; font-size: 0.78rem; color: var(--cor-texto-suave); white-space: nowrap; }
.detalhe {
    margin: 4px 0 0; font-size: 0.78rem; color: var(--cor-texto-suave);
    word-break: break-word;
}
.vazio { color: var(--cor-texto-suave); }
.erro { color: var(--cor-erro); }
</style>
