const axios = require('axios');
const mongoService = require('../services/mongoService');
const { formatPhoneNumber } = require('../utils/helpers'); 

async function sendMessage(req, res) {
    console.log("==================================================");
    console.log("[DEBUG] Controller: Requisição recebida em /api/enviar");
    console.log("[DEBUG] Body recebido:", JSON.stringify(req.body, null, 2)); // Mostra o JSON recebido formatado

    const { codigoReceita, telefoneEscolhido, mensagem, nomeCliente } = req.body;

    // 1. Tratamento e Validação do Número
    console.log("[DEBUG] Controller: Iniciando formatação do número...");
    const numeroFormatado = formatPhoneNumber(telefoneEscolhido);

    if (!numeroFormatado) {
        console.warn(`[WARN] Controller: Número inválido detectado (${telefoneEscolhido}). Abortando.`);
        return res.status(400).json({ 
            status: "erro", 
            mensagem: "Número de telefone inválido ou incompleto. Verifique se possui DDD." 
        });
    }

    // Prepara o payload para o Webhook
    const payloadWebhook = {
        numero: numeroFormatado,
        mensagem: mensagem,
        codigoReceita: codigoReceita,
        nomeCliente: nomeCliente
    };

    console.log(`[DEBUG] Controller: Payload preparado para envio:`, JSON.stringify(payloadWebhook, null, 2));
    console.log(`[DEBUG] Controller: URL Alvo: ${process.env.API_URL}`);

    try {
        // 2. Dispara para o Webhook
        console.log("[DEBUG] Controller: Enviando POST para o Webhook...");
        const response = await axios.post(process.env.API_URL, payloadWebhook);

        console.log(`[DEBUG] Controller: Resposta do Webhook recebida.`);
        console.log(`[DEBUG] Status Webhook: ${response.status}`);
        console.log(`[DEBUG] Dados Webhook:`, JSON.stringify(response.data));

        // 3. Loga o sucesso no MongoDB
        console.log("[DEBUG] Controller: Preparando log de SUCESSO para o MongoDB...");
        const logSucesso = {
            codigoReceita: Number(codigoReceita),
            nomeCliente: nomeCliente,
            telefoneEnviado: numeroFormatado,
            mensagem: mensagem,
            status: "sucesso",
            timestamp: new Date()
        };
        
        await mongoService.logToMongo(logSucesso);
        console.log("[DEBUG] Controller: Log salvo no MongoDB com sucesso.");
        
        res.json({ status: "sucesso", mensagem: "Mensagem enviada com sucesso!" });

    } catch (apiError) {
        // 4. Tratamento de Erro
        console.error("==================== ERRO NO ENVIO ====================");
        console.error(`[ERROR] Mensagem: ${apiError.message}`);
        
        let detalheErro = apiError.message;
        
        if (apiError.response) {
            console.error(`[ERROR] Status da resposta: ${apiError.response.status}`);
            console.error(`[ERROR] Dados da resposta:`, JSON.stringify(apiError.response.data));
            detalheErro = apiError.response.data;
        } else if (apiError.request) {
             console.error(`[ERROR] Nenhuma resposta recebida do servidor.`);
        }

        console.log("[DEBUG] Controller: Salvando log de ERRO no MongoDB...");
        const logErro = {
            codigoReceita: Number(codigoReceita),
            nomeCliente: nomeCliente,
            telefoneEnviado: numeroFormatado,
            status: "erro",
            detalheErro: detalheErro,
            timestamp: new Date()
        };
        await mongoService.logToMongo(logErro);
        console.log("[DEBUG] Controller: Log de erro salvo.");

        res.status(500).json({ status: "erro", mensagem: "Falha na comunicação com o servidor de envio." });
    } finally {
        console.log("==================================================");
    }
}

module.exports = {
    sendMessage
};