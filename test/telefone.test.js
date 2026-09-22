const { test } = require('node:test');
const assert = require('node:assert');
const { variantesDeTelefone, soDigitos, semDdi } = require('../utils/telefone');

const ordenado = (v) => [...v].sort();

test('celular com 9 procura também sem o 9', () => {
    assert.deepStrictEqual(
        ordenado(variantesDeTelefone('44991135801')),
        ordenado(['44991135801', '4491135801'])
    );
});

test('fixo de 8 dígitos procura também com o 9', () => {
    assert.deepStrictEqual(
        ordenado(variantesDeTelefone('4491135801')),
        ordenado(['4491135801', '44991135801'])
    );
});

test('o DDI 55 é descartado', () => {
    assert.ok(variantesDeTelefone('5544991135801').includes('44991135801'));
    assert.ok(variantesDeTelefone('554491135801').includes('4491135801'));
});

// DDD 55 é do Rio Grande do Sul. Tirar o 55 de "5511223344" transformaria
// o número em outro, de outro estado.
test('DDD 55 não é confundido com DDI', () => {
    assert.deepStrictEqual(semDdi('5511223344'), '5511223344');
    assert.ok(variantesDeTelefone('5511223344').includes('5511223344'));
});

test('pontuação é ignorada', () => {
    assert.deepStrictEqual(
        ordenado(variantesDeTelefone('(44) 99113-5801')),
        ordenado(variantesDeTelefone('44991135801'))
    );
});

// O ERP guarda com espaço no meio; a entrada pode vir assim de um copiar e colar.
test('espaço no meio não atrapalha', () => {
    assert.ok(variantesDeTelefone('44 34255793').includes('4434255793'));
});

// Sem DDD não dá para identificar: o mesmo número existe em vários estados.
test('número sem DDD é recusado', () => {
    assert.deepStrictEqual(variantesDeTelefone('991135801'), []);
    assert.deepStrictEqual(variantesDeTelefone('34255793'), []);
});

test('lixo devolve lista vazia em vez de estourar', () => {
    for (const entrada of ['', null, undefined, 'abc', '123', {}, '000000000000000']) {
        assert.deepStrictEqual(variantesDeTelefone(entrada), [], `falhou com ${JSON.stringify(entrada)}`);
    }
});

// Fixo novo de 9 dígitos que não começa com 9 não ganha variante inventada.
test('não inventa variante para número de 9 dígitos sem o 9 na frente', () => {
    assert.deepStrictEqual(variantesDeTelefone('44312345678'), ['44312345678']);
});

test('soDigitos limpa qualquer separador', () => {
    assert.strictEqual(soDigitos('(44) 9911-5801'), '4499115801');
    assert.strictEqual(soDigitos(null), '');
});
