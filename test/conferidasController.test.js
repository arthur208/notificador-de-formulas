const { test, describe } = require('node:test');
const assert = require('node:assert');
const { montarResposta } = require('../controllers/conferidasController');

const receitas = [
    { codigoRec: 441433, nome: 'Gracileia Rosa Tomiello', total: 4, conferidas: 4, completa: true, hora: '08:30' },
    { codigoRec: 441618, nome: 'Odair Fernandes Azevedo', total: 2, conferidas: 1, completa: false, hora: '08:34' },
    { codigoRec: 441547, nome: 'Lucineia de Fatima Pesta', total: 2, conferidas: 2, completa: true, hora: '09:47' },
];

test('separa prontas de aguardando', () => {
    const resposta = montarResposta('2026-08-18', receitas, new Set());
    assert.strictEqual(resposta.prontas.length, 2);
    assert.strictEqual(resposta.aguardando.length, 1);
    assert.strictEqual(resposta.aguardando[0].codigoRec, 441618);
});

test('marca as já avisadas sem removê-las da lista', () => {
    const resposta = montarResposta('2026-08-18', receitas, new Set([441433]));
    const avisada = resposta.prontas.find((r) => r.codigoRec === 441433);
    assert.strictEqual(avisada.jaAvisado, true);
    const outra = resposta.prontas.find((r) => r.codigoRec === 441547);
    assert.strictEqual(outra.jaAvisado, false);
});

test('ordena da conferência mais recente para a mais antiga', () => {
    const resposta = montarResposta('2026-08-18', receitas, new Set());
    assert.deepStrictEqual(resposta.prontas.map((r) => r.hora), ['09:47', '08:30']);
});

test('devolve a data consultada', () => {
    const resposta = montarResposta('2026-08-15', [], new Set());
    assert.strictEqual(resposta.data, '2026-08-15');
    assert.deepStrictEqual(resposta.prontas, []);
    assert.deepStrictEqual(resposta.aguardando, []);
});

test('receita sem hora não quebra a ordenação', () => {
    const semHora = [{ codigoRec: 1, nome: 'X', total: 1, conferidas: 1, completa: true, hora: null }];
    const resposta = montarResposta('2026-08-18', semHora, new Set());
    assert.strictEqual(resposta.prontas.length, 1);
});

describe('classificação da receita na lista', () => {
    const { decidir } = require('../services/modalidadeService');

    const semNada = { prazoPorCidade: new Map(), conveniosConfigurados: new Map() };

    test('sem entrega e sem convênio é retirada', () => {
        const r = decidir({ entrega: null, convenios: [], ...semNada });
        assert.strictEqual(r.modalidade, 'retirada');
    });

    test('entrega em cidade cadastrada mostra a cidade', () => {
        const r = decidir({
            entrega: { codigoCid: 141, cidade: 'Querência do Norte' },
            convenios: [],
            prazoPorCidade: new Map([[141, { dias: 3, local: false }]]),
            conveniosConfigurados: new Map(),
        });
        assert.strictEqual(r.modalidade, 'entrega');
        assert.strictEqual(r.detalhe, 'Querência do Norte');
        assert.strictEqual(r.semPrazo, false);
    });

    test('cidade marcada como local vira entrega local', () => {
        const r = decidir({
            entrega: { codigoCid: 196, cidade: 'Loanda' },
            convenios: [],
            prazoPorCidade: new Map([[196, { dias: 1, local: true }]]),
            conveniosConfigurados: new Map(),
        });
        assert.strictEqual(r.modalidade, 'entrega_local');
    });

    test('cidade sem cadastro é sinalizada — é ela que tira o prazo da mensagem', () => {
        const r = decidir({
            entrega: { codigoCid: 999, cidade: 'Ilhéus' },
            convenios: [],
            ...semNada,
        });
        assert.strictEqual(r.modalidade, 'entrega_sem_prazo');
        assert.strictEqual(r.semPrazo, true);
    });

    // Mesma precedência do envio: convênio sobrepõe entrega e retirada.
    test('convênio configurado sobrepõe a entrega', () => {
        const r = decidir({
            entrega: { codigoCid: 141, cidade: 'Querência do Norte' },
            convenios: [{ codigoTs: 7, nome: 'FARMACIA PORTO RICO' }],
            prazoPorCidade: new Map([[141, { dias: 3, local: false }]]),
            conveniosConfigurados: new Map([[7, 'na Farmácia Porto Rico']]),
        });
        assert.strictEqual(r.modalidade, 'convenio');
        assert.strictEqual(r.detalhe, 'na Farmácia Porto Rico');
    });

    // A existência da configuração é a allowlist: categoria de desconto do
    // ERP não é local de retirada.
    test('convênio sem configuração não conta', () => {
        const r = decidir({
            entrega: null,
            convenios: [{ codigoTs: 99, nome: 'DESCONTO 10%' }],
            ...semNada,
        });
        assert.strictEqual(r.modalidade, 'retirada');
    });

    // Com dois, a tela de envio não pré-seleciona nenhum; a lista mostra a
    // modalidade de base para não prometer o que não foi decidido.
    test('dois convênios configurados caem na modalidade de base', () => {
        const r = decidir({
            entrega: null,
            convenios: [{ codigoTs: 7, nome: 'A' }, { codigoTs: 8, nome: 'B' }],
            prazoPorCidade: new Map(),
            conveniosConfigurados: new Map([[7, 'na A'], [8, 'no B']]),
        });
        assert.strictEqual(r.modalidade, 'retirada');
    });
});
