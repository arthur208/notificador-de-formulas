const crypto = require('node:crypto');
const { getDb, config } = require('../config/db');

const COLECAO = 'tokens_api';

// O token é `ntk_<identificador>_<assinatura>`.
//
// A assinatura é um HMAC do identificador com a APP_CRYPTO_KEY, a mesma que
// já cifra as credenciais do canal. Não entra segredo novo no .env, e não
// existe segredo guardado no banco: o que está gravado é só o nome, os
// escopos e se está ativo. Quem tem a chave e o identificador refaz a
// assinatura; quem não tem, não forja.
//
// Consequência a saber: trocar a APP_CRYPTO_KEY invalida todos os tokens,
// do mesmo jeito que já torna as credenciais do canal ilegíveis. É o preço
// de não ter uma segunda chave para administrar.
const PREFIXO = 'ntk';
const TAM_ID = 12;

const ESCOPOS = ['clientes:ler', 'receitas:ler', 'enviar'];

function colecao() {
    return getDb().collection(COLECAO);
}

async function garantirIndices() {
    await colecao().createIndex({ identificador: 1 }, { unique: true });
}

function assinar(identificador) {
    const chave = Buffer.from(String(config.chaveCripto || ''), 'base64');
    if (chave.length !== 32) {
        throw new Error('APP_CRYPTO_KEY ausente ou inválida — o token não pode ser assinado.');
    }
    return crypto.createHmac('sha256', chave).update(`token-api:${identificador}`).digest('base64url');
}

function montar(identificador) {
    return `${PREFIXO}_${identificador}_${assinar(identificador)}`;
}

// Cortado nos dois primeiros sublinhados, não por split: a assinatura é
// base64url, cujo alfabeto inclui "_". Um split cego devolveria quatro ou
// cinco pedaços e recusaria token válido — de forma intermitente, conforme
// a assinatura sorteasse ou não um sublinhado.
function separar(token) {
    const texto = String(token ?? '');

    const fimPrefixo = texto.indexOf('_');
    if (fimPrefixo < 0 || texto.slice(0, fimPrefixo) !== PREFIXO) return null;

    const fimId = texto.indexOf('_', fimPrefixo + 1);
    if (fimId < 0) return null;

    const identificador = texto.slice(fimPrefixo + 1, fimId);
    const assinatura = texto.slice(fimId + 1);

    // O identificador é hexadecimal; qualquer outra coisa não veio daqui.
    if (!/^[0-9a-f]+$/.test(identificador) || assinatura === '') return null;

    return { identificador, assinatura };
}

// Comparação em tempo constante. Com === o tempo de resposta diria quantos
// caracteres do começo estão certos.
function assinaturaConfere(identificador, recebida) {
    let esperada;
    try {
        esperada = assinar(identificador);
    } catch {
        return false;
    }
    const a = Buffer.from(esperada);
    const b = Buffer.from(String(recebida));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Devolve o token inteiro. Diferente de senha, ele pode ser remontado
// depois a partir do identificador — não há hash a perder.
async function criarToken({ nome, escopos = ['clientes:ler'], criadoPor = null }) {
    if (!nome || String(nome).trim() === '') {
        throw new Error('Dê um nome ao token, para saber depois quem o usa.');
    }
    const invalidos = escopos.filter((e) => !ESCOPOS.includes(e));
    if (invalidos.length > 0) {
        throw new Error(`Escopo desconhecido: ${invalidos.join(', ')}. Use ${ESCOPOS.join(', ')}.`);
    }

    const identificador = crypto.randomBytes(TAM_ID).toString('hex');
    await colecao().insertOne({
        identificador,
        nome: String(nome).trim(),
        escopos,
        ativo: true,
        criadoPor,
        criadoEm: new Date(),
        ultimoUso: null,
        chamadas: 0,
    });
    return { token: montar(identificador), identificador, nome, escopos };
}

// Null quando não confere. Quem chama devolve 401 sem dizer qual parte
// falhou — token inexistente, revogado e assinatura errada são a mesma
// resposta.
async function validarToken(token) {
    const partes = separar(token);
    if (!partes) return null;
    if (!assinaturaConfere(partes.identificador, partes.assinatura)) return null;

    // A assinatura prova autenticidade; o banco diz se ainda vale.
    const doc = await colecao().findOne({ identificador: partes.identificador, ativo: true });
    if (!doc) return null;

    // Sem await: registrar o uso não pode atrasar a resposta nem derrubá-la.
    colecao().updateOne(
        { _id: doc._id },
        { $set: { ultimoUso: new Date() }, $inc: { chamadas: 1 } }
    ).catch((erro) => console.error('Falha ao registrar uso do token:', erro.message));

    return { identificador: doc.identificador, nome: doc.nome, escopos: doc.escopos ?? [] };
}

async function listarTokens() {
    return colecao().find({}).sort({ criadoEm: -1 }).toArray();
}

// Só para reexibir a quem já pode administrar tokens; não vai para log.
async function revelarToken(identificador) {
    const doc = await colecao().findOne({ identificador });
    return doc ? montar(identificador) : null;
}

async function revogarToken(identificador) {
    const r = await colecao().updateOne(
        { identificador },
        { $set: { ativo: false, revogadoEm: new Date() } }
    );
    return r.matchedCount > 0;
}

module.exports = {
    criarToken, validarToken, listarTokens, revelarToken, revogarToken,
    garantirIndices, separar, montar, ESCOPOS,
};
