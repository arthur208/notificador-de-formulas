const { test } = require('node:test');
const assert = require('node:assert');
const { gerarHash, conferirSenha } = require('../utils/senha');

test('a senha correta confere', async () => {
    const hash = await gerarHash('senhaDaAtendente123');
    assert.strictEqual(await conferirSenha('senhaDaAtendente123', hash), true);
});

test('a senha errada não confere', async () => {
    const hash = await gerarHash('senhaDaAtendente123');
    assert.strictEqual(await conferirSenha('outraSenha', hash), false);
});

test('o hash não contém a senha em texto', async () => {
    const hash = await gerarHash('senhaDaAtendente123');
    assert.ok(!hash.includes('senhaDaAtendente123'));
});

test('duas gerações da mesma senha produzem hashes diferentes', async () => {
    const [a, b] = await Promise.all([gerarHash('igualigual'), gerarHash('igualigual')]);
    assert.notStrictEqual(a, b);
});

test('hash malformado devolve falso, não estoura', async () => {
    assert.strictEqual(await conferirSenha('x', 'lixo'), false);
    assert.strictEqual(await conferirSenha('x', ''), false);
    assert.strictEqual(await conferirSenha('x', null), false);
});

test('senha curta ou vazia é recusada na geração', async () => {
    await assert.rejects(() => gerarHash(''), /senha/i);
    await assert.rejects(() => gerarHash('curta'), /8 caracteres/);
});

test('aceita acento e emoji sem corromper', async () => {
    const hash = await gerarHash('sençaÇÃO💊2026');
    assert.strictEqual(await conferirSenha('sençaÇÃO💊2026', hash), true);
});
