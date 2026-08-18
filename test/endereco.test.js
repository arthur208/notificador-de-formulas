const { test } = require('node:test');
const assert = require('node:assert');
const { montarEndereco } = require('../utils/endereco');

test('monta o endereço completo', () => {
    const texto = montarEndereco({
        endereco: 'Rua das Palmeiras', numero: '123', bairro: 'Centro',
        cidade: 'Loanda', estado: 'PR',
    });
    assert.strictEqual(texto, 'Rua das Palmeiras, 123 - Centro - Loanda/PR');
});

test('omite partes ausentes sem deixar pontuação solta', () => {
    const texto = montarEndereco({ endereco: 'Rua das Palmeiras', bairro: 'Centro' });
    assert.strictEqual(texto, 'Rua das Palmeiras - Centro');
});

test('devolve null quando não há nada — nunca a string ", - "', () => {
    assert.strictEqual(montarEndereco({}), null);
    assert.strictEqual(montarEndereco({ endereco: null, numero: null, bairro: null }), null);
    assert.strictEqual(montarEndereco(null), null);
});

test('cidade sem UF não deixa barra sobrando', () => {
    const texto = montarEndereco({ endereco: 'Rua A', numero: '1', cidade: 'Loanda' });
    assert.strictEqual(texto, 'Rua A, 1 - Loanda');
});
