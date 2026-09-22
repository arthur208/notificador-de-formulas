const { test, describe } = require('node:test');
const assert = require('node:assert');
const { tratarErros } = require('../middleware/erros');

function criarRes() {
    const res = { statusCode: null, corpo: null, tipoDefinido: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.corpo = o; return res; };
    res.type = (t) => { res.tipoDefinido = t; return res; };
    res.send = (t) => { res.corpo = t; return res; };
    res.headersSent = false;
    return res;
}

describe('erros antes da rota', () => {
    // Sem isto o Express devolve HTML com o stack trace e os caminhos do
    // servidor — e a plataforma de agente, que espera JSON, engasga.
    test('JSON inválido devolve 400 em JSON, não HTML', () => {
        const res = criarRes();
        tratarErros(
            { type: 'entity.parse.failed', message: 'Unexpected token' },
            { path: '/api/integracao/cliente/1', method: 'PUT', originalUrl: '/x' },
            res, () => {}
        );
        assert.strictEqual(res.statusCode, 400);
        assert.match(res.corpo.erro, /JSON válido/);
        assert.strictEqual(res.tipoDefinido, null, 'não deveria virar text/html');
    });

    // A posição do defeito é o que permite corrigir sem adivinhar.
    test('a mensagem do parser é repassada', () => {
        const res = criarRes();
        tratarErros(
            { type: 'entity.parse.failed', message: 'Expected double-quoted property name at position 16' },
            { path: '/api/x', method: 'PUT', originalUrl: '/api/x' }, res, () => {}
        );
        assert.match(res.corpo.detalhe, /position 16/);
    });

    test('corpo grande demais devolve 413', () => {
        const res = criarRes();
        tratarErros({ type: 'entity.too.large' }, { path: '/api/x', method: 'PUT', originalUrl: '/api/x' }, res, () => {});
        assert.strictEqual(res.statusCode, 413);
    });

    // Detalhe interno não vai para quem chamou; fica no log do servidor.
    test('erro desconhecido não vaza detalhe', () => {
        const res = criarRes();
        tratarErros(new Error('senha do banco é X'), { path: '/api/x', method: 'GET', originalUrl: '/api/x' }, res, () => {});
        assert.strictEqual(res.statusCode, 500);
        assert.deepStrictEqual(res.corpo, { erro: 'Erro interno.' });
    });

    test('fora da API responde em texto, não JSON', () => {
        const res = criarRes();
        tratarErros(new Error('x'), { path: '/configuracoes', method: 'GET', originalUrl: '/configuracoes' }, res, () => {});
        assert.strictEqual(res.tipoDefinido, 'text/plain');
    });

    test('resposta já enviada é repassada adiante', () => {
        const res = criarRes();
        res.headersSent = true;
        let seguiu = false;
        tratarErros(new Error('x'), { path: '/api/x', method: 'GET', originalUrl: '/api/x' }, res, () => { seguiu = true; });
        assert.ok(seguiu);
        assert.strictEqual(res.statusCode, null);
    });
});
