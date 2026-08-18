const { test } = require('node:test');
const assert = require('node:assert');
const { lerCookies } = require('../utils/cookies');

test('lê um cookie', () => {
    assert.deepStrictEqual(lerCookies('sessao=abc123'), { sessao: 'abc123' });
});

test('lê vários cookies com espaço', () => {
    assert.deepStrictEqual(lerCookies('a=1; sessao=abc; b=2'), { a: '1', sessao: 'abc', b: '2' });
});

test('decodifica valor percent-encoded', () => {
    assert.deepStrictEqual(lerCookies('x=a%20b'), { x: 'a b' });
});

test('valor com sinal de igual é preservado', () => {
    assert.deepStrictEqual(lerCookies('t=YWJj=='), { t: 'YWJj==' });
});

test('cabeçalho ausente devolve objeto vazio', () => {
    assert.deepStrictEqual(lerCookies(undefined), {});
    assert.deepStrictEqual(lerCookies(''), {});
});

test('parte malformada é ignorada sem estourar', () => {
    assert.deepStrictEqual(lerCookies('semigual; a=1'), { a: '1' });
});
