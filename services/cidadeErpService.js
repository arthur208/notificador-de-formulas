'use strict';

// Traduz cidade/UF/IBGE no CODIGOCID que o ERP exige.
//
// O ERP NÃO TEM tabela de CEP. CIDADES é CODIGOCID, NOMECID, UFCID,
// COD_MUNICIPIOIBGE e campos de sincronização — nada de CEP, nada de faixa de
// CEP. O CEP só existe solto nas linhas de endereço. Então a ponte CEP->cidade
// é obrigatoriamente externa (services/cepService.js), e o que chega aqui já
// é cidade resolvida.
//
// COD_MUNICIPIOIBGE está preenchido nas 5.651 linhas e é a chave boa. Mas não
// é única: 26 códigos IBGE aparecem repetidos, cobrindo 60 linhas, e 52 linhas
// têm '0000000'. As duplicatas não são equivalentes — são lixo acumulado:
//
//   IBGE 4115200    113 MARINGA/PR    usada em 792 endereços   <- a de verdade
//                   114 MARINGA/PR    12
//                   217 MARINGA/PR    19
//                  5798 MARINGÁ/PR    3     <- sincronização AWS
//                  5808 MARINGÃ /PR   3     <- UTF-8 lido como latin1
//   IBGE 3550308    160 SAO PAULO/SP  372   <- a de verdade
//                  5803 ITAQUERA/SP   2     <- bairro cadastrado como cidade
//
// O desempate é por uso em PESSOAENDERECOS. Testei o atalho "menor CODIGOCID"
// nos 26 grupos: acerta em 24 e erra em 2 (EMBU/EMBU DAS ARTES e
// SAO BERNARDO DO CAMPO), então não serve. Contar usos custa ~30ms e roda
// sobre no máximo 5 linhas, porque o filtro por IBGE vem primeiro.
//
// Esta camada NUNCA cria linha em CIDADES. Inserir cidade a partir de resposta
// de API de fora encheria a tabela do ERP de duplicata — exatamente o lixo
// acima, que alguém já fez uma vez.

const { queryFb } = require('./firebirdService');

// '0000000' é o enchimento do ERP para "não sei o IBGE": casar por ele
// juntaria 52 cidades sem relação nenhuma, inclusive a cidade 6, cujo nome
// é literalmente ".".
const IBGE_VAZIO = '0000000';

const texto = (coluna, tamanho) =>
    `CAST(${coluna} AS VARCHAR(${tamanho}) CHARACTER SET WIN1252)`;

// Quantos endereços usam cada candidata. Subconsulta correlacionada é lenta
// neste banco em tabela grande, mas aqui ela roda sobre o punhado de linhas
// que o WHERE já selecionou.
const USOS = '(SELECT COUNT(*) FROM PESSOAENDERECOS E WHERE E.CODIGOCID = C.CODIGOCID)';

// Acentuação, caixa e pontuação não podem decidir a comparação: o ERP tem
// "SAO PAULO", "SãO PAULO" e "MARINGÃ " na mesma tabela.
function normalizar(nome) {
    return String(nome ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

// Mais usada primeiro; empatando, o menor código, que é estável entre
// chamadas. Sem o segundo critério, duas candidatas com o mesmo uso
// alternariam conforme a ordem que o banco devolvesse.
function escolher(linhas) {
    const ordenadas = [...linhas].sort((a, b) => {
        const diferenca = Number(b.USOS) - Number(a.USOS);
        return diferenca !== 0 ? diferenca : Number(a.CODIGOCID) - Number(b.CODIGOCID);
    });
    return ordenadas[0] ?? null;
}

async function porIbge(ibge) {
    if (!ibge || ibge === IBGE_VAZIO) return null;
    const linhas = await queryFb(
        `SELECT C.CODIGOCID, ${texto('C.NOMECID', 30)} AS NOMECID, C.UFCID, ${USOS} AS USOS
           FROM CIDADES C
          WHERE C.COD_MUNICIPIOIBGE = ?`,
        [String(ibge)]
    );
    return escolher(linhas);
}

// Só entra quando o IBGE não achou nada — cidade que o ERP cadastrou sem
// código, ou código que mudou de valor. Compara pelo nome normalizado dentro
// da UF, que é o que sobra.
async function porNome(cidade, uf) {
    const alvo = normalizar(cidade);
    if (alvo === '' || !uf) return null;

    const linhas = await queryFb(
        `SELECT C.CODIGOCID, ${texto('C.NOMECID', 30)} AS NOMECID, C.UFCID, ${USOS} AS USOS
           FROM CIDADES C
          WHERE C.UFCID = ?`,
        [String(uf).trim().toUpperCase()]
    );

    return escolher(linhas.filter((l) => normalizar(l.NOMECID) === alvo));
}

// Devolve { codigoCidade, nome, uf, criterio } ou null.
// `criterio` existe para o log dizer COMO a cidade foi decidida: sem isso,
// uma cidade errada gravada no cadastro não teria rastro nenhum.
async function resolverCodigoCidade({ ibge, cidade, uf }) {
    let linha = await porIbge(ibge);
    let criterio = 'ibge';

    if (!linha) {
        linha = await porNome(cidade, uf);
        criterio = 'nome+uf';
    }

    if (!linha) return null;

    return {
        codigoCidade: Number(linha.CODIGOCID),
        nome: String(linha.NOMECID ?? '').trim(),
        uf: String(linha.UFCID ?? '').trim(),
        criterio,
    };
}

module.exports = { resolverCodigoCidade, normalizar, escolher, IBGE_VAZIO };
