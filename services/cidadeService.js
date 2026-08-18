const { getDb } = require('../config/db');

const COLECAO = 'cidades_entrega';

function colecao() {
    return getDb().collection(COLECAO);
}

async function garantirIndices() {
    await colecao().createIndex({ codigoCid: 1 }, { unique: true });
}

async function listarCidades() {
    return colecao().find({}).sort({ nome: 1 }).toArray();
}

async function salvarCidade(codigoCid, { nome, uf, dias, templateId, ativo }) {
    const codigo = Number(codigoCid);
    if (!Number.isInteger(codigo)) throw new Error('Código de cidade inválido.');

    const diasNumero = Number(dias);
    if (!Number.isInteger(diasNumero) || diasNumero < 0) {
        throw new Error('Informe o prazo em dias úteis, um número inteiro.');
    }

    await colecao().updateOne(
        { codigoCid: codigo },
        {
            $set: {
                codigoCid: codigo, nome, uf,
                dias: diasNumero,
                templateId: templateId || null,
                ativo: ativo !== false,
                atualizadoEm: new Date(),
            },
        },
        { upsert: true }
    );
}

async function removerCidade(codigoCid) {
    await colecao().deleteOne({ codigoCid: Number(codigoCid) });
}

// Fallback deliberado: cidade não cadastrada NÃO ganha prazo genérico.
// A mensagem sai sem a frase de prazo em vez de prometer o que não sabemos.
async function resolverPrazo(codigoCid) {
    if (codigoCid === null || codigoCid === undefined) return null;
    const cidade = await colecao().findOne({ codigoCid: Number(codigoCid), ativo: true });
    if (!cidade) return null;
    return { dias: cidade.dias, templateId: cidade.templateId ?? null };
}

module.exports = {
    listarCidades, salvarCidade, removerCidade, resolverPrazo, garantirIndices,
};
