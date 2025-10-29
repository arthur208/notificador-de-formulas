const axios = require('axios');
const firebirdService = require('../services/firebirdService');
const mongoService = require('../services/mongoService');
const { getSaudacao, toTitleCase } = require('../utils/helpers');

async function getCliente(req, res) {
    const codigoReceita = req.params.codigo;
    console.log(`Buscando (MODO COMPLETO) para receita: ${codigoReceita}`);

    try {
        // 1. Checa log no MongoDB
        const logSucessoExistente = await mongoService.checkExistingLog(codigoReceita);

        // 2. Busca dados no Firebird
        const clienteData = await firebirdService.getRecipeData(codigoReceita);
        if (!clienteData) {
            return res.status(404).json({ erro: "Cliente não encontrado." });
        }

        // 3. Checa/Busca dados de entrega (Firebird)
        let { isDelivery, deliveryAddress, codigor } = await firebirdService.getDeliveryData(codigoReceita);

        let mensagemSugerida = "";
        const saudacao = getSaudacao();

        if (isDelivery) {
            // 4. Se for entrega, enriquece com ViaCEP (API Externa)
            if (deliveryAddress && deliveryAddress.cep) {
                try {
                    const viaCepRes = await axios.get(`https://viacep.com.br/ws/${deliveryAddress.cep.replace(/\D/g, '')}/json/`);
                    if (!viaCepRes.data.erro) {
                        deliveryAddress.cidade = viaCepRes.data.localidade;
                        deliveryAddress.estado = viaCepRes.data.uf;
                    }
                } catch (viaCepErr) {
                    console.warn("Falha ao consultar ViaCEP:", viaCepErr.message);
                }
            }
            
            // 5. Monta mensagem de Entrega
            let fullAddress = "Endereço não encontrado.";
            if(deliveryAddress) {
                fullAddress = `${deliveryAddress.endereco || ''}, ${deliveryAddress.numero || ''} - ${deliveryAddress.bairro || ''}`;
                if(deliveryAddress.cidade) {
                    fullAddress += ` / ${deliveryAddress.cidade} (${deliveryAddress.estado})`;
                }
            }
            mensagemSugerida = `${saudacao}, ${clienteData.nome}! 👋\n\nA Farmácia Bioessência informa: Sua receita (Nº ${codigoReceita}) está pronta e será enviada para entrega. 🚚✅\n\nEndereço de destino:\n${fullAddress}\n\nFicamos à disposição!`;
        } else {
            // 5. Monta mensagem de Retirada
            mensagemSugerida = `${saudacao}, ${clienteData.nome}! 👋\n\nA Farmácia Bioessência informa: Sua receita (Nº ${codigoReceita}) está pronta para retirada em nossa loja. 💊✅\n\nFicamos à disposição e aguardamos sua visita!`;
        }

        // 6. Resposta final
        res.json({
            dadosCliente: clienteData,
            mensagemSugerida: mensagemSugerida,
            jaEnviado: (logSucessoExistente !== null),
            isDelivery: isDelivery,
            deliveryAddress: deliveryAddress
        });

    } catch (error) {
        console.error("Erro fatal na Rota /cliente:", error);
        res.status(500).json({ erro: "Erro interno do servidor ao processar a receita." });
    }
}

module.exports = {
    getCliente
};
