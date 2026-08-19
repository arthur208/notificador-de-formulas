// Este arquivo substitui o seu 'server.js'
require('dotenv').config(); 

const express = require('express');
const apiRoutes = require('./routes/api');
// Removido testPgConnection da importação
const { connectToMongo, config } = require('./config/db');
const { descreverDestino } = require('./config/env');

const app = express();
const PORT = config.porta;

// --- Middlewares Globais ---
// A whitelist de IP saiu em 19/08/2026. Ela liberava a faixa 192.168/10
// inteira e lia o IP de um cabeçalho que o cliente controla, então não
// segurava ninguém — e dava a impressão de que segurava. Quem controla o
// acesso agora é o login, com freio de tentativas em utils/limiteTentativas.
//
// trust proxy fica ligado para o req.ip do log e do freio refletirem o
// cliente quando houver proxy na frente.
app.set('trust proxy', 1);
app.use(express.json());
app.use(require('./middleware/autenticacao').carregarUsuario);
app.use('/auth', require('./routes/auth'));
app.use(express.static('public')); // 4º: Serve os arquivos estáticos (index.html, app.js)

// --- Rotas da API ---
// Todas as rotas em /routes/api.js serão prefixadas com /api
app.use('/api/config', require('./routes/config'));
app.use('/api', apiRoutes);

// O roteamento é do lado do cliente: /receita/441620 e /configuracoes não
// existem como arquivo. Sem este fallback, link direto e recarregar a
// página dão "Cannot GET" — funcionava só porque o service worker
// respondia; navegador novo, aba anônima ou SW recém-instalado quebravam.
// Vem depois das rotas de API para não engolir 404 de endpoint.
app.get(/^(?!\/api\/|\/auth\/).*/, (req, res, next) => {
    if (req.accepts('html')) {
        return res.sendFile('index.html', { root: 'public' });
    }
    next();
});

// --- Inicialização do Servidor ---
async function startServer() {
    try {
        console.log('--- Destino das conexões ---');
        console.log('  ' + descreverDestino(config));
        console.log('----------------------------');

        // 1. Testa Conexão MongoDB
        await connectToMongo();
        await require('./services/usuarioService').garantirIndices();
        await require('./services/sessaoService').garantirIndices();
        await require('./services/cidadeService').garantirIndices();
        await require('./services/convenioService').garantirIndices();
        await require('./services/numeroService').garantirIndices();

        // (Passo do PostgreSQL removido)

        // 2. Inicia o servidor Express
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