const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { cifrar, decifrar, mascarar } = require('../utils/cripto');

const chave = crypto.randomBytes(32).toString('base64');

test('decifrar devolve o texto original', () => {
    const pacote = cifrar('token_da_conexao_abc123', chave);
    assert.strictEqual(decifrar(pacote, chave), 'token_da_conexao_abc123');
});

test('o texto cifrado não contém o original', () => {
    const pacote = cifrar('token_da_conexao_abc123', chave);
    assert.ok(!pacote.includes('token_da_conexao'));
});

test('duas cifragens do mesmo texto são diferentes', () => {
    assert.notStrictEqual(cifrar('igual', chave), cifrar('igual', chave));
});

test('chave errada não decifra', () => {
    const pacote = cifrar('segredo', chave);
    const outra = crypto.randomBytes(32).toString('base64');
    assert.throws(() => decifrar(pacote, outra));
});

test('conteúdo adulterado é recusado', () => {
    const pacote = cifrar('segredo', chave);
    const partes = pacote.split('.');
    partes[2] = Buffer.from('outracoisa').toString('base64');
    assert.throws(() => decifrar(partes.join('.'), chave));
});

test('chave de tamanho errado é recusada', () => {
    assert.throws(() => cifrar('x', Buffer.alloc(16).toString('base64')), /32 bytes/);
});

test('formato inválido é recusado', () => {
    assert.throws(() => decifrar('sem-pontos', chave), /[Ff]ormato/);
});

test('mascarar mostra apenas os quatro últimos', () => {
    assert.strictEqual(mascarar('abcdefghij9a3f9'), '••••••••a3f9');
    assert.strictEqual(mascarar('abc'), '••••');
    assert.strictEqual(mascarar(''), '••••');
    assert.strictEqual(mascarar(null), '••••');
});
