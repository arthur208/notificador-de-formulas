const { test, describe } = require('node:test');
const assert = require('node:assert');
const { classificarErroErp } = require('../utils/erroErp');

// Os erros abaixo são os reais do ERP de produção, capturados provocando cada
// recusa dentro de uma transação com rollback. Copiados literalmente: é a
// mensagem e o gdscode que o Firebird manda.
const erroFb = (gdscode, message) => Object.assign(new Error(message), { gdscode });

const VALIDACAO_PESSOAFISICA = erroFb(
    335544347,
    'Validation error for column "PESSOAFISICA"."CODIGOCID", value "*** null ***"'
);
const VALIDACAO_ENDERECO = erroFb(
    335544347,
    'Validation error for column "PESSOAENDERECOS"."CODIGOCID", value "*** null ***"'
);
const FK_CIDADES = erroFb(
    335544466,
    'Violation of FOREIGN KEY constraint "FK_PESSOAENDERECOS_CIDADES" on table "PESSOAENDERECOS", Foreign key reference target does not exist, Problematic key value'
);
const TRUNCAMENTO = erroFb(
    335544569,
    'Dynamic SQL Error, SQL error code = -303, Arithmetic exception, numeric overflow, or string truncation, string right truncation, expected length 40, actual 200'
);
const TABELA_DESCONHECIDA = erroFb(
    335544569,
    'Dynamic SQL Error, SQL error code = -204, Table unknown, TABELA_QUE_NAO_EXISTE, At line 1, column 8'
);
const GATILHO = erroFb(
    335544517,
    "Exception 11, EX_INVALID_NAME, O campo (NOME da Pessoa) ficou vazio ou inválido após a sanitização/normalização !, At trigger 'PESSOAS_BU' line: 17, col: 5"
);

describe('regra do banco vira 422, nunca 502', () => {
    // O defeito que motivou tudo: 502 convidava a integração a repetir um
    // INSERT que o banco nunca ia aceitar.
    test('CODIGOCID nulo em PESSOAFISICA', () => {
        const r = classificarErroErp(VALIDACAO_PESSOAFISICA);
        assert.strictEqual(r.situacao, 422);
        assert.deepStrictEqual(r.corpo.erros, [
            { campo: 'endereco.cidade', erro: 'Cidade não identificada pelo CEP.' },
        ]);
    });

    test('CODIGOCID nulo em PESSOAENDERECOS', () => {
        const r = classificarErroErp(VALIDACAO_ENDERECO);
        assert.strictEqual(r.situacao, 422);
        assert.strictEqual(r.corpo.erros[0].campo, 'endereco.cidade');
    });

    test('FK de cidade inexistente também aponta o campo cidade', () => {
        const r = classificarErroErp(FK_CIDADES);
        assert.strictEqual(r.situacao, 422);
        assert.strictEqual(r.corpo.erros[0].campo, 'endereco.cidade');
    });

    test('truncamento diz o limite e o que veio', () => {
        const r = classificarErroErp(TRUNCAMENTO);
        assert.strictEqual(r.situacao, 422);
        assert.match(r.corpo.erros[0].erro, /limite é 40 caracteres e veio 200/);
    });

    // A mensagem do gatilho é em português e explica melhor do que qualquer
    // paráfrase nossa; o rastro "At trigger ... line: 17" é que não serve.
    test('exceção de gatilho aproveita o texto do ERP, sem o rastro', () => {
        const r = classificarErroErp(GATILHO);
        assert.strictEqual(r.situacao, 422);
        assert.match(r.corpo.erros[0].erro, /NOME da Pessoa/);
        assert.ok(!/At trigger/.test(r.corpo.erros[0].erro), 'vazou o rastro do gatilho');
        assert.ok(!/line: 17/.test(r.corpo.erros[0].erro));
    });

    test('o 422 usa o mesmo envelope da validação de entrada', () => {
        const r = classificarErroErp(VALIDACAO_ENDERECO);
        assert.deepStrictEqual(Object.keys(r.corpo).sort(), ['erro', 'erros']);
        assert.ok(Array.isArray(r.corpo.erros));
        assert.deepStrictEqual(Object.keys(r.corpo.erros[0]).sort(), ['campo', 'erro']);
    });
});

