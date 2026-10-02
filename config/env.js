'use strict';

const COLECAO_LOGS_PADRAO = 'notificador_logs';
const TIMEOUT_FIREBIRD_PADRAO = 15000;
const JANELA_NOTIFICACAO_PADRAO = 24;

function resolverConfig(env = process.env) {
    const ausentes = [];
    const obrigatorio = (chave) => {
        const valor = env[chave];
        if (!valor || String(valor).trim() === '') {
            ausentes.push(chave);
            return undefined;
        }
        return String(valor).trim();
    };

    const config = {
        firebird: {
            host: obrigatorio('FB_HOST'),
            port: Number(env.FB_PORT) || 3050,
            database: obrigatorio('FB_DB_PATH'),
            user: obrigatorio('FB_USER'),
            password: obrigatorio('FB_PASS'),
            timeoutMs: Number(env.FB_TIMEOUT_MS) || TIMEOUT_FIREBIRD_PADRAO,
        },
        mongo: {
            uri: obrigatorio('MONGO_URI'),
            dbName: obrigatorio('MONGO_DB_NAME'),
            colecaoLogs: (env.MONGO_COLLECTION_LOGS || COLECAO_LOGS_PADRAO).trim(),
        },
        chaveCripto: obrigatorio('APP_CRYPTO_KEY'),
        multiatendBaseUrl: (env.MULTIATEND_BASE_URL || 'https://api2.multiatendweb.com.br').trim(),
        porta: Number(env.PORT) || 3008,
        // Janela do `notificacaoRecente` na consulta de integração. 24h é o
        // padrão porque o aviso de fórmula pronta sai uma vez por receita e o
        // cliente costuma responder no mesmo dia.
        //
        // `|| 24` cobre ausente, vazio, zero e texto não numérico de uma vez.
        // Zero cair no padrão é de propósito: janela zero desligaria a
        // checagem em silêncio, e quem quer desligar não escreve "0" no .env
        // esperando isso.
        notificacaoJanelaHoras: Number(env.NOTIFICACAO_JANELA_HORAS) || JANELA_NOTIFICACAO_PADRAO,
    };

    if (ausentes.length > 0) {
        throw new Error(
            `Variáveis de ambiente obrigatórias ausentes: ${ausentes.join(', ')}. ` +
            `Copie .env.example para .env e preencha.`
        );
    }

    return config;
}

function descreverDestino(config) {
    const uriSemCredencial = config.mongo.uri.replace(/\/\/[^@/]*@/, '//');
    return [
        `Firebird : ${config.firebird.host}:${config.firebird.port}`,
        `Mongo    : ${uriSemCredencial}`,
        `Banco    : ${config.mongo.dbName}`,
        `Coleção  : ${config.mongo.colecaoLogs}`,
    ].join('\n  ');
}

module.exports = { resolverConfig, descreverDestino };
