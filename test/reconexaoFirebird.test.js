const { test, describe } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Troca o pool por um dublê antes de o serviço carregar, para medir quantas
// vezes ele insiste sem depender do Firebird de verdade.
function carregarCom(comportamento) {
    const chamadas = { tentativas: 0 };
    const original = Module.prototype.require;

    Module.prototype.require = function (caminho) {
        if (caminho === '../config/db') {
            return {
                config: { firebird: { timeoutMs: 5000 } },
                fbPool: {
                    get(cb) {
                        chamadas.tentativas += 1;
                        comportamento(chamadas.tentativas, cb);
                    },
                },
            };
        }
        return original.apply(this, arguments);
    };

    delete require.cache[require.resolve('../services/firebirdService')];
    const servico = require('../services/firebirdService');
    Module.prototype.require = original;
    delete require.cache[require.resolve('../services/firebirdService')];
    return { servico, chamadas };
}

const RECUSA = new Error('Your user name and password are not defined');
const conexaoFalsa = { query: (_s, _p, cb) => cb(null, [{ X: 1 }]), detach() {} };

describe('insistência na conexão com o Firebird', () => {
    test('conexão de primeira não repete', async () => {
        const { servico, chamadas } = carregarCom((_n, cb) => cb(null, conexaoFalsa));
        await servico.queryFb('SELECT 1', []);
        assert.strictEqual(chamadas.tentativas, 1);
    });

    // É o caso real: a recusa passa na primeira ou segunda repetição.
    test('recusa passageira é vencida sem o chamador saber', async () => {
        const { servico, chamadas } = carregarCom((n, cb) =>
            (n < 3 ? cb(RECUSA) : cb(null, conexaoFalsa)));
        const r = await servico.queryFb('SELECT 1', []);
        assert.deepStrictEqual(r, [{ X: 1 }]);
        assert.strictEqual(chamadas.tentativas, 3);
    });

    test('recusa permanente desiste e informa', async () => {
        const { servico, chamadas } = carregarCom((_n, cb) => cb(RECUSA));
        await assert.rejects(
            () => servico.queryFb('SELECT 1', []),
            /Erro ao conectar ao DB Firebird/
        );
        assert.strictEqual(chamadas.tentativas, 6);
    });

    // Erro de SQL é determinístico: repetir só gastaria tempo, e numa
    // gravação repetiria o efeito.
    test('erro de SQL não é repetido', async () => {
        let consultas = 0;
        const { servico, chamadas } = carregarCom((_n, cb) => cb(null, {
            query: (_s, _p, q) => { consultas += 1; q(new Error('Token unknown')); },
            detach() {},
        }));
        await assert.rejects(() => servico.queryFb('SELECT lixo', []), /Token unknown/);
        assert.strictEqual(chamadas.tentativas, 1, 'não deveria pegar conexão de novo');
        assert.strictEqual(consultas, 1, 'não deveria repetir a consulta');
    });
});
