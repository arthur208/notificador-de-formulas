const { test } = require('node:test');
const assert = require('node:assert');
const { validarDataISO, hojeISO, formatarHora } = require('../utils/datas');

test('aceita data no formato AAAA-MM-DD', () => {
    assert.strictEqual(validarDataISO('2026-08-18'), '2026-08-18');
});

test('recusa formato diferente', () => {
    assert.strictEqual(validarDataISO('18/08/2026'), null);
    assert.strictEqual(validarDataISO('2026-8-18'), null);
    assert.strictEqual(validarDataISO(''), null);
    assert.strictEqual(validarDataISO(undefined), null);
});

test('recusa data que não existe no calendário', () => {
    assert.strictEqual(validarDataISO('2026-02-30'), null);
    assert.strictEqual(validarDataISO('2026-13-01'), null);
});

test('recusa tentativa de injeção no parâmetro', () => {
    assert.strictEqual(validarDataISO("2026-08-18' OR '1'='1"), null);
});

test('hojeISO usa a data local, não UTC', () => {
    // 1º de janeiro às 21h no Brasil ainda é dia 1 aqui, mas já é dia 2 em UTC.
    const virada = new Date(2026, 0, 1, 21, 30, 0);
    assert.strictEqual(hojeISO(virada), '2026-01-01');
});

test('formatarHora devolve HH:MM', () => {
    const hora = new Date(1970, 0, 1, 8, 30, 0);
    assert.strictEqual(formatarHora(hora), '08:30');
});

test('formatarHora devolve null para valor ausente ou inválido', () => {
    assert.strictEqual(formatarHora(null), null);
    assert.strictEqual(formatarHora(undefined), null);
    assert.strictEqual(formatarHora(new Date('nada')), null);
});
