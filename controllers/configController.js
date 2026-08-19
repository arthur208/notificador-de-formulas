const canalConfigService = require('../services/canalConfigService');
const templateService = require('../services/templateService');
const auditoria = require('../services/auditoriaService');

async function lerCanal(_req, res) {
    const canal = await canalConfigService.carregarCanal();
    res.json({ canal: canalConfigService.canalParaExibicao(canal) });
}

async function gravarCanal(req, res) {
    const anterior = await canalConfigService.carregarCanal();
    const { canal, token, clientId, clientSecret, numeroRemetente, botoesAtivos, botoes, ativo } = req.body || {};

    // Campo em branco significa "não mexer" — a tela nunca recebe o valor
    // cheio de volta, então não teria como reenviá-lo.
    const novo = {
        canal: canal || anterior?.canal || 'whatsmeow',
        token: token || anterior?.token,
        clientId: clientId || anterior?.clientId,
        clientSecret: clientSecret || anterior?.clientSecret,
        numeroRemetente: numeroRemetente ?? anterior?.numeroRemetente,
        botoesAtivos: Boolean(botoesAtivos),
        botoes: Array.isArray(botoes) ? botoes : (anterior?.botoes ?? []),
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
    // Uma entrada por modalidade conhecida, salva ou não: modalidade nova
    // não tem documento no Mongo e sumiria da tela até alguém gravar.
    const salvos = await templateService.listarTemplates();
    const porModalidade = new Map(salvos.map((t) => [t.modalidade, t]));

    const templates = Object.keys(templateService.VARIAVEIS_POR_MODALIDADE).map(
        (modalidade) => porModalidade.get(modalidade) ?? {
            modalidade, ...templateService.TEMPLATES_PADRAO[modalidade], botoes: [],
        }
    );

    res.json({
        templates,
        // A tela pergunta ao servidor em vez de ter a própria constante:
        // duas fontes para a mesma verdade divergem na primeira mudança.
        recursos: { botoes: templateService.BOTOES_DISPONIVEIS },
        variaveis: {
            globais: templateService.VARIAVEIS_GLOBAIS,
            porModalidade: templateService.VARIAVEIS_POR_MODALIDADE,
        },
    });
}

async function gravarTemplate(req, res) {
    const { modalidade } = req.params;
    const { cabecalho, corpo, botoes } = req.body || {};

    if (!corpo || corpo.trim() === '') {
        return res.status(400).json({ erro: 'O texto da mensagem não pode ficar vazio.' });
    }

    let invalidas;
    try {
        invalidas = templateService.validarTemplate(modalidade, corpo, [], botoes, cabecalho);
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
    await templateService.salvarTemplate(modalidade, { cabecalho, corpo, botoes });
    await auditoria.registrar({
        usuario: req.usuario, acao: 'atualizar', entidade: 'template',
        entidadeId: modalidade, valorAnterior: anterior, valorNovo: { cabecalho, corpo, botoes },
    });

    res.json({ ok: true });
}

module.exports = { lerCanal, gravarCanal, lerTemplates, gravarTemplate };
