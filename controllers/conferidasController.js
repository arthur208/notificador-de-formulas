const firebirdService = require('../services/firebirdService');
const mongoService = require('../services/mongoService');
const { validarDataISO, hojeISO } = require('../utils/datas');

// Mais recente primeiro. Receita sem hora vai para o fim.
function porHoraDesc(a, b) {
    if (!a.hora && !b.hora) return 0;
    if (!a.hora) return 1;
    if (!b.hora) return -1;
    return b.hora.localeCompare(a.hora);
}

// Separada do handler para ser testável sem banco.
function montarResposta(data, receitas, avisados) {
    const comAviso = receitas.map((receita) => ({
        ...receita,
        jaAvisado: avisados.has(receita.codigoRec),
    }));
    return {
        data,
        prontas: comAviso.filter((r) => r.completa).sort(porHoraDesc),
        aguardando: comAviso.filter((r) => !r.completa).sort(porHoraDesc),
    };
}

async function getConferidas(req, res) {
    const solicitada = req.query.data || hojeISO();
    const data = validarDataISO(solicitada);

    if (!data) {
        return res.status(400).json({ erro: 'Data inválida. Use o formato AAAA-MM-DD.' });
    }

    try {
        const receitas = await firebirdService.getReceitasConferidas(data);
        const avisados = await mongoService.buscarAvisados(receitas.map((r) => r.codigoRec));
        res.json(montarResposta(data, receitas, avisados));
    } catch (erro) {
        console.error('Erro na rota /conferidas:', erro);
        res.status(500).json({ erro: 'Não foi possível carregar as receitas conferidas.' });
    }
}

module.exports = { getConferidas, montarResposta };
