const { test, describe } = require('node:test');
const assert = require('node:assert');
const { deduzirSexo, primeiroNome, CONFIANCA_MINIMA } = require('../services/sexoService');

// Frequências reais do censo, como a API do IBGE devolve.
const CENSO = {
    MARIA: { F: 11694738, M: 39391 },      // 99,7% F
    ANTONIO: { F: 8854, M: 2567494 },      // 99,7% M
    ROSINEIA: { F: 10081, M: 0 },          // 100% F
    ADENILSON: { F: 116, M: 34131 },       // 99,7% M
    DARCI: { F: 20941, M: 42379 },         // 66,9% M — dividido de verdade
    INVENTADO: { F: 0, M: 0 },             // não existe no censo
};

// `buscar` falso no formato da API: /nomes/<NOME>?sexo=F
function falso(censo = CENSO, chamadas = []) {
    return async (url) => {
        const m = url.match(/nomes\/([^?]+)\?sexo=([FM])/);
        const nome = decodeURIComponent(m[1]);
        chamadas.push(`${nome}:${m[2]}`);
        const dados = censo[nome];
        if (dados === 'rede') throw new Error('ENOTFOUND');
        if (dados === undefined) return { ok: true, status: 200, json: async () => [] };
        return {
            ok: true,
            status: 200,
            json: async () => [{ nome, res: [{ periodo: '2000', frequencia: dados[m[2]] }] }],
        };
    };
}

describe('dedução pelo primeiro nome', () => {
    test('nome claramente feminino', async () => {
        const r = await deduzirSexo('Rosineia Salvate', { buscar: falso() });
        assert.strictEqual(r.sexo, 'F');
        assert.strictEqual(r.nome, 'ROSINEIA');
        assert.ok(r.confianca >= 0.99);
    });

    test('nome claramente masculino', async () => {
        const r = await deduzirSexo('Adenilson Francisco da Silva', { buscar: falso() });
        assert.strictEqual(r.sexo, 'M');
    });

    test('usa só o primeiro nome, não o sobrenome', async () => {
        const chamadas = [];
        await deduzirSexo('Antonio Munhoz Ortiz', { buscar: falso(CENSO, chamadas) });
        assert.deepStrictEqual(chamadas.sort(), ['ANTONIO:F', 'ANTONIO:M']);
    });

    test('acento e caixa não atrapalham', async () => {
        const r = await deduzirSexo('maría aparecida', { buscar: falso() });
        assert.strictEqual(r.sexo, 'F');
    });
});

// O ponto do módulo: nunca devolver palpite fraco com cara de resposta.
// null é o sinal para o agente perguntar ao cliente.
describe('o que não dá para afirmar devolve null', () => {
    test('nome genuinamente dividido', async () => {
        // DARCI: 66,9% M. Deduzir aqui seria sorteio.
        assert.strictEqual(await deduzirSexo('Darci Pereira', { buscar: falso() }), null);
    });

    test('nome que não está no censo', async () => {
        assert.strictEqual(await deduzirSexo('Inventado Silva', { buscar: falso() }), null);
    });

    test('nome que a API não conhece devolve lista vazia', async () => {
        assert.strictEqual(await deduzirSexo('Xyzabc Silva', { buscar: falso() }), null);
    });

    test('IBGE fora do ar não vira palpite nem exceção', async () => {
        const r = await deduzirSexo('Zutano', { buscar: falso({ ZUTANO: 'rede' }) });
        assert.strictEqual(r, null);
    });

    test('nome vazio nem consulta', async () => {
        const chamadas = [];
        for (const v of [null, undefined, '', '   ', '...']) {
            assert.strictEqual(await deduzirSexo(v, { buscar: falso(CENSO, chamadas) }), null);
        }
        assert.deepStrictEqual(chamadas, []);
    });

    // Oscilação de rede não pode ficar grudada no cache até o processo
    // reiniciar: o mesmo nome tem que ser tentado de novo.
    test('falha de rede não entra no cache', async () => {
        const chamadas = [];
        const censo = { FULANOTESTE: 'rede' };
        await deduzirSexo('Fulanoteste', { buscar: falso(censo, chamadas) });
        await deduzirSexo('Fulanoteste', { buscar: falso(censo, chamadas) });
        assert.strictEqual(chamadas.length, 4, 'a segunda chamada veio do cache');
    });
});

describe('cache', () => {
    test('o mesmo nome não é consultado duas vezes', async () => {
        const chamadas = [];
        const censo = { NOMECACHEADO: { F: 9000, M: 10 } };
        const buscar = falso(censo, chamadas);
        const a = await deduzirSexo('Nomecacheado Souza', { buscar });
        const b = await deduzirSexo('Nomecacheado Lima', { buscar });
        assert.strictEqual(a.sexo, 'F');
        assert.deepStrictEqual(b, a);
        assert.strictEqual(chamadas.length, 2, 'consultou o IBGE de novo');
    });

    test('nome dividido também fica no cache, como null', async () => {
        const chamadas = [];
        const censo = { DIVIDIDOTESTE: { F: 500, M: 500 } };
        const buscar = falso(censo, chamadas);
        assert.strictEqual(await deduzirSexo('Divididoteste', { buscar }), null);
        assert.strictEqual(await deduzirSexo('Divididoteste', { buscar }), null);
        assert.strictEqual(chamadas.length, 2);
    });
});

describe('limite de confiança', () => {
    test('exatamente no limite passa', async () => {
        const censo = { LIMITEEXATO: { F: 90, M: 10 } };
        const r = await deduzirSexo('Limiteexato', { buscar: falso(censo) });
        assert.strictEqual(r.sexo, 'F');
        assert.strictEqual(r.confianca, CONFIANCA_MINIMA);
    });

    test('logo abaixo do limite não passa', async () => {
        const censo = { ABAIXODOLIMITE: { F: 89, M: 11 } };
        assert.strictEqual(await deduzirSexo('Abaixodolimite', { buscar: falso(censo) }), null);
    });
});

describe('primeiro nome', () => {
    test('separa, tira acento e normaliza', () => {
        assert.strictEqual(primeiroNome('José Carlos da Silva'), 'JOSE');
        assert.strictEqual(primeiroNome('  maría  '), 'MARIA');
    });

    test('nome que é só pontuação não vira nome', () => {
        for (const v of ['.', '...', '123', null]) {
            assert.strictEqual(primeiroNome(v), null, `falhou com ${JSON.stringify(v)}`);
        }
    });
});
