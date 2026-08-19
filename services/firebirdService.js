const { fbPool, config } = require('../config/db');
// CORREÇÃO: Importa 'toTitleCase' junto com 'decodeFBString'
const { decodeFBString, toTitleCase } = require('../utils/helpers');
const { emLotes, listaInteirosSegura } = require('../utils/lotes');
const { formatarHora } = require('../utils/datas');

const CODIGO_STATUS_CONFERIDO = 12;
const TAMANHO_LOTE_IN = 1000;

// Wrapper de query (Promise) específico para o Firebird.
// A guarda `encerrado` existe para liberar a conexão que chega DEPOIS do
// timeout — sem ela, cada consulta estourada vazaria uma conexão do pool.
function queryFb(sql, params, timeoutMs = config.firebird.timeoutMs) {
    return new Promise((resolve, reject) => {
        let encerrado = false;

        const relogio = setTimeout(() => {
            encerrado = true;
            reject(new Error(`Firebird não respondeu em ${timeoutMs}ms.`));
        }, timeoutMs);

        fbPool.get((err, db) => {
            if (encerrado) {
                if (db) db.detach();
                return;
            }
            if (err) {
                clearTimeout(relogio);
                console.error('Erro ao pegar conexão do pool Firebird:', err);
                return reject(new Error('Erro ao conectar ao DB Firebird.'));
            }
            db.query(sql, params, (err, result) => {
                db.detach();
                if (encerrado) return;
                clearTimeout(relogio);
                if (err) {
                    console.error('Erro na query Firebird:', err);
                    return reject(err);
                }
                resolve(result);
            });
        });
    });
}

// Busca os dados principais da receita e cliente
async function getRecipeData(codigoReceita) {
    const sql = `
        SELECT CAST(T2.NOME AS VARCHAR(120) CHARACTER SET WIN1252) AS NOME,
               T3.FONERES, T3.FONECEL, T3.FONECOM, T3.FONEREC
        FROM RECCLIENTE T1
        INNER JOIN PESSOAS T2 ON T1.CODIGOPES = T2.CODIGOPES
        LEFT JOIN PESSOASFONE T3 ON T2.CODIGOPES = T3.CODIGOPES
        WHERE T1.CODIGOREC = ?;
    `;
    const result = await queryFb(sql, [codigoReceita]);
    if (!result || result.length === 0) {
        return null;
    }
    
    const dbRow = result[0];
    return {
        // Esta linha agora vai funcionar
        nome: toTitleCase(decodeFBString(dbRow.NOME)),
        telefones: {
            FONERES: decodeFBString(dbRow.FONERES),
            FONECEL: decodeFBString(dbRow.FONECEL),
            FONECOM: decodeFBString(dbRow.FONECOM),
            FONEREC: decodeFBString(dbRow.FONEREC)
        }
    };
}

// Checa se é entrega e busca o endereço.
// A cidade vem de CIDADES via ROMANEIO.CODIGOCID (decisão D1) — o ViaCEP
// saiu de cena: fornecia só cidade/UF e falhava em silêncio.
async function getDeliveryData(codigoReceita) {
    const sqlCheck = `SELECT T1.CODIGOR FROM RECROMANEIO T1 WHERE T1.CODIGOREC = ?`;
    const entregaResult = await queryFb(sqlCheck, [codigoReceita]);
    const codigor = (entregaResult && entregaResult.length > 0)
        ? decodeFBString(entregaResult[0].CODIGOR)
        : null;

    if (!codigor) {
        return { isDelivery: false, deliveryAddress: null, codigor: null };
    }

    const sqlEndereco = `
        SELECT CAST(RO.ENDERECO AS VARCHAR(120) CHARACTER SET WIN1252) AS ENDERECO,
               RO.NUMERO,
               CAST(RO.BAIRRO AS VARCHAR(120) CHARACTER SET WIN1252) AS BAIRRO,
               RO.CEP, RO.CODIGOCID,
               CAST(C.NOMECID AS VARCHAR(120) CHARACTER SET WIN1252) AS NOMECID,
               C.UFCID
        FROM ROMANEIO RO
        LEFT JOIN CIDADES C ON C.CODIGOCID = RO.CODIGOCID
        WHERE RO.CODIGOR = ?
    `;
    const enderecoResult = await queryFb(sqlEndereco, [codigor]);

    let deliveryAddress = null;
    if (enderecoResult && enderecoResult.length > 0) {
        const linha = enderecoResult[0];
        deliveryAddress = {
            endereco: decodeFBString(linha.ENDERECO),
            numero: decodeFBString(linha.NUMERO),
            bairro: decodeFBString(linha.BAIRRO),
            cep: decodeFBString(linha.CEP),
            codigoCid: linha.CODIGOCID === null ? null : Number(linha.CODIGOCID),
            cidade: toTitleCase(decodeFBString(linha.NOMECID)),
            estado: decodeFBString(linha.UFCID),
        };
    }

    return { isDelivery: true, deliveryAddress, codigor };
}

