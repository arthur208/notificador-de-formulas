const { test, describe } = require('node:test');
const assert = require('node:assert');
const { resumir, mascararCpf, primeiroNome, faltando } = require('../utils/resumoCliente');

const completo = {
    codigoPessoa: 4559,
    nome: 'Cristina Farias',
    cpf: '03721801911',
    nascimento: '1980-10-20',
    email: 'cristina@exemplo.com',
    telefones: [{ tipo: 'celular', numero: '44988239501' }],
    enderecos: [{
        logradouro: 'Rua Curitiba', numero: '103', bairro: 'Centro',
        cep: '87900000', cidade: 'Santa Cruz do Monte Castelo', uf: 'PR', entrega: true,
    }],
};

describe('máscara do CPF', () => {
    // O cliente reconhece o próprio CPF pelo miolo, mas o número não sai
    // inteiro para nenhuma ferramenta de integração.
    test('esconde as pontas e mostra o miolo', () => {
        assert.strictEqual(mascararCpf('03721801911'), '***.218.019-**');
    });

    test('aceita CPF já pontuado', () => {
        assert.strictEqual(mascararCpf('037.218.019-11'), '***.218.019-**');
    });

    test('CPF ausente ou incompleto vira null, nunca máscara falsa', () => {
        for (const v of [null, undefined, '', '123', '0372180191']) {
            assert.strictEqual(mascararCpf(v), null, `falhou com ${JSON.stringify(v)}`);
        }
    });

    test('os dígitos verificadores nunca aparecem', () => {
        assert.ok(!mascararCpf('03721801911').includes('11'.slice(-2) + '$'));
        assert.match(mascararCpf('03721801911'), /-\*\*$/);
    });
});

describe('primeiro nome', () => {
    test('pega só o primeiro', () => {
        assert.strictEqual(primeiroNome('Cristina Farias da Silva'), 'Cristina');
    });
    test('espaço sobrando não atrapalha', () => {
        assert.strictEqual(primeiroNome('  Cristina  Farias '), 'Cristina');
    });
    test('vazio vira null', () => {
        assert.strictEqual(primeiroNome('   '), null);
        assert.strictEqual(primeiroNome(null), null);
    });
});

describe('o que falta no cadastro', () => {
    test('cadastro completo não tem pendência', () => {
        assert.deepStrictEqual(faltando(completo), []);
        assert.strictEqual(resumir(completo).completo, true);
    });

    test('lista só os campos vazios', () => {
        const parcial = {
            ...completo, email: null,
            enderecos: [{ ...completo.enderecos[0], cep: null, bairro: null }],
        };
        assert.deepStrictEqual(faltando(parcial), ['bairro', 'cep', 'email']);
    });

    test('cliente sem telefone nenhum é sinalizado', () => {
        assert.ok(faltando({ ...completo, telefones: [] }).includes('telefone'));
    });

    test('cliente sem endereço acusa todos os campos dele', () => {
        const semEndereco = faltando({ ...completo, enderecos: [] });
        for (const campo of ['logradouro', 'numero', 'bairro', 'cep', 'cidade']) {
            assert.ok(semEndereco.includes(campo), `esperava ${campo}`);
        }
    });

    // Quem integra monta a pergunta ao cliente a partir desta lista; ordem
    // que muda a cada chamada faria a conversa mudar sozinha.
    test('a ordem é estável entre chamadas', () => {
        const a = faltando({ ...completo, email: null, cpf: null });
        const b = faltando({ ...completo, cpf: null, email: null });
        assert.deepStrictEqual(a, b);
        assert.deepStrictEqual(a, ['cpf', 'email']);
    });
});

describe('resumo', () => {
    test('devolve o formato combinado, sem dado cru', () => {
        const r = resumir({
            ...completo, email: null,
            enderecos: [{ ...completo.enderecos[0], cep: null, bairro: null }],
        });
        assert.deepStrictEqual(r, {
            codigoPessoa: 4559,
            nome: 'Cristina Farias',
            primeiroNome: 'Cristina',
            cpfMascarado: '***.218.019-**',
            cidade: 'Santa Cruz do Monte Castelo/PR',
            completo: false,
            faltando: ['bairro', 'cep', 'email'],
        });
    });

    // A garantia que importa: nada do cadastro cru pode vazar pelo resumo.
    test('não expõe CPF inteiro, telefone, logradouro nem e-mail', () => {
        const texto = JSON.stringify(resumir(completo));
        assert.ok(!texto.includes('03721801911'), 'vazou o CPF');
        assert.ok(!texto.includes('44988239501'), 'vazou o telefone');
        assert.ok(!texto.includes('Rua Curitiba'), 'vazou o logradouro');
        assert.ok(!texto.includes('cristina@exemplo.com'), 'vazou o e-mail');
        assert.ok(!texto.includes('1980-10-20'), 'vazou o nascimento');
    });

    test('prefere o endereço de entrega quando há mais de um', () => {
        const r = resumir({ ...completo, enderecos: [
            { cidade: 'Loanda', uf: 'PR', entrega: false },
            { cidade: 'Maringá', uf: 'PR', entrega: true },
        ] });
        assert.strictEqual(r.cidade, 'Maringá/PR');
    });
});
