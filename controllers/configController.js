const canalConfigService = require('../services/canalConfigService');
const templateService = require('../services/templateService');
const auditoria = require('../services/auditoriaService');

async function lerCanal(_req, res) {
    const canal = await canalConfigService.carregarCanal();
    res.json({ canal: canalConfigService.canalParaExibicao(canal) });
}

async function gravarCanal(req, res) {
    const anterior = await canalConfigService.carregarCanal();
    const { canal, token, clientId, clientSecret, numeroRemetente, botoesAtivos, ativo } = req.body || {};

    // Campo em branco significa "não mexer" — a tela nunca recebe o valor
    // cheio de volta, então não teria como reenviá-lo.
    const novo = {
        canal: canal || anterior?.canal || 'whatsmeow',
        token: token || anterior?.token,
        clientId: clientId || anterior?.clientId,
        clientSecret: clientSecret || anterior?.clientSecret,
        numeroRemetente: numeroRemetente ?? anterior?.numeroRemetente,
        botoesAtivos: Boolean(botoesAtivos),
        ativo: ativo !== false,
    };

    await canalConfigService.salvarCanal(novo);
    await auditoria.registrar({
        usuario: req.usuario, acao: 'atualizar', entidade: 'canal_config',
        valorAnterior: anterior, valorNovo: novo,
    });

    res.json({ canal: canalConfigService.canalParaExibicao(novo) });
}

async function lerTemplates(_req, res) {
    res.json({
        templates: await templateService.listarTemplates(),
        variaveis: {
            globais: templateService.VARIAVEIS_GLOBAIS,
            porModalidade: templateService.VARIAVEIS_POR_MODALIDADE,
        },
    });
}

async function gravarTemplate(req, res) {
    const { modalidade } = req.params;
    const { titulo, corpo } = req.body || {};

    if (!corpo || corpo.trim() === '') {
        return res.status(400).json({ erro: 'O texto da mensagem não pode ficar vazio.' });
    }

    let invalidas;
    try {
        invalidas = templateService.validarTemplate(modalidade, corpo);
    } catch {
        return res.status(400).json({ erro: `Modalidade desconhecida: ${modalidade}.` });
    }

    if (invalidas.length > 0) {
        return res.status(400).json({
            erro: `Estas variáveis não existem em "${modalidade}": ${invalidas.join(', ')}.`,
            invalidas,
        });
    }

    const anterior = await templateService.carregarTemplate(modalidade);
    await templateService.salvarTemplate(modalidade, { titulo, corpo });
    await auditoria.registrar({
        usuario: req.usuario, acao: 'atualizar', entidade: 'template',
        entidadeId: modalidade, valorAnterior: anterior, valorNovo: { titulo, corpo },
    });

    res.json({ ok: true });
}

module.exports = { lerCanal, gravarCanal, lerTemplates, gravarTemplate };
