const { test } = require('node:test');
const assert = require('node:assert');
const { podePapel } = require('../middleware/autenticacao');

test('admin passa em tudo', () => {
    assert.strictEqual(podePapel('admin', ['admin']), true);
    assert.strictEqual(podePapel('admin', ['gestor', 'admin']), true);
    assert.strictEqual(podePapel('admin', ['atendente']), true);
});

test('gestor passa no que é de gestor, não no que é de admin', () => {
    assert.strictEqual(podePapel('gestor', ['gestor', 'admin']), true);
    assert.strictEqual(podePapel('gestor', ['atendente']), true);
    assert.strictEqual(podePapel('gestor', ['admin']), false);
});

test('atendente só passa no que é de atendente', () => {
    assert.strictEqual(podePapel('atendente', ['atendente']), true);
    assert.strictEqual(podePapel('atendente', ['gestor']), false);
    assert.strictEqual(podePapel('atendente', ['admin']), false);
});

test('papel ausente ou desconhecido não passa', () => {
    assert.strictEqual(podePapel(undefined, ['atendente']), false);
    assert.strictEqual(podePapel('faxineiro', ['atendente']), false);
});
