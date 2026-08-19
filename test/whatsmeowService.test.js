const { test, describe } = require('node:test');
const assert = require('node:assert');
const { validarBotoes } = require('../services/whatsmeowService');

test('aceita até três botões', () => {
    assert.doesNotThrow(() => validarBotoes([
        { id: 'opt_1', title: 'Sim', type: 'reply' },
        { id: 'opt_2', title: 'Não', type: 'reply' },
        { id: 'opt_3', title: 'Ligar', type: 'cta_call', phone_number: '5544997028340' },
    ]));
});

test('recusa mais de três — o limite da API é maxItems 3', () => {
    const quatro = Array.from({ length: 4 }, (_, i) => ({ id: `o${i}`, title: 'x', type: 'reply' }));
    assert.throws(() => validarBotoes(quatro), /no máximo 3/);
});

test('todo botão exige id — a API recusa sem, em qualquer tipo', () => {
    assert.throws(() => validarBotoes([{ title: 'Sim', type: 'reply' }]), /id/);
});

test('cta_url exige url', () => {
    assert.throws(() => validarBotoes([{ id: 'a', title: 'Site', type: 'cta_url' }]), /url/);
});

test('cta_call exige phone_number', () => {
    assert.throws(() => validarBotoes([{ id: 'a', title: 'Ligar', type: 'cta_call' }]), /phone_number/);
});

test('cta_copy exige copy_code', () => {
    assert.throws(() => validarBotoes([{ id: 'a', title: 'Copiar', type: 'cta_copy' }]), /copy_code/);
});

test('tipo desconhecido é recusado', () => {
    assert.throws(() => validarBotoes([{ id: 'a', title: 'x', type: 'lista' }]), /[Tt]ipo/);
});

test('todo botão precisa de title', () => {
    assert.throws(() => validarBotoes([{ id: 'a', type: 'reply' }]), /title/);
});

describe('cabeçalho na mensagem sem botões', () => {
    const { comCabecalho } = require('../services/mensagemService');

    test('entra como primeira linha em negrito', () => {
        assert.strictEqual(
            comCabecalho('Farmácia Bioessência', 'Sua fórmula está pronta.'),
            '*Farmácia Bioessência*\n\nSua fórmula está pronta.'
        );
    });

    test('cabeçalho vazio não deixa negrito solto no texto', () => {
        assert.strictEqual(comCabecalho('', 'Corpo.'), 'Corpo.');
        assert.strictEqual(comCabecalho('   ', 'Corpo.'), 'Corpo.');
        assert.strictEqual(comCabecalho(null, 'Corpo.'), 'Corpo.');
        assert.strictEqual(comCabecalho(undefined, 'Corpo.'), 'Corpo.');
    });
});

describe('id do botão', () => {
    // A API real recusa qualquer tipo sem id, apesar do OpenAPI dizer que
    // só o reply exige: "buttons[0].id is a required field".
    test('cta_call sem id é recusado antes de sair daqui', () => {
        assert.throws(
            () => validarBotoes([{ type: 'cta_call', title: 'Ligar', phone_number: '5544999999999' }]),
            /id/
        );
    });

    test('com id passa', () => {
        assert.doesNotThrow(() => validarBotoes([
            { type: 'cta_call', id: 'ligar', title: 'Ligar', phone_number: '5544999999999' },
        ]));
    });
});

describe('montagem sempre põe id', () => {
    const { montarBotoes } = require('../services/mensagemService');

    test('botão sem id ganha um automático', () => {
        const [a, b] = montarBotoes(
            [{ type: 'cta_call', title: 'Ligar', phone_number: '551199' },
             { type: 'reply', id: 'confirmar', title: 'Confirmar' }],
            {}
        );
        assert.strictEqual(a.id, 'botao_1');
        assert.strictEqual(b.id, 'confirmar');
    });
});
