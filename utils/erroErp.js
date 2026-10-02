'use strict';

// Classifica a recusa do Firebird em "o dado está errado" contra "o ERP não
// está disponível". A diferença não é cosmética: 502 convida a integração a
// repetir, e repetir para sempre um cadastro que o banco nunca vai aceitar
// enche a fila do agente e nunca conserta nada.
//
// Os códigos abaixo foram capturados contra o ERP de produção, provocando
// cada recusa dentro de uma transação com rollback. Não são chute:
//
//   335544347  Validation error for column "PESSOAFISICA"."CODIGOCID", value "*** null ***"
//   335544466  Violation of FOREIGN KEY constraint "FK_PESSOAENDERECOS_CIDADES"
//   335544517  Exception 11, EX_INVALID_NAME, O campo (NOME da Pessoa) ficou vazio...
//   335544569  Dynamic SQL Error — truncamento de texto OU erro de SQL nosso
//
// O 335544569 é o único ambíguo: serve para "string right truncation", que é
// entrada grande demais, e para "Table unknown", que é defeito nosso. Por
// isso ele é o único que olha a mensagem.

const GDS_VALIDACAO = 335544347;   // NOT NULL de domínio e CHECK
const GDS_FK = 335544466;          // aponta para linha que não existe
const GDS_DUPLICADO = 335544349;   // duplicata em índice único
const GDS_CHAVE_UNICA = 335544665; // PRIMARY/UNIQUE KEY
const GDS_EXCECAO = 335544517;     // EXCEPTION levantada por gatilho
const GDS_SQL = 335544569;         // Dynamic SQL Error (ambíguo)

// Recusas de disponibilidade. Vale repetir: o dado pode estar perfeito.
const GDS_INDISPONIVEL = new Set([
    335544375, // unavailable database
    335544472, // "Your user name and password are not defined" — a recusa intermitente
    335544721, // network write error
    335544726, // network read error
    335544856, // connection shutdown
]);

// A mensagem também denuncia indisponibilidade, e em dois casos é o único
// sinal que chega: o wrapper de timeout e o obterConexao esgotado levantam
// Error comum, sem gdscode.
const INDISPONIVEL_POR_MENSAGEM = [
    /Erro ao conectar ao DB Firebird/i,
    /não respondeu em \d+ms/i,
    /Unable to allocate memory/i,   // servidor sem memória — visto em produção
    /connection (lost|rejected|shutdown)/i,
    /unavailable database/i,
    /shutdown in progress/i,
];

// Coluna do ERP -> campo do nosso contrato. Sem isso a integração receberia
// "PESSOAENDERECOS.CODIGOCID", que não existe no payload que ela mandou.
const CAMPO_POR_COLUNA = {
    'PESSOAENDERECOS.CODIGOCID': 'endereco.cidade',
    'PESSOAFISICA.CODIGOCID': 'endereco.cidade',
    'PESSOAENDERECOS.CEP': 'endereco.cep',
    'PESSOAENDERECOS.LOGRADOURO': 'endereco.logradouro',
    'PESSOAENDERECOS.NUMERO': 'endereco.numero',
    'PESSOAENDERECOS.BAIRRO': 'endereco.bairro',
    'PESSOAENDERECOS.COMPLEMENTO': 'endereco.complemento',
    'PESSOAS.NOME': 'nome',
    'PESSOAFISICA.CPF': 'cpf',
    'PESSOAFISICA.DATANASCIMENTO': 'nascimento',
    'PESSOAINTERNET.ENDERECO': 'email',
};

// Mensagem própria onde a do Firebird não serve para quem integra. O resto
// aproveita o texto do ERP, que nas exceções de gatilho vem em português e
// explica o problema melhor do que qualquer paráfrase nossa.
const MENSAGEM_POR_CAMPO = {
    'endereco.cidade': 'Cidade não identificada pelo CEP.',
};

function mensagem(erro) {
    return String(erro?.message ?? '');
}

function indisponivel(erro) {
    if (GDS_INDISPONIVEL.has(erro?.gdscode)) return true;
    const texto = `${mensagem(erro)} ${mensagem(erro?.causa)}`;
    return INDISPONIVEL_POR_MENSAGEM.some((r) => r.test(texto));
}

// "Validation error for column "PESSOAENDERECOS"."CODIGOCID", value ..."
function colunaDaValidacao(texto) {
    const m = texto.match(/column\s+"([^"]+)"\."([^"]+)"/i);
    return m ? `${m[1]}.${m[2]}` : null;
}

