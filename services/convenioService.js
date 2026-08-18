const { getDb } = require('../config/db');

const COLECAO = 'convenios';
// Variáveis livres não podem sombrear estas — a validação impede na gravação,
// e a montagem ignora por segurança.
const RESERVADAS = new Set([
    'saudacao', 'nome', 'codigo', 'qtdFormulas', 'endereco', 'cidade', 'local', 'dias',
]);

function colecao() {
    return getDb().collection(COLECAO);
}

async function garantirIndices() {
    await colecao().createIndex({ codigoTs: 1 }, { unique: true });
}

async function listarConfiguracoes() {
    return colecao().find({}).sort({ nomeErp: 1 }).toArray();
}

async function buscarConfiguracao(codigoTs) {
    return colecao().findOne({ codigoTs: Number(codigoTs), ativo: true });
}

async function salvarConvenio(codigoTs, { nomeErp, nomeExibicao, dias, variaveis, templateId, ativo }) {
    const codigo = Number(codigoTs);
    if (!Number.isInteger(codigo)) throw new Error('Código de convênio inválido.');
    if (!nomeExibicao || String(nomeExibicao).trim() === '') {
        throw new Error(
            'Informe como o convênio aparece na mensagem, com a preposição. ' +
            'Ex.: "na Farmácia Porto Rico".'
        );
    }

    const diasNumero = Number(dias);
    if (!Number.isInteger(diasNumero) || diasNumero < 0) {
        throw new Error('Informe o prazo em dias úteis, um número inteiro.');
    }

    const livres = Array.isArray(variaveis) ? variaveis : [];
    for (const { chave } of livres) {
        if (RESERVADAS.has(chave)) {
            throw new Error(`"${chave}" é uma variável do sistema. Escolha outro nome.`);
        }
    }

    await colecao().updateOne(
        { codigoTs: codigo },
        {
            $set: {
                codigoTs: codigo, nomeErp, nomeExibicao: String(nomeExibicao).trim(),
                dias: diasNumero, variaveis: livres,
                templateId: templateId || null, ativo: ativo !== false,
                atualizadoEm: new Date(),
            },
        },
        { upsert: true }
    );
}

async function removerConvenio(codigoTs) {
    await colecao().deleteOne({ codigoTs: Number(codigoTs) });
}

function variaveisDoConvenio(config) {
    if (!config) return {};
    const valores = { local: config.nomeExibicao, dias: config.dias };
    for (const { chave, valor } of config.variaveis ?? []) {
        if (!RESERVADAS.has(chave)) valores[chave] = valor;
    }
    return valores;
}

module.exports = {
    listarConfiguracoes, buscarConfiguracao, salvarConvenio,
    removerConvenio, variaveisDoConvenio, garantirIndices, RESERVADAS,
};
