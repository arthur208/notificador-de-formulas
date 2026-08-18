const express = require('express');
const router = express.Router();
const { login, logout, eu } = require('../controllers/authController');
const { exigirSessao } = require('../middleware/autenticacao');

router.post('/login', login);
router.post('/logout', logout);
router.get('/eu', exigirSessao, eu);

module.exports = router;
