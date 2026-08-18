const crypto = require('node:crypto');
const { getDb } = require('../config/db');
const usuarioService = require('./usuarioService');

const COLECAO = 'sessoes';
const DURACAO_MS = 12 * 60 * 60 * 1000; // um turno de trabalho

function colecao() {
    return getDb().collection(COLECAO);
}

// TTL do próprio Mongo remove sessões vencidas sem rotina de limpeza.
async function garantirIndices() {
    await colecao().createIndex({ expiraEm: 1 }, { expireAfterSeconds: 0 });
}

async function abrirSessao(usuario) {
    const token = crypto.randomBytes(32).toString('base64url');
    await colecao().insertOne({
        _id: token,
        usuarioId: usuario._id,
        criadaEm: new Date(),
        expiraEm: new Date(Date.now() + DURACAO_MS),
    });
    await usuarioService.registrarAcesso(usuario._id);
    return token;
}

async function buscarSessao(token) {
    if (!token) return null;
    const sessao = await colecao().findOne({ _id: token });
    if (!sessao || sessao.expiraEm < new Date()) return null;

    const usuario = await getDb().collection('usuarios')
        .findOne({ _id: sessao.usuarioId, ativo: true }, { projection: { senhaHash: 0 } });
    return usuario ? { usuario } : null;
}

async function encerrarSessao(token) {
    if (token) await colecao().deleteOne({ _id: token });
}

module.exports = { abrirSessao, buscarSessao, encerrarSessao, garantirIndices, DURACAO_MS };
