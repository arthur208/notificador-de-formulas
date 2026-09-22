const express = require('express');
const router = express.Router();
const { exigirToken } = require('../middleware/tokenApi');
const { buscarCliente } = require('../controllers/integracaoController');

// Rotas para consumo por máquina. Autenticam por Bearer, não por sessão —
// e o token vale só aqui: as rotas da tela continuam exigindo login.
router.get('/cliente', exigirToken('clientes:ler'), buscarCliente);

module.exports = router;
