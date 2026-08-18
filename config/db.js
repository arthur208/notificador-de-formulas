require('dotenv').config();

const Firebird = require('node-firebird');
const { MongoClient } = require('mongodb');
const { resolverConfig } = require('./env');

const config = resolverConfig();

const fbOptions = {
    host: config.firebird.host,
    port: config.firebird.port,
    database: config.firebird.database,
    user: config.firebird.user,
    password: config.firebird.password,
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
};
const fbPool = Firebird.pool(10, fbOptions);

const mongoClient = new MongoClient(config.mongo.uri);
let dbInstance;

async function connectToMongo() {
    if (dbInstance) return dbInstance;
    await mongoClient.connect();
    dbInstance = mongoClient.db(config.mongo.dbName);
    console.log('Conectado ao MongoDB com sucesso!');
    return dbInstance;
}

module.exports = {
    config,
    fbPool,
    connectToMongo,
    getDb: () => {
        if (!dbInstance) throw new Error('MongoDB não inicializado.');
        return dbInstance;
    },
    getLogsCollection: () => {
        if (!dbInstance) throw new Error('MongoDB não inicializado.');
        return dbInstance.collection(config.mongo.colecaoLogs);
    },
};
