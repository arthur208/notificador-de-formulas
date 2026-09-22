const { queryFb } = require('./firebirdService');
const { decodeFBString, toTitleCase } = require('../utils/helpers');
const { variantesDeTelefone, soDigitos } = require('../utils/telefone');
const { listaInteirosSegura } = require('../utils/lotes');
const { limpar: semPreenchimento } = require('../utils/endereco');

// O ERP guarda telefone com espaço e parêntese no meio — "44 34255793",
// "44  4231513". Comparar o texto cru nunca casa, então a limpeza acontece
// dos dois lados: aqui no SQL e em utils/telefone.js na entrada.
function limpo(coluna) {
    return `REPLACE(REPLACE(REPLACE(${coluna}, ' ', ''), '(', ''), ')', '')`;
}

// O banco é CHARACTER SET NONE e o driver assume UTF8. Sem o CAST, nome com
// acento volta com U+FFFD — foi o que corrompeu 258 mensagens em produção.
function texto(coluna, tamanho = 120) {
    return `CAST(${coluna} AS VARCHAR(${tamanho}) CHARACTER SET WIN1252)`;
}

function limparValor(valor) {
    const s = decodeFBString(valor);
    return s && s.trim() !== '' ? s.trim() : null;
}

// O ERP preenche campo vazio de endereço com fachada: "....." no logradouro,
// "." no bairro, "00000" no número. Devolver isso como se fosse endereço
// seria pior que devolver nulo — foi o que já saiu em 544 mensagens.
function enderecoOuNulo(valor) {
    const s = semPreenchimento(decodeFBString(valor));
    return s === '' ? null : s;
}

// O ERP preenche campo vazio com zeros em vez de deixar nulo.
function numeroOuNulo(valor) {
    const digitos = soDigitos(valor);
    return digitos && !/^0+$/.test(digitos) ? digitos : null;
}

// DATAALTERACAO guarda a data e HORAALTERACAO a hora, em colunas separadas.
// Sozinha, a data diz pouco: várias alterações no mesmo dia ficam iguais.
function juntarDataHora(data, hora) {
    const dia = paraIso(data);
    if (!dia) return null;
    if (!hora) return dia;
    const h = hora instanceof Date ? hora : new Date(hora);
    if (Number.isNaN(h.getTime())) return dia;
    return `${dia}T${h.toISOString().slice(11, 19)}`;
}

