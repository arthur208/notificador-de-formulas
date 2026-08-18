import { test } from 'node:test';
import assert from 'node:assert';
import { formatarTelefone, dataParaExibicao } from '../src/formatadores.ts';

test('formata celular com DDI e nono dígito', () => {
    assert.strictEqual(formatarTelefone('5544997028340'), '(44) 99702-8340');
});

test('formata fixo de oito dígitos', () => {
    assert.strictEqual(formatarTelefone('554434251122'), '(44) 3425-1122');
});

test('devolve o valor original quando não reconhece o formato', () => {
    assert.strictEqual(formatarTelefone('123'), '123');
    assert.strictEqual(formatarTelefone(''), '');
});

test('ignora pontuação na entrada', () => {
    assert.strictEqual(formatarTelefone('+55 (44) 99702-8340'), '(44) 99702-8340');
});

test('data para exibição sai em português', () => {
    assert.strictEqual(dataParaExibicao('2026-08-18'), 'terça, 18 de agosto');
});
