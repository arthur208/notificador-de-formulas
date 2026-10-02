const { test, describe } = require('node:test');
const assert = require('node:assert');
const { consultarCep, NAO_ENCONTRADO, INDISPONIVEL } = require('../services/cepService');

// Respostas copiadas das APIs de verdade, com os campos que importam.
const VIACEP_LOANDA = {
    cep: '87900-000', logradouro: '', bairro: '', localidade: 'Loanda',
    uf: 'PR', estado: 'Paraná', ibge: '4113502', ddd: '44',
};
const VIACEP_RECUSA = { erro: 'true' };
const BRASILAPI_SARANDI = {
    cep: '99999999', state: 'PR', city: 'Sarandi',
    neighborhood: 'Jardim Centro Cívico', street: 'Avenida das Torres',
    service: 'open-cep', ibge: { city: '4126256', state: '41' },
};
const BRASILAPI_LOANDA = {
    cep: '87900000', state: 'PR', city: 'Loanda',
    service: 'open-cep', ibge: { city: '4113502', state: '41' },
};

// Monta um `fetch` falso. `chamadas` registra quem foi consultado, que é como
// se verifica a ORDEM dos provedores — o ponto central deste módulo.
function falso(respostas, chamadas = []) {
    return async (url) => {
        const quem = url.includes('viacep') ? 'viacep' : 'brasilapi';
        chamadas.push(quem);
        const r = respostas[quem];
        if (r === 'rede') throw new Error('getaddrinfo ENOTFOUND');
        if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => r };
    };
}

describe('caminho normal', () => {
    test('ViaCEP responde e a BrasilAPI nem é consultada', async () => {
        const chamadas = [];
        const r = await consultarCep('87900000', {
            buscar: falso({ viacep: VIACEP_LOANDA }, chamadas),
        });
        assert.deepStrictEqual(r, {
            ibge: '4113502', cidade: 'Loanda', uf: 'PR', fonte: 'viacep',
        });
        assert.deepStrictEqual(chamadas, ['viacep'], 'consultou a BrasilAPI sem precisar');
    });

    test('aceita CEP pontuado', async () => {
        const r = await consultarCep('87900-000', { buscar: falso({ viacep: VIACEP_LOANDA }) });
        assert.strictEqual(r.cidade, 'Loanda');
    });

    test('CEP com contagem errada de dígitos não gasta chamada externa', async () => {
        const chamadas = [];
        for (const cep of ['', '879', '879000000', null]) {
            const r = await consultarCep(cep, { buscar: falso({}, chamadas) });
            assert.strictEqual(r.erro, NAO_ENCONTRADO, `falhou com ${JSON.stringify(cep)}`);
        }
        assert.deepStrictEqual(chamadas, [], 'chamou a rede para CEP inválido');
    });
});

// O ponto mais importante do módulo. Medido contra as APIs reais: para o CEP
// inexistente 99999999, o ViaCEP recusa e a BrasilAPI devolve Sarandi/PR.
// Se o "não existe" do ViaCEP virasse consulta ao segundo provedor, um
// dígito errado trocaria a cidade de um cliente de verdade.
describe('o "não existe" do ViaCEP é final', () => {
    test('não cai para a BrasilAPI quando o ViaCEP recusa', async () => {
        const chamadas = [];
        const r = await consultarCep('99999999', {
            buscar: falso({ viacep: VIACEP_RECUSA, brasilapi: BRASILAPI_SARANDI }, chamadas),
        });
        assert.strictEqual(r.erro, NAO_ENCONTRADO);
        assert.deepStrictEqual(chamadas, ['viacep'], 'perguntou à BrasilAPI atrás de um sim');
        assert.ok(!r.cidade, 'devolveu cidade para um CEP que não existe');
    });

    test('e a cidade inventada nunca aparece na resposta', async () => {
        const r = await consultarCep('99999999', {
            buscar: falso({ viacep: VIACEP_RECUSA, brasilapi: BRASILAPI_SARANDI }),
        });
        assert.ok(!JSON.stringify(r).includes('Sarandi'));
    });
});

describe('a BrasilAPI entra quando o ViaCEP não responde', () => {
    test('erro de rede no ViaCEP', async () => {
        const chamadas = [];
        const r = await consultarCep('87900000', {
            buscar: falso({ viacep: 'rede', brasilapi: BRASILAPI_LOANDA }, chamadas),
        });
        assert.deepStrictEqual(chamadas, ['viacep', 'brasilapi']);
        assert.strictEqual(r.cidade, 'Loanda');
        assert.strictEqual(r.ibge, '4113502');
        assert.strictEqual(r.fonte, 'brasilapi', 'a resposta precisa dizer de onde veio');
    });

    test('ViaCEP fora do ar com 5xx', async () => {
        const r = await consultarCep('87900000', {
            buscar: falso({ viacep: 500, brasilapi: BRASILAPI_LOANDA }),
        });
        assert.strictEqual(r.fonte, 'brasilapi');
    });

    test('os dois fora do ar dão INDISPONIVEL, não NAO_ENCONTRADO', async () => {
        const r = await consultarCep('87900000', {
            buscar: falso({ viacep: 'rede', brasilapi: 'rede' }),
        });
        // A diferença decide 502 contra 422: indisponibilidade vale repetir,
        // CEP errado não.
        assert.strictEqual(r.erro, INDISPONIVEL);
    });

    test('ViaCEP mudo e BrasilAPI recusando dá NAO_ENCONTRADO', async () => {
        const r = await consultarCep('12345678', {
            buscar: falso({ viacep: 'rede', brasilapi: 404 }),
        });
        assert.strictEqual(r.erro, NAO_ENCONTRADO);
    });
});

describe('resposta incompleta não passa por boa', () => {
    test('ViaCEP sem localidade', async () => {
        const r = await consultarCep('87900000', {
            buscar: falso({ viacep: { cep: '87900-000', uf: 'PR' }, brasilapi: 404 }),
        });
        assert.strictEqual(r.erro, NAO_ENCONTRADO);
    });

    test('CEP de cidade sem IBGE ainda serve: o nome resolve', async () => {
        const r = await consultarCep('87900000', {
            buscar: falso({ viacep: { localidade: 'Loanda', uf: 'PR', ibge: '' } }),
        });
        assert.strictEqual(r.ibge, null);
        assert.strictEqual(r.cidade, 'Loanda');
    });

    test('UF sempre em maiúscula', async () => {
        const r = await consultarCep('87900000', {
            buscar: falso({ viacep: { localidade: 'Loanda', uf: 'pr', ibge: '4113502' } }),
        });
        assert.strictEqual(r.uf, 'PR');
    });
});
