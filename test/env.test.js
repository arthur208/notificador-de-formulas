const { test } = require('node:test');
const assert = require('node:assert');
const { resolverConfig, descreverDestino } = require('../config/env');

const ambienteMinimo = {
    FB_HOST: '192.168.254.103',
    FB_DB_PATH: 'D:\\dados\\BANCO',
    FB_USER: 'SYSDBA',
    FB_PASS: 'segredo',
    MONGO_URI: 'mongodb://localhost:27017',
    MONGO_DB_NAME: 'notificador_dev',
};

test('usa a coleção padrão quando MONGO_COLLECTION_LOGS não é definida', () => {
    const config = resolverConfig(ambienteMinimo);
    assert.strictEqual(config.mongo.colecaoLogs, 'notificador_logs');
});

test('permite trocar a coleção por variável de ambiente', () => {
    const config = resolverConfig({ ...ambienteMinimo, MONGO_COLLECTION_LOGS: 'logs_dev' });
    assert.strictEqual(config.mongo.colecaoLogs, 'logs_dev');
});

test('porta do Firebird cai em 3050 quando ausente', () => {
    const config = resolverConfig(ambienteMinimo);
    assert.strictEqual(config.firebird.port, 3050);
});

test('timeout do Firebird cai em 15000ms quando ausente', () => {
    const config = resolverConfig(ambienteMinimo);
    assert.strictEqual(config.firebird.timeoutMs, 15000);
});

test('lista TODAS as variáveis ausentes numa única mensagem', () => {
    assert.throws(
        () => resolverConfig({ FB_HOST: '192.168.254.103' }),
        (erro) => {
            assert.match(erro.message, /FB_DB_PATH/);
            assert.match(erro.message, /MONGO_URI/);
            assert.match(erro.message, /MONGO_DB_NAME/);
            return true;
        }
    );
});

test('trata string vazia como ausente', () => {
    assert.throws(
        () => resolverConfig({ ...ambienteMinimo, MONGO_DB_NAME: '   ' }),
        /MONGO_DB_NAME/
    );
});

test('descreverDestino mostra o banco e omite a senha da URI', () => {
    const config = resolverConfig({
        ...ambienteMinimo,
        MONGO_URI: 'mongodb://usuario:senhaSecreta@192.168.0.249:27017',
    });
    const texto = descreverDestino(config);
    assert.ok(!texto.includes('senhaSecreta'), 'a senha não pode aparecer no log');
    assert.ok(texto.includes('notificador_dev'), 'o nome do banco precisa aparecer');
});
