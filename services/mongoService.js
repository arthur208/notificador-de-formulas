const { variantesDeTelefone } = require('../utils/telefone');
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

// Já avisamos este telefone nas últimas N horas?
//
// Serve para o agente não repetir "sua fórmula está pronta" para quem acabou
// de receber a mensagem. Conta só envio CONFIRMADO: `status: 'sucesso'`.
// Tentativa que falhou não avisou ninguém, e tratá-la como aviso faria o
// agente calar justamente para quem não recebeu nada.
//
// O telefone guardado tem duas formas, porque vem de dois caminhos:
// `numeroEnvio` (o JID que a MultiAtend devolve, que na maioria dos números
// NÃO tem o 9º dígito) ou `formatPhoneNumber` (que sempre põe o 9). As duas
// levam DDI. Por isso a comparação usa as mesmas variantes da busca de
// cadastro, cada uma com e sem o 55 na frente.
async function notificouRecentemente(telefone, janelaHoras) {
    const variantes = variantesDeTelefone(telefone);
    if (variantes.length === 0) return false;

    const candidatos = variantes.flatMap((v) => [v, `55${v}`]);
    const desde = new Date(Date.now() - Number(janelaHoras) * 60 * 60 * 1000);

    try {
        const achado = await getLogsCollection().findOne(
            {
                status: 'sucesso',
                telefoneEnviado: { $in: candidatos },
                timestamp: { $gte: desde },
            },
            { projection: { _id: 1 } }
        );
        return achado !== null;
    } catch (erro) {
        // Esta checagem é um extra na resposta do cadastro. Deixá-la derrubar
        // a consulta trocaria "o cliente tem cadastro completo" por um 502 —
        // e o agente perderia o que realmente importa por causa de um aviso.
        console.error('Erro ao checar notificação recente:', erro.message);
        return false;
    }
}

// A coleção de produção tem ~8.500 documentos e cresce todo dia. Sem índice,
// cada consulta de integração varreria tudo.
async function garantirIndices() {
    await getLogsCollection().createIndex(
        { telefoneEnviado: 1, status: 1, timestamp: -1 },
        { name: 'avisorecente' }
    );
}

function escaparRegex(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Busca por nome do cliente ou número da receita. Faz no servidor:
// filtrar 8.500 documentos no navegador seria absurdo.
function montarFiltroBusca(texto) {
    const termo = String(texto || '').trim();
    if (termo === '') return {};

    const alternativas = [{ nomeCliente: { $regex: escaparRegex(termo), $options: 'i' } }];
    const comoNumero = Number(termo.replace(/\D/g, ''));
    if (Number.isInteger(comoNumero) && comoNumero > 0) {
        alternativas.push({ codigoReceita: comoNumero });
    }
    return { $or: alternativas };
}

const CHAVE_AGRUPAMENTO = {
    codigoReceita: '$codigoReceita',
    telefoneEnviado: '$telefoneEnviado',
    status: '$status',
    minuto: { $dateToString: { format: '%Y-%m-%dT%H:%M', date: '$timestamp' } },
};

// Agrupa por (receita, telefone, status) dentro do mesmo minuto: quatro
// tentativas seguidas de erro viram uma entrada com tentativas: 4.
async function findLogsAgrupados(query, page, limit) {
    return getLogsCollection().aggregate([
        { $match: query },
        { $sort: { timestamp: -1 } },
        { $group: { _id: CHAVE_AGRUPAMENTO, doc: { $first: '$$ROOT' }, tentativas: { $sum: 1 } } },
        { $replaceRoot: { newRoot: { $mergeObjects: ['$doc', { tentativas: '$tentativas' }] } } },
        { $sort: { timestamp: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
    ]).toArray();
}

async function contarAgrupados(query) {
    const resultado = await getLogsCollection().aggregate([
        { $match: query },
        { $group: { _id: CHAVE_AGRUPAMENTO } },
        { $count: 'total' },
    ]).toArray();
    return resultado[0]?.total ?? 0;
}

module.exports = {
    logToMongo,
    findLogs,
    countLogs,
    checkExistingLog,
    buscarAvisados,
    findLogsAgrupados,
    contarAgrupados,
    montarFiltroBusca,
    notificouRecentemente,
    garantirIndices,
};
