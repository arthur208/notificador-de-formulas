const { test } = require('node:test');
const assert = require('node:assert');
const { cabecalhosSeguranca, CSP } = require('../middleware/cabecalhosSeguranca');

function chamar(req = {}) {
    const enviados = {};
    const res = { setHeader: (k, v) => { enviados[k] = v; } };
    let seguiu = false;
    cabecalhosSeguranca(req, res, () => { seguiu = true; });
    return { enviados, seguiu };
}

test('não interrompe a requisição', () => {
    assert.strictEqual(chamar().seguiu, true);
});

test('põe os quatro cabeçalhos que valem em qualquer cenário', () => {
    const { enviados } = chamar();
    assert.ok(enviados['Content-Security-Policy']);
    assert.strictEqual(enviados['X-Frame-Options'], 'DENY');
    assert.strictEqual(enviados['X-Content-Type-Options'], 'nosniff');
    assert.strictEqual(enviados['Referrer-Policy'], 'no-referrer');
});

// Sem TLS, marcar HSTS deixaria o sistema inacessível pelo tempo do max-age.
test('HSTS só sob HTTPS em produção', () => {
    assert.ok(!chamar({ secure: false }).enviados['Strict-Transport-Security']);

    const antes = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        assert.ok(!chamar({ secure: false }).enviados['Strict-Transport-Security']);
        assert.ok(chamar({ secure: true }).enviados['Strict-Transport-Security']);
    } finally {
        if (antes === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = antes;
    }
});

// A câmera é usada pelo leitor de código de barras; bloqueá-la quebraria a
// leitura sem ninguém ligar uma coisa à outra.
test('a câmera continua liberada para a própria origem', () => {
    assert.match(chamar().enviados['Permissions-Policy'], /camera=\(self\)/);
});

// O PrimeVue posiciona painel com estilo inline. Script inline não existe.
test('CSP permite estilo inline mas não script inline', () => {
    assert.match(CSP, /style-src [^;]*'unsafe-inline'/);
    assert.doesNotMatch(CSP, /script-src [^;]*'unsafe-inline'/);
});

test('CSP proíbe embutir o sistema em iframe', () => {
    assert.match(CSP, /frame-ancestors 'none'/);
});
