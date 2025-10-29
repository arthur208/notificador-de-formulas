const express = require('express');
const router = express.Router();

// Importa os controladores
const { getCliente } = require('../controllers/recipeController');
const { sendMessage } = require('../controllers/messageController');
const { getLogs } = require('../controllers/logController');

// Define as rotas
router.get('/cliente/:codigo', getCliente);
router.post('/enviar', sendMessage);
router.get('/logs', getLogs);

// Exporta o roteador
module.exports = router;
