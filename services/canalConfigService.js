const { getDb, config } = require('../config/db');
const { cifrar, decifrar, mascarar } = require('../utils/cripto');

const COLECAO = 'canal_config';
const ID_UNICO = 'principal';
const CAMPOS_SECRETOS = ['token', 'clientId', 'clientSecret'];

function colecao() {
    return getDb().collection(COLECAO);
}

async function carregarCanal() {
    const doc = await colecao().findOne({ _id: ID_UNICO });
    if (!doc) return null;

    const aberto = { ...doc };
    for (const campo of CAMPOS_SECRETOS) {
        aberto[campo] = doc[campo] ? decifrar(doc[campo], config.chaveCripto) : null;
    }
    return aberto;
}

async function salvarCanal(dados) {
    const paraGravar = { ...dados, _id: ID_UNICO, atualizadoEm: new Date() };
    for (const campo of CAMPOS_SECRETOS) {
        if (dados[campo]) paraGravar[campo] = cifrar(dados[campo], config.chaveCripto);
    }
    await colecao().replaceOne({ _id: ID_UNICO }, paraGravar, { upsert: true });
}

// O que pode sair pela API de leitura. O valor cheio nunca deixa o servidor
// depois de salvo.
function canalParaExibicao(canal) {
    if (!canal) return null;
    return {
        canal: canal.canal,
        numeroRemetente: canal.numeroRemetente,
        botoesAtivos: Boolean(canal.botoesAtivos),
        ativo: Boolean(canal.ativo),
        token: mascarar(canal.token),
        clientId: mascarar(canal.clientId),
        clientSecret: mascarar(canal.clientSecret),
        atualizadoEm: canal.atualizadoEm,
    };
}

module.exports = { carregarCanal, salvarCanal, canalParaExibicao };
