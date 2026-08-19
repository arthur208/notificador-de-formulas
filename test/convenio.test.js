const { test, describe } = require('node:test');
const assert = require('node:assert');
const { variaveisDoConvenio } = require('../services/convenioService');

test('monta local e dias a partir da configuração', () => {
    const valores = variaveisDoConvenio({
        nomeExibicao: 'na Farmácia Porto Rico', dias: 3, variaveis: [],
    });
    assert.strictEqual(valores.local, 'na Farmácia Porto Rico');
    // Por extenso, não o número cru: o template escreve só "em {{dias}}".
    assert.strictEqual(valores.dias, '3 dias úteis');
});

test('prazo de um dia concorda no singular', () => {
    const valores = variaveisDoConvenio({
        nomeExibicao: 'na Farmácia Porto Rico', dias: 1, variaveis: [],
    });
    assert.strictEqual(valores.dias, '1 dia útil');
});

test('inclui as variáveis livres', () => {
    const valores = variaveisDoConvenio({
        nomeExibicao: 'no HPNL', dias: 2,
        variaveis: [{ chave: 'horario', valor: 'Seg a Sex, 8h às 18h' }],
    });
    assert.strictEqual(valores.horario, 'Seg a Sex, 8h às 18h');
});

test('variável livre não sobrescreve reservada', () => {
    const valores = variaveisDoConvenio({
        nomeExibicao: 'na Farmácia União', dias: 1,
        variaveis: [{ chave: 'local', valor: 'INVASOR' }, { chave: 'nome', valor: 'INVASOR' }],
    });
    assert.strictEqual(valores.local, 'na Farmácia União');
    assert.strictEqual(valores.nome, undefined);
});

test('configuração nula devolve objeto vazio', () => {
    assert.deepStrictEqual(variaveisDoConvenio(null), {});
});

test('sem variáveis livres não quebra', () => {
    const valores = variaveisDoConvenio({ nomeExibicao: 'no Sindicato', dias: 5 });
    assert.strictEqual(valores.local, 'no Sindicato');
});

describe('escolha da modalidade no envio', () => {
    const { escolherModalidade } = require('../services/mensagemService');

    test('sem entrega é retirada na loja', () => {
        assert.strictEqual(escolherModalidade(false, null), 'retirada');
    });

    test('cidade marcada como local usa o texto de entrega local', () => {
        assert.strictEqual(escolherModalidade(true, { dias: 1, local: true }), 'entrega_local');
    });

    test('cidade com prazo usa o texto que promete a data', () => {
        assert.strictEqual(escolherModalidade(true, { dias: 3, local: false }), 'entrega');
    });

    // Sem este caminho, receita de cidade não cadastrada seria recusada
    // com 422 por causa do {{dias}} no corpo da entrega.
    test('cidade sem cadastro cai no texto que não promete data', () => {
        assert.strictEqual(escolherModalidade(true, null), 'entrega_sem_prazo');
    });
});
