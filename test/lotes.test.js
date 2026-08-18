const { test } = require('node:test');
const assert = require('node:assert');
const { emLotes, listaInteirosSegura } = require('../utils/lotes');

test('divide em lotes do tamanho pedido', () => {
    assert.deepStrictEqual(emLotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('lista menor que o lote volta como um lote único', () => {
    assert.deepStrictEqual(emLotes([1, 2], 1000), [[1, 2]]);
});

test('lista vazia volta sem lotes', () => {
    assert.deepStrictEqual(emLotes([], 10), []);
});

test('tamanho inválido é recusado', () => {
    assert.throws(() => emLotes([1], 0), /tamanho do lote/);
});

test('monta lista literal de inteiros', () => {
    assert.strictEqual(listaInteirosSegura([441433, 441518]), '441433,441518');
});

test('aceita inteiro em string, porque o Firebird devolve assim', () => {
    assert.strictEqual(listaInteirosSegura(['441433']), '441433');
});

test('recusa valor que não é inteiro — barreira contra injeção', () => {
    assert.throws(() => listaInteirosSegura(['1; DROP TABLE RECEITAS']), /não inteiro/);
    assert.throws(() => listaInteirosSegura([1.5]), /não inteiro/);
    assert.throws(() => listaInteirosSegura([null]), /não inteiro/);
});
