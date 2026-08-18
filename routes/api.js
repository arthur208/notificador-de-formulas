const express = require('express');
const router = express.Router();

// Importa os controladores
const { getCliente } = require('../controllers/recipeController');
const { sendMessage } = require('../controllers/messageController');
const { getLogs } = require('../controllers/logController');
const { getConferidas } = require('../controllers/conferidasController');
const { exigirSessao } = require('../middleware/autenticacao');

// Define as rotas — fixas antes das paramétricas
router.get('/conferidas', exigirSessao, getConferidas);
router.get('/cliente/:codigo', exigirSessao, getCliente);
router.post('/enviar', exigirSessao, sendMessage);
router.get('/logs', exigirSessao, getLogs);

// Exporta o roteador
module.exports = router;
