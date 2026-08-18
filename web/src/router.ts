import { createRouter, createWebHistory } from 'vue-router';
import { usuarioAtual, sessaoCarregada, carregarSessao } from './estado/sessao';

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'hoje', component: () => import('./telas/ConferidasHoje.vue') },
        { path: '/receita/:codigo', name: 'receita', component: () => import('./telas/Receita.vue') },
        { path: '/historico', name: 'historico', component: () => import('./telas/Historico.vue') },
        { path: '/configuracoes', name: 'configuracoes', component: () => import('./telas/Configuracoes.vue') },
        { path: '/entrar', name: 'entrar', component: () => import('./telas/Login.vue'), meta: { publica: true } },
        { path: '/:qualquer(.*)', redirect: '/' },
    ],
});

router.beforeEach(async (para) => {
    if (!sessaoCarregada.value) await carregarSessao();
    if (para.meta.publica) return true;
    if (usuarioAtual.value) return true;
    return { name: 'entrar', query: { destino: para.fullPath } };
});
