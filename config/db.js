// Carrega as variáveis de ambiente do .env
require('dotenv').config(); 

const Firebird = require('node-firebird');
const { MongoClient } = require('mongodb');
const { Pool } = require('pg');

// --- 1. Config Firebird (Farmácia) ---
const fbOptions = {
    host: process.env.FB_HOST,
    port: process.env.FB_PORT || 3050,
    database: process.env.FB_DB_PATH,
    user: process.env.FB_USER,
    password: process.env.FB_PASS,
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};
const fbPool = Firebird.pool(10, fbOptions);

// --- 2. Config PostgreSQL (Token) ---
const pgPool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT || 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
});

// --- 3. Config MongoDB (Logs) ---
const mongoClient = new MongoClient(process.env.MONGO_URI);
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;
const MONGO_COLLECTION_NAME = "logs_envio"; // Nome da coleção

let dbInstance;

// Função para inicializar o MongoDB
async function connectToMongo() {
    if (dbInstance) return dbInstance;
    await mongoClient.connect();
    dbInstance = mongoClient.db(MONGO_DB_NAME);
    console.log("Conectado ao MongoDB com sucesso!");
    return dbInstance;
}

// Função para testar a conexão com o PG
async function testPgConnection() {
    const pgClient = await pgPool.connect();
    console.log("Conectado ao PostgreSQL com sucesso!");
    pgClient.release(); // Libera o cliente de volta para o pool
}

// Exporta as conexões e funções de inicialização
module.exports = {
    fbPool,
    pgPool,
    connectToMongo,
    testPgConnection,
    getLogsCollection: () => {
        if (!dbInstance) throw new Error("MongoDB não inicializado.");
        return dbInstance.collection(MONGO_COLLECTION_NAME);
    }
};
