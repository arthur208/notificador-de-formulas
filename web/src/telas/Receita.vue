<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Textarea from 'primevue/textarea';
import Skeleton from 'primevue/skeleton';
import { buscarReceita, enviarAviso, listarTelefones, type DetalheReceita, type Telefone } from '@/api/receita';
import { formatarTelefone } from '@/formatadores';

const rota = useRoute();
const router = useRouter();
const toast = useToast();

const codigo = Number(rota.params.codigo);
const detalhe = ref<DetalheReceita | null>(null);
const telefones = ref<Telefone[]>([]);
const escolhido = ref<string | null>(null);
const texto = ref('');
const carregando = ref(true);
const enviando = ref(false);
const erro = ref<string | null>(null);

const modalidade = computed(() => {
    if (!detalhe.value) return '';
    if (!detalhe.value.isDelivery) return 'Retirada na farmácia';
    const cidade = detalhe.value.deliveryAddress?.cidade;
    return cidade ? `Entrega · ${cidade}` : 'Entrega';
});

onMounted(async () => {
    try {
        const dados = await buscarReceita(codigo);
        detalhe.value = dados;
        telefones.value = listarTelefones(dados.dadosCliente.telefones);
        escolhido.value = telefones.value[0]?.numero ?? null;
        texto.value = dados.mensagemSugerida;
    } catch (e) {
        erro.value = e instanceof Error ? e.message : 'Receita não encontrada.';
    } finally {
        carregando.value = false;
    }
});

async function enviar() {
    if (!escolhido.value || !detalhe.value) return;
    enviando.value = true;
    try {
        await enviarAviso({
            codigoReceita: codigo,
            telefoneEscolhido: escolhido.value,
            mensagem: texto.value,
            nomeCliente: detalhe.value.dadosCliente.nome,
        });
        toast.add({ severity: 'success', summary: 'Aviso enviado', life: 3000 });
        router.push({ name: 'hoje' });
    } catch (e) {
        toast.add({
            severity: 'error',
            summary: 'Não enviado',
            detail: e instanceof Error ? e.message : '',
            life: 6000,
        });
    } finally {
        enviando.value = false;
    }
}
</script>

<template>
    <main class="tela com-rodape-fixo">
        <header class="topo">
            <button type="button" class="voltar" @click="router.back()" aria-label="Voltar">←</button>
            <span class="codigo dados">{{ codigo }}</span>
        </header>

        <div v-if="carregando"><Skeleton height="140px" border-radius="10px" /></div>

        <div v-else-if="erro" class="vazio">
            <p>{{ erro }}</p>
            <button type="button" class="tentar" @click="router.push({ name: 'hoje' })">
                Voltar para a lista
            </button>
        </div>

        <template v-else-if="detalhe">
            <h1>{{ detalhe.dadosCliente.nome }}</h1>
            <p class="modalidade">{{ modalidade }}</p>

            <p v-if="detalhe.jaEnviado" class="ja-avisado">
                Esta receita já foi avisada. Enviar de novo repete a mensagem para o cliente.
            </p>

            <h2>Para qual número?</h2>
            <p v-if="telefones.length === 0" class="vazio">
                Este cliente não tem telefone cadastrado no sistema.
            </p>
            <button
                v-for="telefone in telefones"
                :key="telefone.numero"
                type="button"
                class="telefone"
                :class="{ ativo: escolhido === telefone.numero }"
                @click="escolhido = telefone.numero"
            >
                <span class="dados">{{ formatarTelefone(telefone.numero) }}</span>
                <span class="rotulo">{{ telefone.rotulo }}</span>
            </button>

            <h2>Mensagem</h2>
            <Textarea v-model="texto" auto-resize rows="8" class="mensagem" />

            <div class="rodape">
                <button
                    type="button"
                    class="enviar"
                    :disabled="!escolhido || enviando || texto.trim() === ''"
                    @click="enviar"
                >
                    {{ enviando ? 'Enviando…' : 'Enviar aviso' }}
                </button>
            </div>
        </template>
    </main>
</template>

<style scoped>
.tela { max-width: 720px; margin: 0 auto; padding: 20px 16px 0; }
.topo { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.voltar { font-size: 1.4rem; background: none; border: 0; padding: 4px 8px; cursor: pointer; color: inherit; }
.codigo { color: var(--cor-texto-suave); }
h1 { margin: 0 0 4px; font-size: 1.4rem; }
.modalidade { margin: 0 0 20px; color: var(--cor-marca); font-size: 0.85rem; }
.ja-avisado {
    background: #fff7ed; border: 1px solid #fed7aa; color: var(--cor-alerta);
    border-radius: var(--raio); padding: 10px 12px; font-size: 0.85rem;
}
h2 {
    margin: 22px 0 10px; font-size: 0.78rem; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--cor-texto-suave);
}
.telefone {
    display: flex; justify-content: space-between; align-items: center;
    width: 100%; padding: 14px; margin-bottom: 8px;
    background: var(--cor-superficie); border: 1px solid var(--cor-borda);
    border-radius: var(--raio); font: inherit; color: inherit; cursor: pointer;
}
.telefone.ativo { border-color: var(--cor-marca); border-width: 2px; }
.rotulo { color: var(--cor-texto-suave); font-size: 0.8rem; }
.mensagem { width: 100%; }
.rodape {
    position: fixed; left: 0; right: 0; bottom: 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--cor-superficie); border-top: 1px solid var(--cor-borda);
}
.enviar {
    width: 100%; padding: 16px; font: inherit; font-weight: 600; font-size: 1rem;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
.enviar:disabled { background: var(--cor-pendente); color: var(--cor-texto-suave); }
.vazio { color: var(--cor-texto-suave); }
.tentar {
    margin-top: 8px; padding: 10px 16px; font: inherit;
    background: var(--cor-marca); color: #fff; border: 0; border-radius: var(--raio);
}
</style>