function mapearConferida(linha) {
    const total = Number(linha.TOTAL);
    const conferidas = Number(linha.CONFERIDAS);
    return {
        codigoRec: Number(linha.CODIGOREC),
        nome: toTitleCase(decodeFBString(linha.NOME)),
        total,
        conferidas,
        completa: total > 0 && conferidas === total,
        hora: formatarHora(linha.ULTIMA_HORA),
    };
}

// Receitas com ao menos uma fórmula conferida na data.
//
// DUAS consultas de propósito. A versão de uma só, com IN (SELECT ...),
// mediu 6.455ms contra 77ms — o otimizador do Firebird não empurra o filtro
// de data para dentro do IN e varre as 510k linhas de RECFORMULAS.
// Não unifique isto.
async function getReceitasConferidas(dataISO) {
    const sqlIds = `
        SELECT DISTINCT F.CODIGOREC
        FROM STATUSRECEITA S
        JOIN RECFORMULAS F ON F.CODIGORF = S.CODIGORF
        WHERE S.CODIGOCST = ?
          AND S.DATA = ?
          AND S.DATA <= CURRENT_DATE
    `;
    const linhasIds = await queryFb(sqlIds, [CODIGO_STATUS_CONFERIDO, dataISO]);
    const ids = linhasIds.map((linha) => Number(linha.CODIGOREC));
    if (ids.length === 0) return [];

    const conferidas = [];
    for (const lote of emLotes(ids, TAMANHO_LOTE_IN)) {
        const listaIn = listaInteirosSegura(lote);
        const sqlContagens = `
            SELECT F.CODIGOREC,
                   COUNT(*) AS TOTAL,
                   SUM(CASE WHEN EXISTS (
                         SELECT 1 FROM STATUSRECEITA S
                         WHERE S.CODIGORF = F.CODIGORF
                           AND S.CODIGOCST = ${CODIGO_STATUS_CONFERIDO}
                           AND S.DATA <= CURRENT_DATE
                       ) THEN 1 ELSE 0 END) AS CONFERIDAS,
                   MAX(CAST(P.NOME AS VARCHAR(120) CHARACTER SET WIN1252)) AS NOME,
                   MAX((SELECT MAX(S3.HOTA) FROM STATUSRECEITA S3
                        WHERE S3.CODIGORF = F.CODIGORF
                          AND S3.CODIGOCST = ${CODIGO_STATUS_CONFERIDO}
                          AND S3.DATA = ?)) AS ULTIMA_HORA
            FROM RECFORMULAS F
            LEFT JOIN RECCLIENTE RC ON RC.CODIGOREC = F.CODIGOREC
            LEFT JOIN PESSOAS    P  ON P.CODIGOPES  = RC.CODIGOPES
            WHERE F.CODIGOREC IN (${listaIn})
            GROUP BY F.CODIGOREC
        `;
        const parciais = await queryFb(sqlContagens, [dataISO]);
        conferidas.push(...parciais.map(mapearConferida));
    }
    return conferidas;
}

async function contarFormulas(codigoReceita) {
    const linhas = await queryFb(
        'SELECT COUNT(*) AS TOTAL FROM RECFORMULAS WHERE CODIGOREC = ?',
        [codigoReceita]
    );
    return Number(linhas?.[0]?.TOTAL ?? 0);
}

// Cidades que apareceram em entregas recentes. Alimenta o aviso da tela
// sobre cidades ainda não cadastradas — o buraco precisa ser visível.
async function cidadesComEntregaRecente(meses = 12) {
    // O intervalo entra como literal, não como parâmetro: em CURRENT_DATE - ?
    // o Firebird infere o tipo errado e falha com "Conversion error from
    // string". O valor é inteiro nosso, validado logo abaixo.
    const dias = Number(meses) * 30;
    if (!Number.isInteger(dias) || dias < 1) throw new Error(`Intervalo inválido: ${meses}`);
    const sql = `
        SELECT C.CODIGOCID,
               MAX(CAST(C.NOMECID AS VARCHAR(120) CHARACTER SET WIN1252)) AS NOME,
               MAX(C.UFCID) AS UF,
               COUNT(*) AS ENTREGAS
        FROM ROMANEIO RO
        JOIN CIDADES C ON C.CODIGOCID = RO.CODIGOCID
        WHERE RO.DATAENTREGA >= CURRENT_DATE - ${dias} AND RO.DATAENTREGA <= CURRENT_DATE
        GROUP BY C.CODIGOCID
        ORDER BY 4 DESC
    `;
    const linhas = await queryFb(sql, []);
    return linhas.map((l) => ({
        codigoCid: Number(l.CODIGOCID),
        nome: toTitleCase(decodeFBString(l.NOME)),
        uf: decodeFBString(l.UF),
        entregas: Number(l.ENTREGAS),
    }));
}

