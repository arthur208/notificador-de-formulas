const { test, describe } = require('node:test');
const assert = require('node:assert');
const { validarCadastro, cpfValido } = require('../utils/validacaoCadastro');

const campos = (erros) => erros.map((e) => e.campo).sort();

describe('CPF', () => {
    test('aceita CPF com dígitos verificadores certos', () => {
        assert.ok(cpfValido('03721801911'));
    });

    // Sem conferir os dígitos, "11111111111" entraria e contaminaria o
    // cadastro de um jeito difícil de desfazer.
    test('recusa sequência repetida', () => {
        for (const c of ['11111111111', '00000000000', '99999999999']) {
            assert.ok(!cpfValido(c), `${c} deveria ser inválido`);
        }
    });

    test('recusa dígito verificador errado', () => {
        assert.ok(!cpfValido('03721801912'));
    });

    test('recusa tamanho errado', () => {
        assert.ok(!cpfValido('0372180191'));
    });
});

describe('validação do cadastro', () => {
    test('cadastro correto não produz erro', () => {
        assert.deepStrictEqual(validarCadastro({
            nome: 'Maria da Silva',
            cpf: '037.218.019-11',
            nascimento: '1980-10-20',
            email: 'maria@exemplo.com',
            telefones: [{ tipo: 'celular', numero: '44991135801' }],
            endereco: { logradouro: 'Rua Curitiba', numero: '103', bairro: 'Centro', cep: '87900000', codigoCidade: 196 },
        }), []);
    });

    // O pedido foi explícito: validar tudo antes de salvar qualquer coisa.
    // Parar no primeiro erro obrigaria a descobrir os defeitos um por vez.
    test('devolve TODOS os erros de uma vez, não só o primeiro', () => {
        const erros = validarCadastro({
            nome: '',
            cpf: '111',
            nascimento: '20/10/1980',
            email: 'sem-arroba',
            telefones: [{ tipo: 'fax', numero: '123' }],
            endereco: { cep: '123' },
        });
        assert.ok(erros.length >= 6, `esperava 6 ou mais, veio ${erros.length}`);
        assert.ok(campos(erros).includes('nome'));
        assert.ok(campos(erros).includes('cpf'));
        assert.ok(campos(erros).includes('nascimento'));
        assert.ok(campos(erros).includes('email'));
        assert.ok(campos(erros).includes('endereco.cep'));
    });

    test('corpo vazio é recusado', () => {
        assert.ok(validarCadastro({}).some((e) => /ao menos um campo/.test(e.erro)));
    });

    // Campo com nome errado seria ignorado em silêncio, e quem integra
    // acharia que gravou.
    test('campo desconhecido é recusado em vez de ignorado', () => {
        const erros = validarCadastro({ nomeCompleto: 'Maria' });
        assert.ok(erros.some((e) => /desconhecidos/.test(e.erro)));
    });

    test('nome maior que a coluna do ERP é recusado', () => {
        const erros = validarCadastro({ nome: 'x'.repeat(41) });
        assert.ok(erros.some((e) => e.campo === 'nome' && /40/.test(e.erro)));
    });

    test('nascimento no futuro é recusado', () => {
        const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        assert.ok(validarCadastro({ nascimento: amanha }).some((e) => e.campo === 'nascimento'));
    });

    test('data inexistente é recusada', () => {
        assert.ok(validarCadastro({ nascimento: '2026-02-31' }).some((e) => e.campo === 'nascimento'));
    });

    test('telefone sem DDD é recusado', () => {
        const erros = validarCadastro({ telefones: [{ tipo: 'celular', numero: '991135801' }] });
        assert.ok(erros.some((e) => e.campo === 'telefones[0].numero'));
    });

    // null apaga o número de propósito; string vazia é engano de quem chama.
    test('telefone null é aceito, para poder apagar', () => {
        assert.deepStrictEqual(validarCadastro({ telefones: [{ tipo: 'celular', numero: null }] }), []);
    });

    test('tipo de telefone repetido é recusado', () => {
        const erros = validarCadastro({ telefones: [
            { tipo: 'celular', numero: '44991135801' },
            { tipo: 'celular', numero: '44991135802' },
        ] });
        assert.ok(erros.some((e) => e.campo === 'telefones' && /repetido/.test(e.erro)));
    });

    test('campos do endereço respeitam o tamanho das colunas', () => {
        const erros = validarCadastro({ endereco: {
            logradouro: 'x'.repeat(41), numero: '123456', bairro: 'y'.repeat(21),
        } });
        assert.deepStrictEqual(campos(erros), ['endereco.bairro', 'endereco.logradouro', 'endereco.numero']);
    });

    test('CEP com 8 dígitos passa, com pontuação também', () => {
        assert.deepStrictEqual(validarCadastro({ endereco: { cep: '87.900-000' } }), []);
    });
});
