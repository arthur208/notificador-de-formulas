const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
    resumir, resumirConsulta, montarFaltandoTexto,
    vazio, nascimentoVazio, juntarNomes,
} = require('../utils/resumoCliente');

const cliente = (extra = {}) => ({
    codigoPessoa: 101,
    nome: 'Maria da Silva',
    cpf: '03721801911',
    nascimento: '1980-10-20',
    email: 'maria@exemplo.com',
    telefones: [{ tipo: 'celular', numero: '44991135801' }],
    enderecos: [{
        logradouro: 'Rua Curitiba', numero: '103', bairro: 'Centro',
        cep: '87900000', cidade: 'Loanda', uf: 'PR', entrega: true,
    }],
    ...extra,
});

const comEndereco = (mudanca) => cliente({
    enderecos: [{ ...cliente().enderecos[0], ...mudanca }],
});

describe('o que conta como vazio', () => {
    test('nulo, vazio e só espaço', () => {
        for (const v of [null, undefined, '', '   ']) assert.ok(vazio(v), JSON.stringify(v));
    });

    // O ERP grava fachada por gatilho, não por erro de digitação.
    test('só pontos e só zeros', () => {
        for (const v of ['.', '..', '.....', '0', '00000', '00000000']) {
            assert.ok(vazio(v), JSON.stringify(v));
        }
    });

    test('valor de verdade não é vazio', () => {
        for (const v of ['Centro', '103', 0, '87900000']) {
            assert.ok(!vazio(v), JSON.stringify(v));
        }
    });

    // 1899-12-30 é o zero do Delphi: chega como data válida e passaria por
    // qualquer checagem de preenchimento.
    test('nascimento: data zero do Delphi, antes de 1900 e futuro', () => {
        assert.ok(nascimentoVazio('1899-12-30'));
        assert.ok(nascimentoVazio('1899-12-30T00:00:00.000Z'));
        assert.ok(nascimentoVazio('1850-01-01'));
        assert.ok(nascimentoVazio(new Date(Date.now() + 86400000).toISOString().slice(0, 10)));
        assert.ok(!nascimentoVazio('1980-10-20'));
    });
});

describe('faltando, com a regra de vazio', () => {
    test('cadastro completo não falta nada', () => {
        assert.deepStrictEqual(resumir(cliente()).faltando, []);
    });

    test('bairro e cidade com ponto contam como faltando', () => {
        const r = resumir(comEndereco({ bairro: '.', cidade: '.' }));
        assert.ok(r.faltando.includes('bairro'));
        assert.ok(r.faltando.includes('cidade'));
    });

    test('CEP de zeros e CEP com 4 dígitos contam como faltando', () => {
        assert.ok(resumir(comEndereco({ cep: '00000000' })).faltando.includes('cep'));
        assert.ok(resumir(comEndereco({ cep: '8790' })).faltando.includes('cep'));
        assert.ok(!resumir(comEndereco({ cep: '87900000' })).faltando.includes('cep'));
    });

    test('CPF incompleto conta como faltando', () => {
        assert.ok(resumir(cliente({ cpf: '037218019' })).faltando.includes('cpf'));
    });

    test('nascimento na data zero conta como faltando', () => {
        assert.ok(resumir(cliente({ nascimento: '1899-12-30' })).faltando.includes('nascimento'));
    });
});

describe('faltandoTexto', () => {
    test('vazio quando não falta nada', () => {
        assert.strictEqual(resumir(cliente()).faltandoTexto, '');
    });

    test('só e-mail faltando', () => {
        assert.strictEqual(resumir(cliente({ email: null })).faltandoTexto, '📧 E-mail');
    });

    // Pedir rua, número, bairro, CEP e cidade em cinco linhas seria conversa
    // ruim no WhatsApp.
    test('vários campos de endereço geram UMA linha só', () => {
        const r = resumir(comEndereco({ numero: null, bairro: '.', cep: '0000', cidade: null }));
        assert.strictEqual(r.faltandoTexto, '🏠 Endereço com número, bairro, CEP e cidade');
    });

    test('mantém a ordem dos campos', () => {
        const r = resumir(cliente({
            nascimento: null, email: null,
            enderecos: [{ ...cliente().enderecos[0], bairro: null, cep: null }],
        }));
        assert.strictEqual(
            r.faltandoTexto,
            '🎂 Data de nascimento\n🏠 Endereço com número, bairro, CEP e cidade\n📧 E-mail'
        );
    });

    // Quem chegou pelo WhatsApp já mandou o número.
    test('telefone não gera linha, mas continua em faltando', () => {
        const r = resumir(cliente({ telefones: [] }));
        assert.ok(r.faltando.includes('telefone'));
        assert.strictEqual(r.faltandoTexto, '');
        assert.strictEqual(r.completo, false);
    });

    test('a linha de endereço não se repete', () => {
        assert.strictEqual(
            montarFaltandoTexto(['logradouro', 'numero', 'bairro', 'cep', 'cidade']),
            '🏠 Endereço com número, bairro, CEP e cidade'
        );
    });
});

