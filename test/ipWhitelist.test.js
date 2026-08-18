const { test } = require('node:test');
const assert = require('node:assert');
const middleware = require('../middleware/ipWhitelist');

function criarRes() {
    const res = { statusCode: null, corpo: null, tipoDefinido: null, ehJson: null };
    res.status = (codigo) => { res.statusCode = codigo; return res; };
    res.json = (objeto) => { res.corpo = objeto; res.ehJson = true; return res; };
    res.type = (t) => { res.tipoDefinido = t; return res; };
    res.send = (texto) => { res.corpo = texto; res.ehJson = false; return res; };
    return res;
}

test('deixa passar IP da lista', () => {
    let chamouNext = false;
    middleware({ ip: '127.0.0.1', path: '/api/logs' }, criarRes(), () => { chamouNext = true; });
    assert.strictEqual(chamouNext, true);
});

test('bloqueia IP público com 403', () => {
    const res = criarRes();
    middleware({ ip: '8.8.8.8', path: '/' }, res, () => {
        assert.fail('não deveria chamar next para IP bloqueado');
    });
    assert.strictEqual(res.statusCode, 403);
});

test('responde JSON quando a rota começa com /api/', () => {
    const res = criarRes();
    middleware({ ip: '8.8.8.8', path: '/api/logs' }, res, () => {});
    assert.strictEqual(res.ehJson, true);
    assert.strictEqual(typeof res.corpo, 'object');
    assert.ok(res.corpo.erro, 'o corpo precisa ter a chave "erro"');
});

test('responde texto puro fora de /api/', () => {
    const res = criarRes();
    middleware({ ip: '8.8.8.8', path: '/index.html' }, res, () => {});
    assert.strictEqual(res.ehJson, false);
    assert.strictEqual(res.tipoDefinido, 'text/plain');
});

test('não estoura quando req.ip vem indefinido', () => {
    const res = criarRes();
    assert.doesNotThrow(() => {
        middleware({ ip: undefined, path: '/api/logs' }, res, () => {
            assert.fail('IP indefinido deve ser negado, não liberado');
        });
    });
    assert.strictEqual(res.statusCode, 403);
});
