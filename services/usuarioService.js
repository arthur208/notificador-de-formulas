const { getDb } = require('../config/db');
const { gerarHash } = require('../utils/senha');

const COLECAO = 'usuarios';
const PAPEIS = ['atendente', 'gestor', 'admin'];

function colecao() {
    return getDb().collection(COLECAO);
}

function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

async function garantirIndices() {
    await colecao().createIndex({ email: 1 }, { unique: true });
}

async function criarUsuario({ nome, email, senha, papel }) {
    if (!PAPEIS.includes(papel)) {
        throw new Error(`Papel inválido: ${papel}. Use ${PAPEIS.join(', ')}.`);
    }
    const documento = {
        nome: String(nome).trim(),
        email: normalizarEmail(email),
        senhaHash: await gerarHash(senha),
        papel,
        ativo: true,
        criadoEm: new Date(),
        ultimoAcesso: null,
    };
    await colecao().insertOne(documento);
    return semSegredo(documento);
}

async function buscarPorEmail(email) {
    return colecao().findOne({ email: normalizarEmail(email), ativo: true });
}

async function listarUsuarios() {
    return colecao().find({}, { projection: { senhaHash: 0 } }).toArray();
}

async function registrarAcesso(idUsuario) {
    await colecao().updateOne({ _id: idUsuario }, { $set: { ultimoAcesso: new Date() } });
}

// Nunca devolver o hash em resposta HTTP.
function semSegredo(usuario) {
    if (!usuario) return null;
    const { senhaHash, ...resto } = usuario;
    return resto;
}

module.exports = {
    PAPEIS, criarUsuario, buscarPorEmail, listarUsuarios,
    registrarAcesso, garantirIndices, semSegredo,
};
