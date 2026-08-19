// Cabeçalhos que o navegador respeita. São dez linhas e evitam três classes
// de problema; não valem uma dependência nova.
//
// Escritos à mão em vez de usar helmet pelo mesmo motivo de utils/cookies.js:
// o que precisamos aqui é fixo e cabe na tela.

// O front é construído pelo Vite e servido da mesma origem. Nada vem de CDN,
// então 'self' basta para script e conexão.
//
// 'unsafe-inline' em style-src é necessário: o PrimeVue aplica estilo inline
// em componente (o DatePicker posiciona o painel assim). Sem isso a tela
// quebra. Já em script-src não há inline nenhum, por isso ali é só 'self'.
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    // data: cobre os ícones do manifest e o QR do leitor de código.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    // O leitor de código de barras usa a câmera via getUserMedia.
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Ninguém precisa embutir este sistema em lugar nenhum.
    "frame-ancestors 'none'",
].join('; ');

function cabecalhosSeguranca(req, res, next) {
    res.setHeader('Content-Security-Policy', CSP);
    // frame-ancestors já cobre navegador moderno; este fica para os antigos.
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // O sistema é interno: o endereço não deve vazar para lugar nenhum.
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(self)');

    // HSTS só faz sentido sob TLS, e marcar sem HTTPS deixa o sistema
    // inacessível pelo tempo do max-age.
    if (process.env.NODE_ENV === 'production' && req.secure) {
        res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    }

    next();
}

module.exports = { cabecalhosSeguranca, CSP };
