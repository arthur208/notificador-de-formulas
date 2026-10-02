const { test, describe } = require('node:test');
const assert = require('node:assert');
const { normalizar, escolher } = require('../services/cidadeErpService');

// Linhas reais da tabela CIDADES do ERP, com a contagem de uso medida em
// PESSOAENDERECOS. É o lixo acumulado que o desempate precisa atravessar.
const MARINGA = [
    { CODIGOCID: 113, NOMECID: 'MARINGA', UFCID: 'PR', USOS: 792 },
    { CODIGOCID: 114, NOMECID: 'MARINGA', UFCID: 'PR', USOS: 12 },
    { CODIGOCID: 217, NOMECID: 'MARINGA', UFCID: 'PR', USOS: 19 },
    { CODIGOCID: 5798, NOMECID: 'MARINGÁ', UFCID: 'PR', USOS: 3 },
    { CODIGOCID: 5808, NOMECID: 'MARINGÃ ', UFCID: 'PR', USOS: 3 },
];
const SAO_PAULO = [
    { CODIGOCID: 160, NOMECID: 'SAO PAULO', UFCID: 'SP', USOS: 372 },
    { CODIGOCID: 161, NOMECID: 'SAO PAULO', UFCID: 'SP', USOS: 89 },
    { CODIGOCID: 5795, NOMECID: 'SãO PAULO', UFCID: 'SP', USOS: 20 },
    { CODIGOCID: 5803, NOMECID: 'ITAQUERA', UFCID: 'SP', USOS: 2 },
];
// Os dois grupos onde "menor código" erraria. Medido: o atalho acerta em 24
// dos 26 grupos de IBGE repetido e erra nestes dois.
const EMBU = [
    { CODIGOCID: 58, NOMECID: 'EMBU', UFCID: 'SP', USOS: 1 },
    { CODIGOCID: 404, NOMECID: 'EMBU DAS ARTES', UFCID: 'SP', USOS: 5 },
];
const SAO_BERNARDO = [
    { CODIGOCID: 151, NOMECID: 'SAO BERNARDO DO CAMPO', UFCID: 'SP', USOS: 7 },
    { CODIGOCID: 268, NOMECID: 'SAO BERNARDO DO CAMPO', UFCID: 'SP', USOS: 14 },
    { CODIGOCID: 5807, NOMECID: 'S B DO CAMPO', UFCID: 'SP', USOS: 1 },
];

describe('desempate entre cidades duplicadas', () => {
    test('escolhe a mais usada, não a de menor código', () => {
        assert.strictEqual(escolher(EMBU).CODIGOCID, 404);
        assert.strictEqual(escolher(SAO_BERNARDO).CODIGOCID, 268);
    });

    test('ignora as linhas de sincronização e o bairro virado cidade', () => {
        assert.strictEqual(escolher(MARINGA).CODIGOCID, 113);
        // 5803 é ITAQUERA, um bairro que alguém cadastrou como cidade com o
        // IBGE de São Paulo.
        assert.strictEqual(escolher(SAO_PAULO).CODIGOCID, 160);
    });

    // Sem o segundo critério, duas candidatas empatadas alternariam conforme
    // a ordem que o banco devolvesse, e o mesmo CEP gravaria cidades
    // diferentes em chamadas diferentes.
    test('empate no uso cai no menor código, de forma estável', () => {
        const empatadas = [
            { CODIGOCID: 5808, NOMECID: 'MARINGÃ ', UFCID: 'PR', USOS: 3 },
            { CODIGOCID: 5798, NOMECID: 'MARINGÁ', UFCID: 'PR', USOS: 3 },
        ];
        assert.strictEqual(escolher(empatadas).CODIGOCID, 5798);
        assert.strictEqual(escolher([...empatadas].reverse()).CODIGOCID, 5798);
    });

    test('não altera a lista que recebeu', () => {
        const copia = [...MARINGA];
        escolher(copia);
        assert.deepStrictEqual(copia.map((c) => c.CODIGOCID), MARINGA.map((c) => c.CODIGOCID));
    });

    test('lista vazia devolve null, nunca uma cidade qualquer', () => {
        assert.strictEqual(escolher([]), null);
    });

    test('candidata única é escolhida mesmo sem uso nenhum', () => {
        const sozinha = [{ CODIGOCID: 196, NOMECID: 'LOANDA', UFCID: 'PR', USOS: 0 }];
        assert.strictEqual(escolher(sozinha).CODIGOCID, 196);
    });
});

describe('normalização de nome', () => {
    // O ERP tem as três grafias na mesma tabela.
    test('acento, caixa e pontuação não decidem', () => {
        assert.strictEqual(normalizar('MARINGÁ'), 'MARINGA');
        assert.strictEqual(normalizar('Maringá'), 'MARINGA');
        assert.strictEqual(normalizar('SãO PAULO'), 'SAO PAULO');
        assert.strictEqual(normalizar("SANTA CRUZ D'OESTE"), 'SANTA CRUZ D OESTE');
    });

    test('espaço sobrando e no meio', () => {
        assert.strictEqual(normalizar('  SAO   PAULO '), 'SAO PAULO');
        // 5808 'MARINGÃ ' vem com espaço no fim, do UTF-8 lido como latin1.
        assert.strictEqual(normalizar('MARINGÃ '), 'MARINGA');
    });

    test('o ViaCEP e o ERP batem depois de normalizar', () => {
        assert.strictEqual(normalizar('São Paulo'), normalizar('SAO PAULO'));
        assert.strictEqual(normalizar('Maringá'), normalizar('MARINGA'));
        assert.strictEqual(normalizar('Loanda'), normalizar('LOANDA'));
    });

    test('vazio e nulo não viram string que casa com algo', () => {
        for (const v of [null, undefined, '', '   ', '...']) {
            assert.strictEqual(normalizar(v), '', `falhou com ${JSON.stringify(v)}`);
        }
    });

    // Cidades diferentes não podem colidir por causa da normalização.
    test('não junta cidades que são de verdade diferentes', () => {
        assert.notStrictEqual(normalizar('EMBU'), normalizar('EMBU DAS ARTES'));
        assert.notStrictEqual(normalizar('ITAQUERA'), normalizar('SAO PAULO'));
        assert.notStrictEqual(normalizar('S B DO CAMPO'), normalizar('SAO BERNARDO DO CAMPO'));
    });
});
