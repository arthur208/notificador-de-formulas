// Aplica o tema ANTES do Vue montar, senão a tela pisca branca no caminho.
//
// Precisa ser um arquivo à parte, e não um <script> inline no HTML: a CSP
// do servidor traz script-src 'self', que recusa inline. Carregado de forma
// síncrona no <head>, roda antes de qualquer pintura.
//
// A lógica está repetida de propósito em web/src/estado/tema.ts. São dez
// linhas, e a alternativa seria fazer o Vue esperar por um módulo só para
// não duplicar — o que reintroduz exatamente o piscar que isto evita.
(function () {
    try {
        var gravado = localStorage.getItem('notificador:tema');
        var escuro = gravado === 'escuro'
            || (gravado !== 'claro'
                && window.matchMedia
                && window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (escuro) {
            document.documentElement.classList.add('tema-escuro');
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', '#14161a');
        }
    } catch (erro) {
        // Storage bloqueado ou navegador antigo: fica no tema claro.
    }
})();
