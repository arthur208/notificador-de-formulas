const { test, describe } = require('node:test');
const assert = require('node:assert');
const { variantesDeTelefone } = require('../utils/telefone');

// A consulta que o serviço monta, reproduzida aqui. O que importa testar é a
// REGRA — quais números casam, qual janela, qual status — não o driver do
// Mongo. Um findOne falso deixa a regra visível e o teste roda sem banco.
function montarCandidatos(telefone) {
    const variantes = variantesDeTelefone(telefone);
    if (variantes.length === 0) return [];
    return variantes.flatMap((v) => [v, `55${v}`]);
}

// Reimplementação mínima do findOne do Mongo para os operadores usados.
function findOneFalso(documentos) {
    return async (filtro) => {
        const achado = documentos.find((d) => (
            d.status === filtro.status
            && filtro.telefoneEnviado.$in.includes(d.telefoneEnviado)
            && d.timestamp >= filtro.timestamp.$gte
        ));
        return achado ?? null;
    };
}

async function notificou(telefone, janelaHoras, documentos) {
    const candidatos = montarCandidatos(telefone);
    if (candidatos.length === 0) return false;
    const achado = await findOneFalso(documentos)({
        status: 'sucesso',
        telefoneEnviado: { $in: candidatos },
        timestamp: { $gte: new Date(Date.now() - janelaHoras * 3600000) },
    });
    return achado !== null;
}

const horasAtras = (h) => new Date(Date.now() - h * 3600000);

// As duas formas que o telefone é gravado de verdade, vistas na coleção:
// "554491135801" veio do JID da MultiAtend (sem o 9º dígito) e
// "5544991135801" viria do formatPhoneNumber (com o 9).
const SEM_NONO = { status: 'sucesso', telefoneEnviado: '554491135801', timestamp: horasAtras(2) };
const COM_NONO = { status: 'sucesso', telefoneEnviado: '5544991135801', timestamp: horasAtras(2) };

describe('o 9º dígito não decide', () => {
    // O ponto crítico: 21 dos 23 números em cache têm JID sem o 9, então o
    // gravado quase nunca é igual ao que o agente manda.
    test('consulta COM o 9 acha envio gravado SEM o 9', async () => {
        assert.strictEqual(await notificou('44991135801', 24, [SEM_NONO]), true);
    });

    test('consulta SEM o 9 acha envio gravado COM o 9', async () => {
        assert.strictEqual(await notificou('4491135801', 24, [COM_NONO]), true);
    });

    test('com DDI na consulta também acha', async () => {
        assert.strictEqual(await notificou('5544991135801', 24, [SEM_NONO]), true);
        assert.strictEqual(await notificou('+55 (44) 99113-5801', 24, [SEM_NONO]), true);
    });

    test('número de outra pessoa não acha', async () => {
        assert.strictEqual(await notificou('44999998888', 24, [SEM_NONO, COM_NONO]), false);
    });

    // DDD 55 é Rio Grande do Sul: tirar o "55" da frente aqui viraria outro
    // número. A mesma guarda que existe em variantesDeTelefone.
    test('DDD 55 não é confundido com DDI', async () => {
        const gaucho = { status: 'sucesso', telefoneEnviado: '5555991234567', timestamp: horasAtras(1) };
        assert.strictEqual(await notificou('55991234567', 24, [gaucho]), true);
    });
});

describe('a janela', () => {
    test('dentro da janela é true', async () => {
        assert.strictEqual(await notificou('44991135801', 24, [SEM_NONO]), true);
    });

    test('fora da janela é false', async () => {
        const antigo = { ...SEM_NONO, timestamp: horasAtras(30) };
        assert.strictEqual(await notificou('44991135801', 24, [antigo]), false);
    });

    test('a janela é configurável nos dois sentidos', async () => {
        const vinteHoras = { ...SEM_NONO, timestamp: horasAtras(20) };
        assert.strictEqual(await notificou('44991135801', 24, [vinteHoras]), true);
        assert.strictEqual(await notificou('44991135801', 12, [vinteHoras]), false);
        assert.strictEqual(await notificou('44991135801', 48, [vinteHoras]), true);
    });

    test('envio de agora conta', async () => {
        const agora = { ...SEM_NONO, timestamp: new Date() };
        assert.strictEqual(await notificou('44991135801', 24, [agora]), true);
    });
});

describe('só envio confirmado conta', () => {
    // Tentativa que falhou não avisou ninguém. Contá-la faria o agente calar
    // justamente para quem não recebeu nada.
    test('status erro não conta como aviso', async () => {
        const falhou = { status: 'erro', telefoneEnviado: '554491135801', timestamp: horasAtras(1) };
        assert.strictEqual(await notificou('44991135801', 24, [falhou]), false);
    });

    test('erro e sucesso juntos: o sucesso vale', async () => {
        const falhou = { status: 'erro', telefoneEnviado: '554491135801', timestamp: horasAtras(1) };
        assert.strictEqual(await notificou('44991135801', 24, [falhou, SEM_NONO]), true);
    });
});

describe('telefone que não dá para usar', () => {
    test('não consulta e devolve false', async () => {
        for (const v of [null, undefined, '', '123', '4499', 'abc']) {
            assert.strictEqual(
                await notificou(v, 24, [SEM_NONO]), false,
                `falhou com ${JSON.stringify(v)}`
            );
        }
    });
});

describe('os candidatos cobrem as duas formas de gravação', () => {
    test('cada variante entra com e sem DDI', () => {
        const c = montarCandidatos('44991135801');
        for (const esperado of ['44991135801', '5544991135801', '4491135801', '554491135801']) {
            assert.ok(c.includes(esperado), `faltou ${esperado}`);
        }
    });

    test('telefone inválido não gera candidato nenhum', () => {
        assert.deepStrictEqual(montarCandidatos('123'), []);
    });
});
