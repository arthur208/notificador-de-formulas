const { test, describe } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

// A chave precisa existir antes de o serviço carregar: ele a lê de config.
process.env.APP_CRYPTO_KEY ||= crypto.randomBytes(32).toString('base64');
const { separar, montar, ESCOPOS } = require('../services/tokenApiService');

describe('formato do token de API', () => {
    const id = 'a1b2c3d4e5f60718293a4b5c';

    test('monta e separa de volta', () => {
        const partes = separar(montar(id));
        assert.strictEqual(partes.identificador, id);
        assert.ok(partes.assinatura.length > 20);
    });

    // A assinatura é derivada do identificador com a APP_CRYPTO_KEY: dois
    // identificadores diferentes nunca compartilham assinatura.
    test('cada identificador tem assinatura própria', () => {
        assert.notStrictEqual(
            separar(montar(id)).assinatura,
            separar(montar('0000000000000000000000ff')).assinatura
        );
    });

    test('o mesmo identificador gera sempre o mesmo token', () => {
        assert.strictEqual(montar(id), montar(id));
    });

    test('formato errado devolve null em vez de estourar', () => {
        for (const ruim of ['', null, undefined, 'abc', 'ntk_so_um', 'outro_a_b', 'ntk__vazio']) {
            assert.strictEqual(separar(ruim), null, `falhou com ${JSON.stringify(ruim)}`);
        }
    });

    test('os escopos são os três conhecidos', () => {
        assert.deepStrictEqual(ESCOPOS, ['clientes:ler', 'receitas:ler', 'enviar']);
    });
});

// A assinatura é base64url, cujo alfabeto tem "_". Um split cego quebraria
// o token em quatro pedaços e recusaria token válido de forma intermitente,
// conforme a assinatura sorteasse ou não um sublinhado.
test('assinatura com sublinhado continua sendo lida', () => {
    const { separar } = require('../services/tokenApiService');
    const partes = separar('ntk_abc123_aaa_bbb-ccc_ddd');
    assert.strictEqual(partes.identificador, 'abc123');
    assert.strictEqual(partes.assinatura, 'aaa_bbb-ccc_ddd');
});

test('identificador não hexadecimal é recusado', () => {
    const { separar } = require('../services/tokenApiService');
    assert.strictEqual(separar('ntk_NAO-HEX_assinatura'), null);
});
