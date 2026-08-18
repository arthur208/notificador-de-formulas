const { test } = require('node:test');
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
