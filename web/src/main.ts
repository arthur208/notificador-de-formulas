import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import 'primeicons/primeicons.css';

import App from './App.vue';
import { router } from './router';
import './estilo/base.css';

const app = createApp(App);
app.use(router);
app.use(PrimeVue, { theme: { preset: Aura, options: { darkModeSelector: '.tema-escuro' } } });
app.use(ToastService);
app.mount('#app');
