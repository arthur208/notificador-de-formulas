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

// A base tem preenchimento de fachada: "....." no logradouro, "00000" no
// número, "......" no bairro. Medido: 82% das entregas têm ao menos um campo
// assim, e 36% das mensagens de entrega já enviadas saíram degradadas.
test('descarta preenchimento de fachada em vez de repassá-lo', () => {
    const texto = montarEndereco({
        endereco: 'RUA WALDEMAR DOS SANTOS.....', numero: '694', bairro: '......',
        cidade: 'Querencia do Norte', estado: 'PR',
    });
    assert.strictEqual(texto, 'Rua Waldemar dos Santos, 694 - Querencia do Norte/PR');
});

test('número zerado não vira parte do endereço', () => {
    const texto = montarEndereco({
        endereco: 'SITIO ST TEREZINHA', numero: '00000', bairro: '.',
        cidade: 'Loanda', estado: 'PR',
    });
    assert.strictEqual(texto, 'Sitio St Terezinha - Loanda/PR');
});

test('endereço inteiro de fachada devolve só a cidade', () => {
    const texto = montarEndereco({
        endereco: '.....', numero: '00000', bairro: '......',
        cidade: 'Loanda', estado: 'PR',
    });
    assert.strictEqual(texto, 'Loanda/PR');
});

test('endereço inteiro de fachada e sem cidade devolve null', () => {
    assert.strictEqual(montarEndereco({ endereco: '.....', numero: '00000', bairro: '......' }), null);
});
