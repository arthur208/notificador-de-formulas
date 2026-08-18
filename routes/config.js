const express = require('express');
const router = express.Router();
const { exigirPapel } = require('../middleware/autenticacao');
const c = require('../controllers/configController');
const cid = require('../controllers/cidadesController');
const conv = require('../controllers/conveniosController');

// Credencial é coisa de admin. Conteúdo é de gestor.
router.get('/canal', exigirPapel('admin'), c.lerCanal);
router.put('/canal', exigirPapel('admin'), c.gravarCanal);

router.get('/templates', exigirPapel('gestor'), c.lerTemplates);
router.put('/templates/:modalidade', exigirPapel('gestor'), c.gravarTemplate);

router.get('/cidades', exigirPapel('gestor'), cid.listar);
router.get('/cidades/sugestoes', exigirPapel('gestor'), cid.sugestoes);
router.put('/cidades/:codigoCid', exigirPapel('gestor'), cid.gravar);
router.delete('/cidades/:codigoCid', exigirPapel('gestor'), cid.remover);

router.get('/convenios', exigirPapel('gestor'), conv.listar);
router.put('/convenios/:codigoTs', exigirPapel('gestor'), conv.gravar);
router.delete('/convenios/:codigoTs', exigirPapel('gestor'), conv.remover);

module.exports = router;
