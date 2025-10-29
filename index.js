// Este arquivo substitui o seu 'server.js'
require('dotenv').config(); 

const express = require('express');
const cors = require('cors');
const ipWhitelistMiddleware = require('./middleware/ipWhitelist');
const apiRoutes = require('./routes/api');
const { connectToMongo, testPgConnection } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 80; // Usa a porta do .env ou 80

// --- Middlewares Globais ---
app.set('trust proxy', 1); // Confia no proxy (para o req.ip funcionar)
app.use(ipWhitelistMiddleware); // 1º: Filtro de IP
app.use(cors()); // 2º: Libera CORS
app.use(express.json()); // 3º: Habilita o body-parser de JSON
app.use(express.static('public')); // 4º: Serve os arquivos estáticos (index.html, app.js)

// --- Rotas da API ---
// Todas as rotas em /routes/api.js serão prefixadas com /api
app.use('/api', apiRoutes);

// --- Inicialização do Servidor ---
async function startServer() {
    try {
        // 1. Testa Conexão MongoDB
        await connectToMongo();

        // 2. Testa Conexão PostgreSQL
        await testPgConnection();

        // 3. Inicia o servidor Express
        app.listen(PORT, () => {
            console.log(`Servidor rodando em http://localhost:${PORT}`);
            console.log("Pool de conexão Firebird pronto.");
        });

    } catch (err) {
        console.error("Falha fatal ao conectar a um dos bancos de dados. Servidor não iniciado.");
        console.error(err);
        process.exit(1);
    }
}

// Inicia tudo
startServer();
