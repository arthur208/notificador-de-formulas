const { getLogsCollection } = require('../config/db');

/**
 * Loga um evento (sucesso ou erro) no MongoDB.
 * @param {object} logData O objeto de log a ser inserido.
 */
async function logToMongo(logData) {
    try {
        const collection = getLogsCollection();
        await collection.insertOne(logData);
    } catch (mongoErr) {
        console.error("Falha ao logar no MongoDB:", mongoErr);
        // Não trava a requisição principal se o log falhar
    }
}

/**
 * Busca logs no MongoDB com paginação e filtros.
 * @param {object} query O filtro de busca (ex: { timestamp: { ... } })
 * @param {number} page A página atual
 * @param {number} limit O limite de itens por página
 * @returns {Promise<Array>} A lista de logs.
 */
async function findLogs(query, page, limit) {
    const collection = getLogsCollection();
    return collection.find(query)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
}

/**
 * Conta o total de documentos para um filtro no MongoDB.
 * @param {object} query O filtro de busca
 * @returns {Promise<number>} O total de documentos.
 */
async function countLogs(query) {
    const collection = getLogsCollection();
    return collection.countDocuments(query);
}

/**
 * Verifica se já existe um log de sucesso para uma receita.
 * @param {number} codigoReceita O código da receita.
 * @returns {Promise<object|null>} O log, se existir.
 */
async function checkExistingLog(codigoReceita) {
    try {
        const collection = getLogsCollection();
        return await collection.findOne({ 
            codigoReceita: Number(codigoReceita),
            status: "sucesso"
        });
    } catch (mongoErr) {
        console.error("Erro ao checar log no MongoDB:", mongoErr);
        return null;
    }
}

/**
 * Quais das receitas informadas já tiveram envio bem-sucedido.
 * Uma única consulta — chamar checkExistingLog por receita faria
 * até 90 idas ao banco para montar uma tela.
 * @param {number[]} codigos
 * @returns {Promise<Set<number>>}
 */
async function buscarAvisados(codigos) {
    if (!Array.isArray(codigos) || codigos.length === 0) return new Set();
    try {
        const collection = getLogsCollection();
        const docs = await collection
            .find(
                { codigoReceita: { $in: codigos.map(Number) }, status: 'sucesso' },
                { projection: { codigoReceita: 1 } }
            )
            .toArray();
        return new Set(docs.map((doc) => Number(doc.codigoReceita)));
    } catch (mongoErr) {
        console.error('Erro ao buscar receitas já avisadas:', mongoErr);
        return new Set();
    }
}

module.exports = {
    logToMongo,
    findLogs,
    countLogs,
    checkExistingLog,
    buscarAvisados,
};