function paraIso(data) {
    if (!data) return null;
    const d = data instanceof Date ? data : new Date(data);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const ROTULO_FONE = {
    FONECEL: 'celular',
    FONERES: 'residencial',
    FONECOM: 'comercial',
    FONEREC: 'recado',
};

async function codigosPorTelefone(telefone) {
    const variantes = variantesDeTelefone(telefone);
    if (variantes.length === 0) return [];

    // Vem de variantesDeTelefone, que só devolve dígitos — mas a lista entra
    // literal no SQL, então a garantia é explícita e não por confiança.
    const lista = variantes.map((v) => `'${soDigitos(v)}'`).join(',');

    const linhas = await queryFb(
        `SELECT DISTINCT F.CODIGOPES
           FROM PESSOASFONE F
          WHERE ${limpo('F.FONERES')} IN (${lista})
             OR ${limpo('F.FONECEL')} IN (${lista})
             OR ${limpo('F.FONECOM')} IN (${lista})
             OR ${limpo('F.FONEREC')} IN (${lista})`,
        []
    );
    return linhas.map((l) => Number(l.CODIGOPES));
}

async function codigosPorCpf(cpf) {
    const digitos = soDigitos(cpf);
    if (digitos.length !== 11) return [];

    const linhas = await queryFb(
        `SELECT X.CODIGOPES FROM PESSOAFISICA X WHERE ${limpo('X.CPF')} = ?`,
        [digitos]
    );
    return linhas.map((l) => Number(l.CODIGOPES));
}

// Monta o cadastro completo de uma lista de pessoas. Quatro consultas no
// total, independente de quantas pessoas — telefone repetido em família faz
// uma busca devolver mais de uma.
async function montarCadastro(codigos) {
    if (codigos.length === 0) return [];
    const lista = listaInteirosSegura(codigos);

    const [pessoas, fones, enderecos, emails] = await Promise.all([
        queryFb(
            `SELECT P.CODIGOPES, ${texto('P.NOME', 40)} AS NOME, P.DATACAD, P.STATUS,
                    P.DATAALTERACAO, P.HORAALTERACAO,
                    ${limpo('X.CPF')} AS CPF, X.DATANASCIMENTO, X.SEXO
               FROM PESSOAS P
               LEFT JOIN PESSOAFISICA X ON X.CODIGOPES = P.CODIGOPES
              WHERE P.CODIGOPES IN (${lista})`, []
        ),
        queryFb(
            `SELECT CODIGOPES, ${limpo('FONECEL')} AS FONECEL, ${limpo('FONERES')} AS FONERES,
                    ${limpo('FONECOM')} AS FONECOM, ${limpo('FONEREC')} AS FONEREC
               FROM PESSOASFONE WHERE CODIGOPES IN (${lista})`, []
        ),
        queryFb(
            `SELECT E.CODIGOPES, ${texto('E.LOGRADOURO', 40)} AS LOGRADOURO, E.NUMERO,
                    ${texto('E.BAIRRO', 20)} AS BAIRRO, E.CEP, ${texto('E.COMPLEMENTO', 40)} AS COMPLEMENTO,
                    E.ENT, E.CODIGOCID, ${texto('C.NOMECID', 60)} AS CIDADE, C.UFCID
               FROM PESSOAENDERECOS E
               LEFT JOIN CIDADES C ON C.CODIGOCID = E.CODIGOCID
              WHERE E.CODIGOPES IN (${lista})`, []
        ),
        queryFb(
            `SELECT CODIGOPES, ${texto('ENDERECO', 50)} AS EMAIL
               FROM PESSOAINTERNET WHERE CODIGOPES IN (${lista})`, []
        ),
    ]);

    const porPessoa = (linhas) => {
        const mapa = new Map();
        for (const l of linhas) {
            const k = Number(l.CODIGOPES);
            if (!mapa.has(k)) mapa.set(k, []);
            mapa.get(k).push(l);
        }
        return mapa;
    };

    const mFones = porPessoa(fones);
    const mEnderecos = porPessoa(enderecos);
    const mEmails = porPessoa(emails);

    return pessoas.map((p) => {
        const codigo = Number(p.CODIGOPES);

        const telefones = [];
        for (const linha of mFones.get(codigo) ?? []) {
            for (const [campo, rotulo] of Object.entries(ROTULO_FONE)) {
                const numero = numeroOuNulo(linha[campo]);
                // O mesmo número aparece em dois campos com frequência.
                if (numero && !telefones.some((t) => t.numero === numero)) {
                    telefones.push({ tipo: rotulo, numero });
                }
            }
        }

        return {
            codigoPessoa: codigo,
            nome: toTitleCase(limparValor(p.NOME)) || null,
            cpf: numeroOuNulo(p.CPF),
            nascimento: paraIso(p.DATANASCIMENTO),
            sexo: limparValor(p.SEXO),
            ativo: limparValor(p.STATUS) !== 'I',
            cadastradoEm: paraIso(p.DATACAD),
            // O ERP mantém em PESSOAS, e qualquer alteração passa por lá:
            // mexer no endereço dispara PESSOAENDERECOS_AIU, que faz UPDATE
            // em PESSOAS. Medido: a gravação desta API move o horário.
            atualizadoEm: juntarDataHora(p.DATAALTERACAO, p.HORAALTERACAO),
            email: limparValor((mEmails.get(codigo) ?? [])[0]?.EMAIL),
            telefones,
            enderecos: (mEnderecos.get(codigo) ?? []).map((e) => ({
                logradouro: toTitleCase(enderecoOuNulo(e.LOGRADOURO)) || null,
                numero: enderecoOuNulo(e.NUMERO),
                complemento: enderecoOuNulo(e.COMPLEMENTO),
                bairro: toTitleCase(enderecoOuNulo(e.BAIRRO)) || null,
                cep: numeroOuNulo(e.CEP),
                cidade: toTitleCase(limparValor(e.CIDADE)) || null,
                uf: limparValor(e.UFCID),
                codigoCidade: e.CODIGOCID === null ? null : Number(e.CODIGOCID),
                entrega: limparValor(e.ENT) !== 'N',
            })),
        };
    });
}

async function buscarPorTelefone(telefone) {
    return montarCadastro(await codigosPorTelefone(telefone));
}

async function buscarPorCpf(cpf) {
    return montarCadastro(await codigosPorCpf(cpf));
}

module.exports = { buscarPorTelefone, buscarPorCpf, montarCadastro };

// --------------------------------------------------------------------------
// Gravação no ERP
// --------------------------------------------------------------------------
//
// Escrever aqui não é como escrever no nosso Mongo: o SmartPharmacy é dono
// destes dados e defende as regras dele por gatilho. São 76 nessas tabelas —
// PESSOAS_BU sanitiza o nome e lança exceção se ele ficar vazio,
// PESSOAENDERECOS_BIU troca logradouro e bairro vazios por "." e CEP inválido
// por "00000000", e PESSOAS_LOG registra a alteração na auditoria do ERP.
//
// Por isso duas decisões:
//
// 1. Tudo numa transação. Uma falha no meio deixaria o cadastro pela metade,
//    com telefone novo e endereço velho.
// 2. O retorno relê do banco depois de gravar. Os gatilhos alteram o que foi
//    enviado, e devolver o que mandamos seria mentir sobre o que ficou lá.

const Firebird = require('node-firebird');
const { fbPool } = require('../config/db');

// O texto entra convertido, espelhando o CAST da leitura. Sem isto o acento
// é gravado em UTF-8 numa coluna CHARACTER SET NONE, e o ERP passa a exibir
// "AcentuaÃ§Ã£o" para quem atende no balcão.
function entrada(tamanho) {
    return `CAST(? AS VARCHAR(${tamanho}) CHARACTER SET WIN1252)`;
}

function emTransacao(trabalho) {
    return new Promise((resolve, reject) => {
        fbPool.get((erroPool, db) => {
            if (erroPool) return reject(new Error('Erro ao conectar ao DB Firebird.'));

            db.transaction(Firebird.ISOLATION_READ_COMMITTED, (erroTr, tr) => {
                if (erroTr) { db.detach(); return reject(erroTr); }

                const rodar = (sql, params) => new Promise((ok, falhou) => {
                    tr.query(sql, params, (e, r) => (e ? falhou(e) : ok(r)));
                });

                trabalho(rodar)
                    .then((valor) => tr.commit((e) => {
                        db.detach();
                        return e ? reject(e) : resolve(valor);
                    }))
                    .catch((erro) => tr.rollback(() => {
                        db.detach();
                        reject(erro);
                    }));
            });
        });
    });
}

const COLUNA_FONE = {
    celular: 'FONECEL',
    residencial: 'FONERES',
    comercial: 'FONECOM',
    recado: 'FONEREC',
};

async function atualizarCadastro(codigoPessoa, dados) {
    const codigo = Number(codigoPessoa);
    if (!Number.isInteger(codigo) || codigo <= 0) {
        throw Object.assign(new Error('Código de pessoa inválido.'), { situacao: 400 });
    }

    await emTransacao(async (rodar) => {
        // A pessoa precisa existir e ser cliente. Sem esta guarda, a
        // integração editaria médico, fornecedor ou funcionário.
        const pessoa = await rodar('SELECT TIPO FROM PESSOAS WHERE CODIGOPES = ?', [codigo]);
        if (pessoa.length === 0) {
            throw Object.assign(new Error('Cliente não encontrado.'), { situacao: 404 });
        }
        if (decodeFBString(pessoa[0].TIPO)?.trim() !== 'CL') {
            throw Object.assign(
                new Error('Este cadastro não é de cliente e não pode ser alterado por aqui.'),
                { situacao: 409 }
            );
        }

        if (dados.nome !== undefined) {
            await rodar(`UPDATE PESSOAS SET NOME = ${entrada(40)} WHERE CODIGOPES = ?`,
                [String(dados.nome).trim(), codigo]);
        }

        if (dados.cpf !== undefined || dados.nascimento !== undefined) {
            const existe = await rodar('SELECT CODIGOPES FROM PESSOAFISICA WHERE CODIGOPES = ?', [codigo]);
            if (existe.length === 0) {
                await rodar('INSERT INTO PESSOAFISICA (CODIGOPES) VALUES (?)', [codigo]);
            }
            if (dados.cpf !== undefined) {
                await rodar('UPDATE PESSOAFISICA SET CPF = ? WHERE CODIGOPES = ?',
                    [dados.cpf === null ? null : soDigitos(dados.cpf), codigo]);
            }
            if (dados.nascimento !== undefined) {
                await rodar('UPDATE PESSOAFISICA SET DATANASCIMENTO = ? WHERE CODIGOPES = ?',
                    [dados.nascimento === null ? null : dados.nascimento, codigo]);
            }
        }

        if (dados.email !== undefined) {
            const valor = dados.email === null ? null : String(dados.email).trim();

            // PESSOAINTERNET.ENDERECO é NOT NULL: apagar o e-mail significa
            // remover a linha, não gravar nulo nela. Tentar o nulo devolve
            // "Validation error for column" e derruba a transação inteira —
            // levando junto o endereço que já tinha sido gravado.
            if (valor === null || valor === '') {
                await rodar('DELETE FROM PESSOAINTERNET WHERE CODIGOPES = ?', [codigo]);
            } else {
                const existe = await rodar('SELECT CODIGONET FROM PESSOAINTERNET WHERE CODIGOPES = ?', [codigo]);
                if (existe.length === 0) {
                    await rodar(
                        `INSERT INTO PESSOAINTERNET (CODIGONET, CODIGOPES, ENDERECO)
                         VALUES (GEN_ID(GEN_PESSOAINTERNET, 1), ?, ${entrada(50)})`,
                        [codigo, valor]
                    );
                } else {
                    await rodar(`UPDATE PESSOAINTERNET SET ENDERECO = ${entrada(50)} WHERE CODIGOPES = ?`,
                        [valor, codigo]);
                }
            }
        }

        if (Array.isArray(dados.telefones) && dados.telefones.length > 0) {
            const existe = await rodar('SELECT CODIGOFONE FROM PESSOASFONE WHERE CODIGOPES = ?', [codigo]);
            if (existe.length === 0) {
                await rodar(
                    'INSERT INTO PESSOASFONE (CODIGOFONE, CODIGOPES) VALUES (GEN_ID(GEN_PESSOASFONE, 1), ?)',
                    [codigo]
                );
            }
            for (const { tipo, numero } of dados.telefones) {
                await rodar(
                    `UPDATE PESSOASFONE SET ${COLUNA_FONE[tipo]} = ? WHERE CODIGOPES = ?`,
                    [numero === null ? null : soDigitos(numero), codigo]
                );
            }
        }

        if (dados.endereco) {
            const e = dados.endereco;
            const existe = await rodar('SELECT CODIGOPE FROM PESSOAENDERECOS WHERE CODIGOPES = ?', [codigo]);
            if (existe.length === 0) {
                await rodar(
                    'INSERT INTO PESSOAENDERECOS (CODIGOPE, CODIGOPES) VALUES (GEN_ID(GEN_PESSOAENDERECOS, 1), ?)',
                    [codigo]
                );
            }
            const partes = [];
            const valores = [];
            const por = (campo, coluna, tamanho, transformar = (v) => String(v).trim()) => {
                if (e[campo] === undefined) return;
                partes.push(`${coluna} = ${tamanho ? entrada(tamanho) : '?'}`);
                valores.push(e[campo] === null ? null : transformar(e[campo]));
            };
            por('logradouro', 'LOGRADOURO', 40);
            por('numero', 'NUMERO', 5);
            por('complemento', 'COMPLEMENTO', 40);
            por('bairro', 'BAIRRO', 20);
            por('cep', 'CEP', null, (v) => soDigitos(v));
            por('codigoCidade', 'CODIGOCID', null, (v) => Number(v));

            if (partes.length > 0) {
                valores.push(codigo);
                await rodar(
                    `UPDATE PESSOAENDERECOS SET ${partes.join(', ')} WHERE CODIGOPES = ?`,
                    valores
                );
            }
        }
    });

    // Relê fora da transação: é o estado já com os gatilhos aplicados.
    const [atualizado] = await montarCadastro([codigo]);
    return atualizado;
}

module.exports.atualizarCadastro = atualizarCadastro;
