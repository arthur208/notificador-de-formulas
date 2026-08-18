'use strict';

const COLECAO_LOGS_PADRAO = 'notificador_logs';
const TIMEOUT_FIREBIRD_PADRAO = 15000;

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
        porta: Number(env.PORT) || 3008,
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