describe('502 fica reservado para ERP indisponível', () => {
    // Levantados pelo nosso próprio código, sem gdscode nenhum.
    test('obterConexao esgotado', () => {
        assert.strictEqual(
            classificarErroErp(new Error('Erro ao conectar ao DB Firebird.')).situacao,
            502
        );
    });

    test('timeout do wrapper de consulta', () => {
        assert.strictEqual(
            classificarErroErp(new Error('Firebird não respondeu em 15000ms.')).situacao,
            502
        );
    });

    // Visto em produção durante esta investigação: o servidor fica sem
    // memória e recusa a conexão.
    test('servidor sem memória', () => {
        assert.strictEqual(
            classificarErroErp(new Error('Unable to allocate memory from operating system')).situacao,
            502
        );
    });

    test('a recusa intermitente de credencial', () => {
        const erro = erroFb(335544472, 'Your user name and password are not defined.');
        assert.strictEqual(classificarErroErp(erro).situacao, 502);
    });

    // obterConexao embrulha a causa original em .causa.
    test('reconhece a indisponibilidade na causa embrulhada', () => {
        const erro = Object.assign(new Error('Falhou ao gravar.'), {
            causa: new Error('Unable to allocate memory from operating system'),
        });
        assert.strictEqual(classificarErroErp(erro).situacao, 502);
    });

    test('o 502 não vaza mensagem do banco', () => {
        const r = classificarErroErp(new Error('Erro ao conectar ao DB Firebird.'));
        assert.deepStrictEqual(Object.keys(r.corpo), ['erro']);
        assert.ok(!/Firebird/.test(r.corpo.erro), 'vazou o nome do banco');
    });
});

describe('o que não dá para afirmar não vira 502', () => {
    // Mesmo gdscode do truncamento, mas é SQL inválido nosso: só deploy
    // conserta, e 502 mandaria a integração repetir para sempre.
    test('SQL quebrado nosso é 500', () => {
        const r = classificarErroErp(TABELA_DESCONHECIDA);
        assert.strictEqual(r.situacao, 500);
        assert.ok(!r.corpo.erros, 'não é erro de campo do cliente');
    });

    test('erro desconhecido é 500, não 502', () => {
        assert.strictEqual(classificarErroErp(new Error('vai saber')).situacao, 500);
    });

    test('o 500 não vaza detalhe interno', () => {
        const r = classificarErroErp(TABELA_DESCONHECIDA);
        assert.ok(!/TABELA_QUE_NAO_EXISTE/.test(JSON.stringify(r.corpo)), 'vazou nome de tabela');
        assert.ok(!/SQL error code/.test(JSON.stringify(r.corpo)));
    });
});

describe('situações já decididas antes do banco', () => {
    for (const situacao of [400, 404, 409]) {
        test(`${situacao} passa adiante com a mensagem`, () => {
            const erro = Object.assign(new Error('Cliente não encontrado.'), { situacao });
            const r = classificarErroErp(erro);
            assert.strictEqual(r.situacao, situacao);
            assert.strictEqual(r.corpo.erro, 'Cliente não encontrado.');
        });
    }

    test('codificação inválida continua 400', () => {
        const erro = erroFb(335544565, 'Cannot transliterate character between character sets');
        assert.strictEqual(classificarErroErp(erro).situacao, 400);
    });
});

// O ERP tem UNQ_PESSOAFISICA_CPF, capturado ao tentar gravar um CPF que já
// pertencia a outro cadastro. Acontece de verdade: a base tem gente repetida.
describe('CPF já usado em outro cadastro', () => {
    const DUPLICADO = Object.assign(
        new Error('Violation of PRIMARY or UNIQUE KEY constraint "UNQ_PESSOAFISICA_CPF" on table "PESSOAFISICA", Problematic key value is ("CPF" = \'03721801911\')'),
        { gdscode: 335544665 }
    );

    test('é 422 e aponta o campo cpf', () => {
        const r = classificarErroErp(DUPLICADO);
        assert.strictEqual(r.situacao, 422);
        assert.strictEqual(r.corpo.erros[0].campo, 'cpf');
    });

    // "Valor duplicado" deixaria o agente sem saída; dizendo que é o CPF, ele
    // consulta por CPF e segue pelo cadastro que já existe.
    test('a mensagem diz o que fazer', () => {
        const r = classificarErroErp(DUPLICADO);
        assert.match(r.corpo.erros[0].erro, /Consulte pelo CPF/);
    });

    test('não devolve o CPF de volta na resposta', () => {
        const r = classificarErroErp(DUPLICADO);
        assert.ok(!JSON.stringify(r.corpo).includes('03721801911'), 'vazou o CPF');
    });

    test('duplicata que não é de CPF fica genérica', () => {
        const outro = Object.assign(
            new Error('Violation of PRIMARY or UNIQUE KEY constraint "PK_PESSOAENDERECOS" on table "PESSOAENDERECOS"'),
            { gdscode: 335544665 }
        );
        assert.strictEqual(classificarErroErp(outro).corpo.erros[0].campo, 'corpo');
    });
});
