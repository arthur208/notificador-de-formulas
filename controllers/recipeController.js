const firebirdService = require('../services/firebirdService');
const mongoService = require('../services/mongoService');
const { getSaudacao } = require('../utils/helpers');
const { montarEndereco } = require('../utils/endereco');

async function getCliente(req, res) {
    const codigoReceita = req.params.codigo;

    try {
        const logSucessoExistente = await mongoService.checkExistingLog(codigoReceita);

        const clienteData = await firebirdService.getRecipeData(codigoReceita);
        if (!clienteData) {
            return res.status(404).json({ erro: 'Cliente não encontrado.' });
        }

        const { isDelivery, deliveryAddress } = await firebirdService.getDeliveryData(codigoReceita);

        const saudacao = getSaudacao();
        let mensagemSugerida;

        if (isDelivery) {
            const enderecoTexto = montarEndereco(deliveryAddress) || 'Endereço não encontrado.';
            mensagemSugerida =
                `${saudacao}, ${clienteData.nome}! 👋\n\n` +
                `A Farmácia Bioessência informa: Sua receita (Nº ${codigoReceita}) está pronta ` +
                `e será enviada para entrega. 🚚✅\n\n` +
                `Endereço de destino:\n${enderecoTexto}\n\nFicamos à disposição!`;
        } else {
            mensagemSugerida =
                `${saudacao}, ${clienteData.nome}! 👋\n\n` +
                `A Farmácia Bioessência informa: Sua receita (Nº ${codigoReceita}) está pronta ` +
                `para retirada em nossa loja. 💊✅\n\n` +
                `Ficamos à disposição e aguardamos sua visita!`;
        }

        res.json({
            dadosCliente: clienteData,
            mensagemSugerida,
            jaEnviado: logSucessoExistente !== null,
            isDelivery,
            deliveryAddress,
        });
    } catch (erro) {
        console.error('Erro na rota /cliente:', erro);
        res.status(500).json({ erro: 'Erro interno do servidor ao processar a receita.' });
    }
}

module.exports = { getCliente };
