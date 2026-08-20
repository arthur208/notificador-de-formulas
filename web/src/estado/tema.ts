import { ref, watch } from 'vue';

export type Tema = 'claro' | 'escuro';

const CHAVE = 'notificador:tema';
const CLASSE = 'tema-escuro';

// Sem escolha gravada, segue o sistema. Quem trabalha com o celular no
// escuro não deveria precisar apertar nada para a tela acompanhar.
function preferenciaDoSistema(): Tema {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

function gravado(): Tema | null {
    try {
        const valor = localStorage.getItem(CHAVE);
        return valor === 'claro' || valor === 'escuro' ? valor : null;
    } catch {
        // Modo privado ou storage bloqueado: o tema vale só para esta aba.
        return null;
    }
}

// Só existe depois que alguém aperta o botão. Gravar na carga faria a
// segunda visita achar que houve escolha e parar de seguir o sistema.
const escolhaManual = ref(gravado() !== null);

export const tema = ref<Tema>(gravado() ?? preferenciaDoSistema());

function aplicar(valor: Tema) {
    document.documentElement.classList.toggle(CLASSE, valor === 'escuro');

    // A barra do navegador no celular acompanha, senão sobra uma faixa
    // clara em cima da tela escura.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', valor === 'escuro' ? '#14161a' : '#f7f7f5');
}

// Aplicar é sempre; gravar é só quando a escolha foi de gente.
watch(tema, (valor) => {
    aplicar(valor);
    if (!escolhaManual.value) return;
    try {
        localStorage.setItem(CHAVE, valor);
    } catch {
        // Sem persistência a troca ainda vale enquanto a aba estiver aberta.
    }
}, { immediate: true });

export function alternarTema() {
    escolhaManual.value = true;
    tema.value = tema.value === 'escuro' ? 'claro' : 'escuro';
}

// Quem nunca escolheu continua acompanhando o sistema, inclusive quando ele
// vira sozinho no fim do dia.
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (evento) => {
    if (!escolhaManual.value) tema.value = evento.matches ? 'escuro' : 'claro';
});
