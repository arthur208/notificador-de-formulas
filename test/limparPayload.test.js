const { test, describe } = require('node:test');
const assert = require('node:assert');
const { limparPayload, MARCADOR_REMOCAO } = require('../utils/limparPayload');

describe('limpeza do payload do agente', () => {
    // O caso que motivou tudo: template fixo com um campo preenchido.
    test('só um campo preenchido, o resto vazio', () => {
        assert.deepStrictEqual(limparPayload({
            nome: 'Maria da Silva',
            cpf: '',
            nascimento: null,
            email: '   ',
            endereco: { logradouro: '', numero: '', bairro: '', cep: '' },
        }), { nome: 'Maria da Silva' });
    });

    test('remove null, undefined e string vazia', () => {
        assert.deepStrictEqual(
            limparPayload({ a: null, b: undefined, c: '', d: '   ', e: 'fica' }),
            { e: 'fica' }
        );
    });

    // A plataforma serializa ausência como texto com frequência.
    test('remove as strings "null" e "undefined"', () => {
        assert.deepStrictEqual(
            limparPayload({ a: 'null', b: 'undefined', c: ' NULL ', d: 'fica' }),
            { c: 'NULL', d: 'fica' }
        );
    });

    test('remove variável de template não substituída', () => {
        assert.deepStrictEqual(limparPayload({
            cpf: '{{cpf}}',
            nome: '{{ cliente.nome }}',
            email: 'real@exemplo.com',
        }), { email: 'real@exemplo.com' });
    });

    test('o que sobra vem trimado', () => {
        assert.deepStrictEqual(limparPayload({ nome: '  Maria  ' }), { nome: 'Maria' });
    });

    test('endereço com uma chave só mantém essa chave', () => {
        assert.deepStrictEqual(limparPayload({
            endereco: { logradouro: 'Rua A', numero: '', bairro: null, cep: '{{cep}}' },
        }), { endereco: { logradouro: 'Rua A' } });
    });

    test('endereço todo vazio sai do payload', () => {
        assert.deepStrictEqual(
            limparPayload({ nome: 'Maria', endereco: { logradouro: '', cep: null } }),
            { nome: 'Maria' }
        );
    });

    test('body inteiro vazio vira objeto vazio', () => {
        assert.deepStrictEqual(limparPayload({ nome: '', endereco: { cep: '' } }), {});
        assert.deepStrictEqual(limparPayload({}), {});
    });

    test('entrada que não é objeto não estoura', () => {
        for (const v of [null, undefined, 'texto', 42, []]) {
            assert.deepStrictEqual(limparPayload(v), {}, `falhou com ${JSON.stringify(v)}`);
        }
    });

    test('número e booleano passam intactos', () => {
        assert.deepStrictEqual(
            limparPayload({ endereco: { codigoCidade: 196 }, ativo: false }),
            { endereco: { codigoCidade: 196 }, ativo: false }
        );
    });

    describe('remoção intencional', () => {
        // Antes disto, `null` pedia para apagar. Com a plataforma mandando
        // null para campo não preenchido, apagar passou a exigir um marcador
        // que ninguém envia por acidente.
        test(`"${MARCADOR_REMOCAO}" vira null, que é o pedido de apagar`, () => {
            assert.deepStrictEqual(
                limparPayload({ email: MARCADOR_REMOCAO }),
                { email: null }
            );
        });

        test('funciona dentro do endereço', () => {
            assert.deepStrictEqual(
                limparPayload({ endereco: { complemento: MARCADOR_REMOCAO, cep: '' } }),
                { endereco: { complemento: null } }
            );
        });

        test('funciona dentro da lista de telefones', () => {
            assert.deepStrictEqual(
                limparPayload({ telefones: [{ tipo: 'celular', numero: MARCADOR_REMOCAO }] }),
                { telefones: [{ tipo: 'celular', numero: null }] }
            );
        });

        test('o marcador sobrevive ao trim', () => {
            assert.deepStrictEqual(
                limparPayload({ email: `  ${MARCADOR_REMOCAO}  ` }),
                { email: null }
            );
        });

        // Sem isto, um template com todos os telefones em branco viraria
        // pedido de apagar todos eles.
        test('telefone vazio NÃO vira pedido de apagar', () => {
            const r = limparPayload({ telefones: [{ tipo: 'celular', numero: '' }] });
            assert.deepStrictEqual(r, { telefones: [{ tipo: 'celular' }] });
            assert.ok(!('numero' in r.telefones[0]));
        });
    });

    test('lista que fica sem itens sai do payload', () => {
        assert.deepStrictEqual(limparPayload({ nome: 'Maria', telefones: [] }), { nome: 'Maria' });
        assert.deepStrictEqual(limparPayload({ nome: 'Maria', telefones: ['', null] }), { nome: 'Maria' });
    });
});
