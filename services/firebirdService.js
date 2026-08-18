const { fbPool, config } = require('../config/db');
// CORREÇÃO: Importa 'toTitleCase' junto com 'decodeFBString'
const { decodeFBString, toTitleCase } = require('../utils/helpers');

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
        SELECT T2.NOME, T3.FONERES, T3.FONECEL, T3.FONECOM, T3.FONEREC
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
        SELECT RO.ENDERECO, RO.NUMERO, RO.BAIRRO, RO.CEP, RO.CODIGOCID,
               C.NOMECID, C.UFCID
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

module.exports = {
    getRecipeData,
    getDeliveryData
};

