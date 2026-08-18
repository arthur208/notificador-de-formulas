const convenioService = require('../services/convenioService');
const firebirdService = require('../services/firebirdService');
const auditoria = require('../services/auditoriaService');

// Os convênios do ERP, com a configuração de cada um quando existir.
async function listar(_req, res) {
    try {
        const [doErp, configurados] = await Promise.all([
            firebirdService.listarConvenios(),
            convenioService.listarConfiguracoes(),
        ]);
        const porCodigo = new Map(configurados.map((c) => [c.codigoTs, c]));
        res.json({
            convenios: doErp.map((c) => ({ ...c, config: porCodigo.get(c.codigoTs) ?? null })),
        });
    } catch (erro) {
        console.error('Erro ao listar convênios:', erro);
        res.status(500).json({ erro: 'Não foi possível consultar os convênios do sistema.' });
    }
}

async function gravar(req, res) {
    const { codigoTs } = req.params;
    try {
        const anterior = await convenioService.buscarConfiguracao(codigoTs);
        await convenioService.salvarConvenio(codigoTs, req.body || {});
        await auditoria.registrar({
            usuario: req.usuario, acao: 'atualizar', entidade: 'convenio',
            entidadeId: Number(codigoTs), valorAnterior: anterior, valorNovo: req.body,
        });
        res.json({ ok: true });
    } catch (erro) {
        res.status(400).json({ erro: erro.message });
    }
}

async function remover(req, res) {
    const { codigoTs } = req.params;
    await convenioService.removerConvenio(codigoTs);
    await auditoria.registrar({
        usuario: req.usuario, acao: 'remover', entidade: 'convenio',
        entidadeId: Number(codigoTs),
    });
    res.json({ ok: true });
}

module.exports = { listar, gravar, remover };
