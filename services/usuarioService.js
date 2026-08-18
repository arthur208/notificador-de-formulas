const { ObjectId } = require('mongodb');
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

async function buscarPorId(id) {
    return colecao().findOne({ _id: new ObjectId(String(id)) }, { projection: { senhaHash: 0 } });
}

async function atualizarUsuario(id, { nome, papel, ativo }) {
    if (papel !== undefined && !PAPEIS.includes(papel)) {
        throw new Error(`Papel inválido: ${papel}. Use ${PAPEIS.join(', ')}.`);
    }
    const mudancas = {};
    if (nome !== undefined) mudancas.nome = String(nome).trim();
    if (papel !== undefined) mudancas.papel = papel;
    if (ativo !== undefined) mudancas.ativo = Boolean(ativo);
    if (Object.keys(mudancas).length === 0) return;

    await colecao().updateOne({ _id: new ObjectId(String(id)) }, { $set: mudancas });
}

async function trocarSenha(id, senha) {
    await colecao().updateOne(
        { _id: new ObjectId(String(id)) },
        { $set: { senhaHash: await gerarHash(senha) } }
    );
    // Sessões abertas com a senha antiga deixam de valer.
    await getDb().collection('sessoes').deleteMany({ usuarioId: new ObjectId(String(id)) });
}

// Impede o último admin ativo de se rebaixar ou se desativar — sem isso
// ninguém mais consegue mexer em credencial nem criar usuário.
async function ehUltimoAdmin(id) {
    const ativos = await colecao().countDocuments({ papel: 'admin', ativo: true });
    if (ativos > 1) return false;
    const alvo = await colecao().findOne({ _id: new ObjectId(String(id)) });
    return Boolean(alvo && alvo.papel === 'admin' && alvo.ativo);
}

module.exports = {
    PAPEIS, criarUsuario, buscarPorEmail, buscarPorId, listarUsuarios,
    atualizarUsuario, trocarSenha, ehUltimoAdmin,
    registrarAcesso, garantirIndices, semSegredo,
};
