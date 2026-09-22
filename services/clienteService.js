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
