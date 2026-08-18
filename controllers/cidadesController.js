const cidadeService = require('../services/cidadeService');
const firebirdService = require('../services/firebirdService');
const auditoria = require('../services/auditoriaService');

async function listar(_req, res) {
    res.json({ cidades: await cidadeService.listarCidades() });
}

async function gravar(req, res) {
    const { codigoCid } = req.params;
    try {
        const anterior = await cidadeService.resolverPrazo(codigoCid);
        await cidadeService.salvarCidade(codigoCid, req.body || {});
        await auditoria.registrar({
            usuario: req.usuario, acao: 'atualizar', entidade: 'cidade',
            entidadeId: Number(codigoCid), valorAnterior: anterior, valorNovo: req.body,
        });
        res.json({ ok: true });
    } catch (erro) {
        res.status(400).json({ erro: erro.message });
    }
}

async function remover(req, res) {
    const { codigoCid } = req.params;
    await cidadeService.removerCidade(codigoCid);
    await auditoria.registrar({
        usuario: req.usuario, acao: 'remover', entidade: 'cidade',
        entidadeId: Number(codigoCid),
    });
    res.json({ ok: true });
}

// Cidades com entrega recente que ainda não foram cadastradas.
async function sugestoes(_req, res) {
    try {
        const [doErp, cadastradas] = await Promise.all([
            firebirdService.cidadesComEntregaRecente(12),
            cidadeService.listarCidades(),
        ]);
        const jaTem = new Set(cadastradas.map((c) => c.codigoCid));
        res.json({ sugestoes: doErp.filter((c) => !jaTem.has(c.codigoCid)) });
    } catch (erro) {
        console.error('Erro ao buscar sugestões de cidade:', erro);
        res.status(500).json({ erro: 'Não foi possível consultar as cidades do sistema.' });
    }
}

module.exports = { listar, gravar, remover, sugestoes };
