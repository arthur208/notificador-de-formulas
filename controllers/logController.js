const mongoService = require('../services/mongoService');

async function getLogs(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 25;
        const dataInicio = req.query.dateStart;
        const dataFim = req.query.dateEnd;
        
        const query = {};
        
        if (dataInicio || dataFim) {
            query.timestamp = {};
            if (dataInicio) {
                query.timestamp.$gte = new Date(dataInicio + 'T00:00:00.000-03:00'); 
            }
            if (dataFim) {
                query.timestamp.$lte = new Date(dataFim + 'T23:59:59.999-03:00');
            }
        }

        // Executa as consultas em paralelo
        const [logs, totalLogs] = await Promise.all([
            mongoService.findLogs(query, page, limit),
            mongoService.countLogs(query)
        ]);
        
        const hasMore = (page * limit) < totalLogs;

        res.json({ logs: logs, hasMore: hasMore });

    } catch (err) {
        console.error("Erro ao buscar logs:", err);
        res.status(500).json({ erro: "Falha ao consultar histórico." });
    }
}

module.exports = {
    getLogs
};
