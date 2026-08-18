const mongoService = require('../services/mongoService');

const POR_PAGINA = 25;

async function getLogs(req, res) {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const { dateStart, dateEnd, busca } = req.query;

        const query = { ...mongoService.montarFiltroBusca(busca) };

        if (dateStart || dateEnd) {
            query.timestamp = {};
            if (dateStart) query.timestamp.$gte = new Date(`${dateStart}T00:00:00.000-03:00`);
            if (dateEnd) query.timestamp.$lte = new Date(`${dateEnd}T23:59:59.999-03:00`);
        }

        const [logs, total] = await Promise.all([
            mongoService.findLogsAgrupados(query, page, POR_PAGINA),
            mongoService.contarAgrupados(query),
        ]);

        res.json({ logs, hasMore: page * POR_PAGINA < total, total });
    } catch (erro) {
        console.error('Erro ao buscar logs:', erro);
        res.status(500).json({ erro: 'Falha ao consultar o histórico.' });
    }
}

module.exports = { getLogs };