// Os convênios vivem em TABELASIMPLES com TIPO='CONVENIO' — a tabela
// CONVENIOS existe mas está vazia. São 97 ativos, misturando local de
// retirada, categoria de desconto e pessoa física; a curadoria de quais
// são destino real é feita pelo cadastro.
async function listarConvenios() {
    const sql = `
        SELECT CODIGOTS, CAST(NOME AS VARCHAR(120) CHARACTER SET WIN1252) AS NOME
        FROM TABELASIMPLES
        WHERE TIPO = 'CONVENIO' AND STATUS = 'A'
        ORDER BY NOME
    `;
    const linhas = await queryFb(sql, []);
    return linhas.map((l) => ({
        codigoTs: Number(l.CODIGOTS),
        nome: decodeFBString(l.NOME),
    }));
}

// O vínculo é do CLIENTE, não da receita: quem é conveniado carrega o
// vínculo em todas as suas receitas. Serve como sugestão, nunca como decisão.
async function conveniosDoCliente(codigoReceita) {
    const sql = `
        SELECT DISTINCT TS.CODIGOTS,
               CAST(TS.NOME AS VARCHAR(120) CHARACTER SET WIN1252) AS NOME
        FROM RECCLIENTE RC
        JOIN PESSOACONVENIO PC ON PC.CODIGOPES = RC.CODIGOPES
        JOIN TABELASIMPLES TS ON TS.CODIGOTS = PC.CODIGOCONVENIO AND TS.TIPO = 'CONVENIO'
        WHERE RC.CODIGOREC = ?
    `;
    const linhas = await queryFb(sql, [codigoReceita]);
    return linhas.map((l) => ({
        codigoTs: Number(l.CODIGOTS),
        nome: decodeFBString(l.NOME),
    }));
}

// Entrega e cidade de várias receitas de uma vez. Uma consulta por receita
// custaria 2 idas ao banco vezes 80 receitas só para desenhar a lista.
async function entregasDasReceitas(codigos) {
    const mapa = new Map();
    if (!Array.isArray(codigos) || codigos.length === 0) return mapa;

    for (const lote of emLotes(codigos, TAMANHO_LOTE_IN)) {
        const sql = `
            SELECT RR.CODIGOREC, RO.CODIGOCID,
                   CAST(C.NOMECID AS VARCHAR(120) CHARACTER SET WIN1252) AS NOMECID
            FROM RECROMANEIO RR
            JOIN ROMANEIO RO ON RO.CODIGOR = RR.CODIGOR
            LEFT JOIN CIDADES C ON C.CODIGOCID = RO.CODIGOCID
            WHERE RR.CODIGOREC IN (${listaInteirosSegura(lote)})
        `;
        for (const linha of await queryFb(sql, [])) {
            mapa.set(Number(linha.CODIGOREC), {
                codigoCid: linha.CODIGOCID === null ? null : Number(linha.CODIGOCID),
                cidade: toTitleCase(decodeFBString(linha.NOMECID)),
            });
        }
    }
    return mapa;
}

// Convênios vinculados a várias receitas de uma vez.
async function conveniosDasReceitas(codigos) {
    const mapa = new Map();
    if (!Array.isArray(codigos) || codigos.length === 0) return mapa;

    for (const lote of emLotes(codigos, TAMANHO_LOTE_IN)) {
        const sql = `
            SELECT DISTINCT RC.CODIGOREC, TS.CODIGOTS,
                   CAST(TS.NOME AS VARCHAR(120) CHARACTER SET WIN1252) AS NOME
            FROM RECCLIENTE RC
            JOIN PESSOACONVENIO PC ON PC.CODIGOPES = RC.CODIGOPES
            JOIN TABELASIMPLES TS ON TS.CODIGOTS = PC.CODIGOCONVENIO AND TS.TIPO = 'CONVENIO'
            WHERE RC.CODIGOREC IN (${listaInteirosSegura(lote)})
        `;
        for (const linha of await queryFb(sql, [])) {
            const codigo = Number(linha.CODIGOREC);
            if (!mapa.has(codigo)) mapa.set(codigo, []);
            mapa.get(codigo).push({
                codigoTs: Number(linha.CODIGOTS),
                nome: decodeFBString(linha.NOME),
            });
        }
    }
    return mapa;
}

module.exports = {
    getRecipeData,
    getDeliveryData,
    getReceitasConferidas,
    entregasDasReceitas,
    conveniosDasReceitas,
    contarFormulas,
    cidadesComEntregaRecente,
    listarConvenios,
    conveniosDoCliente,
};
