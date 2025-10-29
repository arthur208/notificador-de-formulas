const { fbPool } = require('../config/db');
// CORREÇÃO: Importa 'toTitleCase' junto com 'decodeFBString'
const { decodeFBString, toTitleCase } = require('../utils/helpers');

// Wrapper de query (Promise) específico para o Firebird
function queryFb(sql, params) {
    return new Promise((resolve, reject) => {
        fbPool.get((err, db) => {
            if (err) {
                console.error("Erro ao pegar conexão do pool Firebird:", err);
                return reject(new Error("Erro ao conectar ao DB Firebird."));
            }
            db.query(sql, params, (err, result) => {
                db.detach();
                if (err) {
                    console.error("Erro na query Firebird:", err);
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

// Checa se é entrega e busca o endereço
async function getDeliveryData(codigoReceita) {
    // 1. Checa se é entrega
    const sqlCheck = `SELECT T1.CODIGOR FROM RECROMANEIO T1 WHERE T1.CODIGOREC = ?`;
    const entregaResult = await queryFb(sqlCheck, [codigoReceita]);
    const codigor = (entregaResult && entregaResult.length > 0) ? decodeFBString(entregaResult[0].CODIGOR) : null;

    if (!codigor) {
        return { isDelivery: false, deliveryAddress: null, codigor: null };
    }

    // 2. Se for, busca o endereço
    const sqlEndereco = `SELECT T1.ENDERECO, T1.NUMERO, T1.BAIRRO, T1.CEP FROM ROMANEIO T1 WHERE T1.CODIGOR = ?`;
    const enderecoResult = await queryFb(sqlEndereco, [codigor]);
    
    let deliveryAddress = null;
    if (enderecoResult && enderecoResult.length > 0) {
        const dbAddr = enderecoResult[0];
        deliveryAddress = {
            endereco: decodeFBString(dbAddr.ENDERECO),
            numero: decodeFBString(dbAddr.NUMERO),
            bairro: decodeFBString(dbAddr.BAIRRO),
            cep: decodeFBString(dbAddr.CEP),
            cidade: null,
            estado: null
        };
    }
    
    return { isDelivery: true, deliveryAddress, codigor };
}

module.exports = {
    getRecipeData,
    getDeliveryData
};

