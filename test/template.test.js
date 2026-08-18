const { test } = require('node:test');
const assert = require('node:assert');
const { renderizar, variaveisUsadas, VariavelAusenteError } = require('../utils/template');

test('substitui variáveis nomeadas', () => {
    const texto = renderizar('Olá, {{nome}}! Pronta em {{dias}} dias.', { nome: 'Ana', dias: 3 });
    assert.strictEqual(texto, 'Olá, Ana! Pronta em 3 dias.');
});

test('aceita espaços dentro das chaves', () => {
    assert.strictEqual(renderizar('{{ nome }}', { nome: 'Ana' }), 'Ana');
});

test('repete a mesma variável quantas vezes aparecer', () => {
    assert.strictEqual(renderizar('{{a}}-{{a}}', { a: 'x' }), 'x-x');
});

test('lista as variáveis usadas, sem repetir', () => {
    assert.deepStrictEqual(variaveisUsadas('{{a}} {{b}} {{a}}'), ['a', 'b']);
});

test('variável ausente bloqueia — nunca envia {{local}} literal', () => {
    assert.throws(
        () => renderizar('Retirada {{local}}.', { nome: 'Ana' }),
        (erro) => {
            assert.ok(erro instanceof VariavelAusenteError);
            assert.deepStrictEqual(erro.faltando, ['local']);
            return true;
        }
    );
});

test('string vazia conta como ausente', () => {
    assert.throws(() => renderizar('{{local}}', { local: '' }), VariavelAusenteError);
});

test('zero é valor válido, não ausente', () => {
    assert.strictEqual(renderizar('{{dias}} dias', { dias: 0 }), '0 dias');
});

test('texto sem variável passa intacto', () => {
    assert.strictEqual(renderizar('Sem variáveis.', {}), 'Sem variáveis.');
});

test('chave malformada não é tratada como variável', () => {
    assert.strictEqual(renderizar('{nome} e {{{nome}}}', { nome: 'Ana' }), '{nome} e {Ana}');
});