describe('situacao no primeiro nível', () => {
    test('SEM_CADASTRO quando não achou ninguém', () => {
        assert.deepStrictEqual(resumirConsulta([]), {
            situacao: 'SEM_CADASTRO',
            primeiroNome: '',
            codigoPessoa: null,
            faltandoTexto: '',
            nomesCadastros: '',
        });
    });

    test('COMPLETO com um cadastro sem pendência', () => {
        const r = resumirConsulta([resumir(cliente())]);
        assert.strictEqual(r.situacao, 'COMPLETO');
        assert.strictEqual(r.primeiroNome, 'Maria');
        assert.strictEqual(r.codigoPessoa, 101);
        assert.strictEqual(r.faltandoTexto, '');
    });

    test('INCOMPLETO com um cadastro com pendência', () => {
        const r = resumirConsulta([resumir(cliente({ email: null }))]);
        assert.strictEqual(r.situacao, 'INCOMPLETO');
        assert.strictEqual(r.faltandoTexto, '📧 E-mail');
    });

    // A diferença entre seguir o faltandoTexto e seguir o `completo`: sem
    // telefone, `completo` é false mas não há o que pedir ao cliente.
    test('sem telefone e o resto completo sai COMPLETO', () => {
        const resumo = resumir(cliente({ telefones: [] }));
        assert.strictEqual(resumo.completo, false, 'completo continua false');
        assert.ok(resumo.faltando.includes('telefone'));

        const r = resumirConsulta([resumo]);
        assert.strictEqual(r.situacao, 'COMPLETO');
        assert.strictEqual(r.faltandoTexto, '');
    });

    test('o agente nunca recebe INCOMPLETO com texto vazio', () => {
        const casos = [cliente(), cliente({ telefones: [] }), cliente({ email: null })];
        for (const c of casos) {
            const r = resumirConsulta([resumir(c)]);
            if (r.situacao === 'INCOMPLETO') assert.notStrictEqual(r.faltandoTexto, '');
        }
    });

    describe('MULTIPLOS', () => {
        const varios = [
            resumir(cliente({ codigoPessoa: 101, nome: 'Maria da Silva' })),
            resumir(cliente({ codigoPessoa: 102, nome: 'João Souza', email: null })),
            resumir(cliente({ codigoPessoa: 103, nome: 'José Lima' })),
        ];

        test('não escolhe por ninguém', () => {
            const r = resumirConsulta(varios);
            assert.strictEqual(r.situacao, 'MULTIPLOS');
            assert.strictEqual(r.codigoPessoa, null);
            assert.strictEqual(r.primeiroNome, '');
            assert.strictEqual(r.faltandoTexto, '');
        });

        test('nomesCadastros com vírgula e "ou" antes do último', () => {
            assert.strictEqual(resumirConsulta(varios).nomesCadastros, 'Maria, João ou José');
        });

        test('cada item mantém o próprio faltandoTexto', () => {
            assert.strictEqual(varios[0].faltandoTexto, '');
            assert.strictEqual(varios[1].faltandoTexto, '📧 E-mail');
            assert.strictEqual(varios[2].faltandoTexto, '');
        });

        test('cadastro sem nome fica de fora da lista de nomes', () => {
            const comAnonimo = [...varios, resumir(cliente({ codigoPessoa: 104, nome: null }))];
            assert.strictEqual(resumirConsulta(comAnonimo).nomesCadastros, 'Maria, João ou José');
        });

        test('dois cadastros usam "ou" sem vírgula', () => {
            assert.strictEqual(juntarNomes(['Maria', 'João']), 'Maria ou João');
        });
    });
});

// Outras integrações dependem do formato atual.
describe('regressão: o que já existia não mudou', () => {
    test('todos os campos antigos continuam com os mesmos valores', () => {
        const r = resumir(cliente({ atualizadoEm: '2026-09-22T19:24:08' }));
        assert.strictEqual(r.codigoPessoa, 101);
        assert.strictEqual(r.nome, 'Maria da Silva');
        assert.strictEqual(r.primeiroNome, 'Maria');
        assert.strictEqual(r.cpfMascarado, '***.218.019-**');
        assert.strictEqual(r.cidade, 'Loanda/PR');
        assert.strictEqual(r.atualizadoEm, '2026-09-22T19:24:08');
        assert.strictEqual(r.completo, true);
        assert.deepStrictEqual(r.faltando, []);
    });

    test('nada foi removido nem renomeado', () => {
        const chaves = Object.keys(resumir(cliente())).sort();
        assert.deepStrictEqual(chaves, [
            'atualizadoEm', 'cidade', 'codigoPessoa', 'completo',
            'cpfMascarado', 'faltando', 'faltandoTexto', 'nome', 'primeiroNome',
        ]);
    });

    test('continua sem vazar dado cru', () => {
        const texto = JSON.stringify(resumir(cliente()));
        const crus = ['03721801911', '44991135801', 'Rua Curitiba', 'maria@exemplo.com', '1980-10-20'];
        for (const cru of crus) assert.ok(!texto.includes(cru), `vazou ${cru}`);
    });
});
