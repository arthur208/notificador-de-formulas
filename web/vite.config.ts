import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    plugins: [
        vue(),
        VitePWA({
            registerType: 'autoUpdate',
            // Estes dois são o que resolve o aparelho preso na versão antiga:
            // o SW novo assume no lugar do velho sem esperar as abas fecharem.
            workbox: {
                skipWaiting: true,
                clientsClaim: true,
                cleanupOutdatedCaches: true,
                // Dados sempre da rede. Cachear /api/ mostraria a lista de ontem.
                navigateFallbackDenylist: [/^\/api\//],
                runtimeCaching: [
                    { urlPattern: /^\/api\//, handler: 'NetworkOnly' },
                ],
            },
            manifest: {
                name: 'Notificador de Fórmulas',
                short_name: 'Notificador',
                description: 'Aviso de fórmulas prontas — Farmácia Bioessência',
                start_url: '/',
                display: 'standalone',
                orientation: 'portrait-primary',
                background_color: '#ffffff',
                theme_color: '#00796b',
                icons: [
                    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
        }),
    ],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
        // O Express serve public/. Compilar direto para lá mantém o deploy
        // igual ao de hoje: npm run build e pronto.
        outDir: '../public',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/api': { target: 'http://127.0.0.1:3008', changeOrigin: true },
        },
    },
});
