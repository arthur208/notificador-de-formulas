const express = require('express');
const router = express.Router();
const { exigirPapel } = require('../middleware/autenticacao');
const c = require('../controllers/configController');
const cid = require('../controllers/cidadesController');

// Credencial é coisa de admin. Conteúdo é de gestor.
router.get('/canal', exigirPapel('admin'), c.lerCanal);
router.put('/canal', exigirPapel('admin'), c.gravarCanal);

router.get('/templates', exigirPapel('gestor'), c.lerTemplates);
router.put('/templates/:modalidade', exigirPapel('gestor'), c.gravarTemplate);

router.get('/cidades', exigirPapel('gestor'), cid.listar);
router.get('/cidades/sugestoes', exigirPapel('gestor'), cid.sugestoes);
router.put('/cidades/:codigoCid', exigirPapel('gestor'), cid.gravar);
router.delete('/cidades/:codigoCid', exigirPapel('gestor'), cid.remover);

module.exports = router;
