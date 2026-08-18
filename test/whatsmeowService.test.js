const { test } = require('node:test');
const assert = require('node:assert');
const { validarBotoes } = require('../services/whatsmeowService');

test('aceita até três botões', () => {
    assert.doesNotThrow(() => validarBotoes([
        { id: 'opt_1', title: 'Sim', type: 'reply' },
        { id: 'opt_2', title: 'Não', type: 'reply' },
        { title: 'Ligar', type: 'cta_call', phone_number: '5544997028340' },
    ]));
});

test('recusa mais de três — o limite da API é maxItems 3', () => {
    const quatro = Array.from({ length: 4 }, (_, i) => ({ id: `o${i}`, title: 'x', type: 'reply' }));
    assert.throws(() => validarBotoes(quatro), /no máximo 3/);
});

test('reply exige id', () => {
    assert.throws(() => validarBotoes([{ title: 'Sim', type: 'reply' }]), /id/);
});

test('cta_url exige url', () => {
    assert.throws(() => validarBotoes([{ title: 'Site', type: 'cta_url' }]), /url/);
});

test('cta_call exige phone_number', () => {
    assert.throws(() => validarBotoes([{ title: 'Ligar', type: 'cta_call' }]), /phone_number/);
});

test('cta_copy exige copy_code', () => {
    assert.throws(() => validarBotoes([{ title: 'Copiar', type: 'cta_copy' }]), /copy_code/);
});

test('tipo desconhecido é recusado', () => {
    assert.throws(() => validarBotoes([{ id: 'a', title: 'x', type: 'lista' }]), /[Tt]ipo/);
});

test('todo botão precisa de title', () => {
    assert.throws(() => validarBotoes([{ id: 'a', type: 'reply' }]), /title/);
});
