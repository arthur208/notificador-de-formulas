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

test('cabeçalho passa pela mesma validação de variáveis do corpo', () => {
    const invalidas = validarTemplate('retirada', 'Corpo sem variável.', [], [], 'Olá {{nome}}');
    assert.deepStrictEqual(invalidas, []);
});

test('variável inexistente no cabeçalho reprova o template', () => {
    const invalidas = validarTemplate('retirada', 'Corpo sem variável.', [], [], 'Chega em {{dias}}');
    assert.deepStrictEqual(invalidas, ['dias']);
});

test('cabeçalho vazio ou ausente não inventa variável', () => {
    assert.deepStrictEqual(validarTemplate('retirada', 'Pronta.', [], [], ''), []);
    assert.deepStrictEqual(validarTemplate('retirada', 'Pronta.', [], [], null), []);
});

test('entrega sem prazo não oferece a variável dias', () => {
    assert.ok(!VARIAVEIS_POR_MODALIDADE.entrega_sem_prazo.includes('dias'));
    const invalidas = validarTemplate('entrega_sem_prazo', 'Chega em {{dias}}.');
    assert.deepStrictEqual(invalidas, ['dias']);
});

test('entrega local também não promete prazo', () => {
    assert.ok(!VARIAVEIS_POR_MODALIDADE.entrega_local.includes('dias'));
});

test('entrega com prazo aceita dias', () => {
    assert.deepStrictEqual(validarTemplate('entrega', 'Previsão: {{dias}}.'), []);
});
