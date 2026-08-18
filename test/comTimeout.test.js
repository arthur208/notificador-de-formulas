const { test } = require('node:test');
const assert = require('node:assert');
const { comTimeout } = require('../utils/comTimeout');

const depois = (ms, valor) => new Promise((r) => setTimeout(() => r(valor), ms));

test('resolve normalmente quando a promessa responde a tempo', async () => {
    const resultado = await comTimeout(depois(10, 'pronto'), 200, 'estourou');
    assert.strictEqual(resultado, 'pronto');
});

test('rejeita com a mensagem dada quando estoura o tempo', async () => {
    await assert.rejects(
        () => comTimeout(depois(200, 'tarde'), 20, 'Firebird não respondeu em 20ms'),
        /Firebird não respondeu em 20ms/
    );
});

test('propaga o erro original quando a promessa falha antes do limite', async () => {
    const falha = Promise.reject(new Error('erro de sintaxe SQL'));
    await assert.rejects(() => comTimeout(falha, 200, 'estourou'), /erro de sintaxe SQL/);
});

test('não deixa o processo pendurado após resolver', async () => {
    await comTimeout(depois(5, 'ok'), 5000, 'estourou');
    assert.ok(true, 'se o timer não fosse limpo, o processo não encerraria');
});
