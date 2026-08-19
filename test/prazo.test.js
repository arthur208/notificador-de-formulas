const { test } = require('node:test');
const assert = require('node:assert');
const { emDiasUteis } = require('../utils/prazo');

test('um dia vai no singular', () => {
    assert.strictEqual(emDiasUteis(1), '1 dia útil');
});

test('demais valores vão no plural', () => {
    assert.strictEqual(emDiasUteis(2), '2 dias úteis');
    assert.strictEqual(emDiasUteis(3), '3 dias úteis');
    assert.strictEqual(emDiasUteis(15), '15 dias úteis');
});

test('zero é plural em português', () => {
    assert.strictEqual(emDiasUteis(0), '0 dias úteis');
});

test('string numérica é aceita — o Mongo pode devolver assim', () => {
    assert.strictEqual(emDiasUteis('1'), '1 dia útil');
    assert.strictEqual(emDiasUteis('4'), '4 dias úteis');
});

// Devolver undefined faz o renderizar barrar o envio com 422, em vez de
// mandar "em undefined" ou "em {{dias}}" literal para o cliente.
test('ausência vira undefined, e o envio é bloqueado depois', () => {
    assert.strictEqual(emDiasUteis(null), undefined);
    assert.strictEqual(emDiasUteis(undefined), undefined);
    assert.strictEqual(emDiasUteis(''), undefined);
});

test('valor inválido não vira texto quebrado', () => {
    assert.strictEqual(emDiasUteis('dois'), undefined);
    assert.strictEqual(emDiasUteis(-1), undefined);
    assert.strictEqual(emDiasUteis(1.5), undefined);
    assert.strictEqual(emDiasUteis({}), undefined);
});
