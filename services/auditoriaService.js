const { getDb } = require('../config/db');

const COLECAO = 'auditoria';
const CAMPOS_SENSIVEIS = ['token', 'clientId', 'clientSecret', 'senha', 'senhaHash'];

// A auditoria registra QUE mudou, nunca o segredo em si.
function limparSegredos(objeto) {
    if (!objeto || typeof objeto !== 'object') return objeto;

    const limpo = { ...objeto };
    for (const campo of CAMPOS_SENSIVEIS) {
        if (limpo[campo]) {
            const texto = String(limpo[campo]);
            const final = texto.length > 4 ? texto.slice(-4) : '****';
            limpo[campo] = `(alterado, final ${final})`;
        }
    }
    return limpo;
}

// Append-only. Nunca atualizar nem apagar registro de auditoria.
async function registrar({ usuario, acao, entidade, entidadeId, valorAnterior, valorNovo }) {
    try {
        await getDb().collection(COLECAO).insertOne({
            usuarioId: usuario?._id ?? null,
            usuarioNome: usuario?.nome ?? '(sem sessão)',
            acao,
            entidade,
            entidadeId: entidadeId ?? null,
            valorAnterior: limparSegredos(valorAnterior),
            valorNovo: limparSegredos(valorNovo),
            quando: new Date(),
        });
    } catch (erro) {
        // Falha de auditoria não derruba a operação, mas grita no log.
        console.error('FALHA AO AUDITAR:', acao, entidade, erro.message);
    }
}

async function listarAuditoria({ limite = 100 } = {}) {
    return getDb().collection(COLECAO)
        .find({}).sort({ quando: -1 }).limit(limite).toArray();
}

module.exports = { registrar, listarAuditoria, limparSegredos };