// "Violation of FOREIGN KEY constraint "FK_PESSOAENDERECOS_CIDADES" on table "PESSOAENDERECOS""
function colunaDaFk(texto) {
    const m = texto.match(/constraint\s+"FK_([A-Z0-9_]+)_([A-Z0-9]+)"/i);
    if (!m) return null;
    // FK_PESSOAENDERECOS_CIDADES -> a coluna é a que aponta para CIDADES.
    return m[2].startsWith('CIDADE') ? `${m[1]}.CODIGOCID` : null;
}

// Só o texto do Firebird, sem o rastro de "At trigger 'X' line: 17, col: 5",
// que não diz nada a quem integra.
function textoDaExcecao(texto) {
    const m = texto.match(/Exception\s+\d+,\s*[A-Z0-9_]+,\s*(.+?)(?:\s*,?\s*At trigger|$)/is);
    return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

function truncamento(texto) {
    const m = texto.match(/expected length (\d+), actual (\d+)/i);
    if (!m) return null;
    return `Texto maior do que o ERP aceita: o limite é ${m[1]} caracteres e veio ${m[2]}.`;
}

// Devolve { situacao, corpo } pronto para o res.status(...).json(...).
//
// 422 usa o MESMO envelope da validação de entrada — `erro` mais a lista
// `erros` de { campo, erro }. Quem integra trata uma forma só, venha a recusa
// da nossa validação ou do banco.
function classificarErroErp(erro) {
    const texto = mensagem(erro);

    // Situação já decidida antes de encostar no banco (400/404/409).
    if (erro?.situacao) {
        return { situacao: erro.situacao, corpo: { erro: texto } };
    }

    if (indisponivel(erro)) {
        return {
            situacao: 502,
            corpo: { erro: 'O ERP não respondeu. Nada foi alterado — pode tentar de novo.' },
        };
    }

    // Codificação inválida na entrada: é dado ruim, não ERP fora do ar.
    if (/transliterate/i.test(texto)) {
        return {
            situacao: 400,
            corpo: { erro: 'O texto tem caractere que o ERP não aceita. Envie em UTF-8.' },
        };
    }

    const invalido = (campo, mensagemErro) => ({
        situacao: 422,
        corpo: {
            erro: 'O cadastro não passou na validação do ERP. Nada foi alterado.',
            erros: [{ campo, erro: mensagemErro }],
        },
    });

    if (erro?.gdscode === GDS_VALIDACAO || erro?.gdscode === GDS_FK) {
        const coluna = erro.gdscode === GDS_VALIDACAO
            ? colunaDaValidacao(texto)
            : colunaDaFk(texto);
        const campo = CAMPO_POR_COLUNA[coluna] ?? 'corpo';
        return invalido(
            campo,
            MENSAGEM_POR_CAMPO[campo]
                ?? `O ERP recusou o valor de ${coluna ?? 'um dos campos'}.`
        );
    }

    if (erro?.gdscode === GDS_EXCECAO) {
        return invalido('corpo', textoDaExcecao(texto) ?? 'O ERP recusou a alteração.');
    }

    if (erro?.gdscode === GDS_DUPLICADO || erro?.gdscode === GDS_CHAVE_UNICA) {
        // O ERP tem UNQ_PESSOAFISICA_CPF: o mesmo CPF não pode estar em dois
        // cadastros. Acontece de verdade — a base tem gente repetida, com
        // 1.405 telefones compartilhados por 3.036 pessoas. Dizer "valor
        // duplicado" deixaria o agente sem saber o que fazer; dizendo que é
        // o CPF, ele pode consultar por CPF e seguir pelo cadastro existente.
        if (/CPF/i.test(texto)) {
            return invalido(
                'cpf',
                'Este CPF já está em outro cadastro. Consulte pelo CPF e use o cadastro que já existe.'
            );
        }
        return invalido('corpo', 'O ERP já tem um cadastro com esse valor.');
    }

    if (erro?.gdscode === GDS_SQL) {
        const corte = truncamento(texto);
        // Sem "expected length" não é truncamento: é SQL inválido, defeito
        // nosso. Chamar isso de 502 mandaria a integração repetir um erro
        // que só um deploy conserta.
        if (corte) return invalido('corpo', corte);
        return {
            situacao: 500,
            corpo: { erro: 'Erro interno ao gravar no ERP. Nada foi alterado.' },
        };
    }

    // Desconhecido: nem dado ruim comprovado, nem indisponibilidade
    // comprovada. 500 é a resposta honesta — e, ao contrário do 502, não
    // sugere que repetir resolve.
    return {
        situacao: 500,
        corpo: { erro: 'Erro inesperado ao gravar no ERP. Nada foi alterado.' },
    };
}

module.exports = {
    classificarErroErp,
    CAMPO_POR_COLUNA,
    MENSAGEM_POR_CAMPO,
};
