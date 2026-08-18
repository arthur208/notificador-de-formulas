const { test } = require('node:test');
const assert = require('node:assert');
const { validarTemplate, VARIAVEIS_POR_MODALIDADE } = require('../services/templateService');

test('aceita template que só usa variáveis da modalidade', () => {
    const invalidas = validarTemplate('entrega', 'Olá {{nome}}, chega em {{dias}} dias úteis.');
    assert.deepStrictEqual(invalidas, []);
});

test('aponta variável que não existe na modalidade', () => {
    const invalidas = validarTemplate('retirada', 'Retire {{local}} em {{dias}} dias.');
    assert.deepStrictEqual(invalidas.sort(), ['dias', 'local']);
});

test('as globais valem em qualquer modalidade', () => {
    for (const modalidade of Object.keys(VARIAVEIS_POR_MODALIDADE)) {
        const invalidas = validarTemplate(modalidade, '{{saudacao}} {{nome}} {{codigo}} {{qtdFormulas}}');
        assert.deepStrictEqual(invalidas, [], `falhou em ${modalidade}`);
    }
});

test('variáveis livres declaradas passam a valer', () => {
    const invalidas = validarTemplate('convenio', 'Atende {{horario}}.', ['horario']);
    assert.deepStrictEqual(invalidas, []);
});

test('template sem variável nenhuma é válido', () => {
    assert.deepStrictEqual(validarTemplate('retirada', 'Sua fórmula está pronta.'), []);
});

test('modalidade desconhecida recusa tudo', () => {
    assert.throws(() => validarTemplate('inexistente', '{{nome}}'), /[Mm]odalidade/);
});
