const { test, describe } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Substitui as dependências antes de carregar o serviço: o objetivo é
// testar a lógica de cache e de tolerância a falha, sem banco nem API.
function carregarComDublês({ doc, validar }) {
    const chamadas = { api: 0, gravou: null };
    const original = Module.prototype.require;

    Module.prototype.require = function (caminho) {
        if (caminho === '../config/db') {
            return {
                getDb: () => ({
                    collection: () => ({
                        findOne: async () => doc,
                        updateOne: async (_f, u) => { chamadas.gravou = u.$set; },
                        createIndex: async () => {},
                    }),
                }),
            };
        }
        if (caminho === './whatsmeowService') {
            return { validarNumero: async (n) => { chamadas.api++; return validar(n); } };
        }
        return original.apply(this, arguments);
    };

    delete require.cache[require.resolve('../services/numeroService')];
    const servico = require('../services/numeroService');
    Module.prototype.require = original;
    delete require.cache[require.resolve('../services/numeroService')];
    return { servico, chamadas };
}

const OK = async () => ({ existe: true, numeroFormatado: '554491135801', nomeVerificado: null });

describe('validação de número', () => {
    // A regra do 9º dígito acerta a linha nova e erra a antiga. Quem manda
    // é a API: 21 dos 23 números do cache de dev não têm o 9, e enviar com
    // ele devolve 200 sem entregar a ninguém.
    test('o número de envio é o da API, não o da nossa regra', async () => {
        const { servico } = carregarComDublês({ doc: null, validar: OK });
        const r = await servico.validar('44991135801');
        assert.strictEqual(r.numeroEnvio, '554491135801');
        assert.notStrictEqual(r.numeroEnvio, '5544991135801');
    });

    test('cache fresco não chama a API', async () => {
        const { servico, chamadas } = carregarComDublês({
            doc: { numero: '554491135801', existe: true, numeroFormatado: '554491135801', validadoEm: new Date() },
            validar: OK,
        });
        const r = await servico.validar('44991135801');
        assert.strictEqual(r.situacao, 'tem');
        assert.strictEqual(r.doCache, true);
        assert.strictEqual(chamadas.api, 0);
    });

    test('cache vencido chama a API de novo', async () => {
        const antigo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
        const { servico, chamadas } = carregarComDublês({
            doc: { numero: '554491135801', existe: false, validadoEm: antigo },
            validar: OK,
        });
        const r = await servico.validar('44991135801');
        assert.strictEqual(r.situacao, 'tem');
        assert.strictEqual(chamadas.api, 1);
    });

    test('forcar ignora o cache', async () => {
        const { servico, chamadas } = carregarComDublês({
            doc: { numero: '554491135801', existe: true, validadoEm: new Date() },
            validar: OK,
        });
        await servico.validar('44991135801', { forcar: true });
        assert.strictEqual(chamadas.api, 1);
    });

    // A validação é conveniência: API fora do ar não pode impedir o envio.
    test('API fora do ar devolve desconhecido, não lança', async () => {
        const { servico } = carregarComDublês({
            doc: null,
            validar: async () => { throw new Error('502'); },
        });
        const r = await servico.validar('44991135801');
        assert.strictEqual(r.situacao, 'desconhecido');
        assert.strictEqual(r.numeroEnvio, '5544991135801');
    });

    test('número sem dígitos suficientes é invalido e não vai à API', async () => {
        const { servico, chamadas } = carregarComDublês({ doc: null, validar: OK });
        const r = await servico.validar('123');
        assert.strictEqual(r.situacao, 'invalido');
        assert.strictEqual(r.numeroEnvio, null);
        assert.strictEqual(chamadas.api, 0);
    });

    test('grava no cache pelo número normalizado, não pelo digitado', async () => {
        const { servico, chamadas } = carregarComDublês({ doc: null, validar: OK });
        await servico.validar('(44) 99113-5801');
        assert.strictEqual(chamadas.gravou.numero, '5544991135801');
    });

    test('lista repetida vira uma consulta só por número', async () => {
        const { servico } = carregarComDublês({ doc: null, validar: OK });
        const r = await servico.validarVarios(['44991135801', '44991135801', '']);
        assert.strictEqual(r.length, 1);
    });
});
