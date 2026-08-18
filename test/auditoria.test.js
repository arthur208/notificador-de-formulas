const { test } = require('node:test');
const assert = require('node:assert');
const { limparSegredos } = require('../services/auditoriaService');

test('substitui o token por marcador com os quatro últimos', () => {
    const limpo = limparSegredos({ token: 'abcdefgh9a3f9', canal: 'whatsmeow' });
    assert.strictEqual(limpo.token, '(alterado, final a3f9)');
    assert.strictEqual(limpo.canal, 'whatsmeow');
});

test('limpa todos os campos sensíveis conhecidos', () => {
    const limpo = limparSegredos({
        token: 'aaaabbbbcccc', clientSecret: 'ddddeeeeffff', senha: 'x', senhaHash: 'y',
    });
    for (const campo of ['token', 'clientSecret', 'senha', 'senhaHash']) {
        assert.ok(String(limpo[campo]).startsWith('('), `${campo} não foi limpo`);
    }
});

test('objeto sem segredo passa intacto', () => {
    const original = { nome: 'Loanda', dias: 2 };
    assert.deepStrictEqual(limparSegredos(original), original);
});

test('valor nulo ou indefinido não estoura', () => {
    assert.strictEqual(limparSegredos(null), null);
    assert.strictEqual(limparSegredos(undefined), undefined);
});
