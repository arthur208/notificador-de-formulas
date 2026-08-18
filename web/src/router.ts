import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'hoje', component: () => import('./telas/ConferidasHoje.vue') },
        { path: '/receita/:codigo', name: 'receita', component: () => import('./telas/Receita.vue') },
        { path: '/historico', name: 'historico', component: () => import('./telas/Historico.vue') },
        { path: '/configuracoes', name: 'configuracoes', component: () => import('./telas/Configuracoes.vue') },
        { path: '/:qualquer(.*)', redirect: '/' },
    ],
});
