const numeroService = require('../services/numeroService');

const MAX_POR_CHAMADA = 10;

async function validar(req, res) {
    const { numeros, numero, forcar } = req.body || {};
    const lista = Array.isArray(numeros) ? numeros : numero ? [numero] : [];

    if (lista.length === 0) {
        return res.status(400).json({ erro: 'Informe ao menos um número.' });
    }
    if (lista.length > MAX_POR_CHAMADA) {
        return res.status(400).json({
            erro: `No máximo ${MAX_POR_CHAMADA} números por chamada.`,
        });
    }

    // O serviço já engole as próprias falhas e devolve "desconhecido";
    // este try é para erro de programação, não para a API fora do ar.
    try {
        res.json({ numeros: await numeroService.validarVarios(lista, { forcar: forcar === true }) });
    } catch (erro) {
        console.error('Erro ao validar números:', erro);
        res.status(500).json({ erro: 'Não foi possível validar os números.' });
    }
}

module.exports = { validar };
