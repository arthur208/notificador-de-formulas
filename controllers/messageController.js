const axios = require('axios');
const postgresService = require('../services/postgresService');
const mongoService = require('../services/mongoService');

async function sendMessage(req, res) {
    const { codigoReceita, telefoneEscolhido, mensagem, nomeCliente } = req.body;

    let apiToken;
    try {
        // 1. Busca o token no PostgreSQL
        apiToken = await postgresService.getApiToken();
        
        if (!apiToken) {
            return res.status(500).json({ status: "erro", mensagem: "Token padrão (CompanyID=9) não encontrado no banco de dados." });
        }
    } catch (dbError) {
        return res.status(500).json({ status: "erro", mensagem: "Erro ao consultar token no banco de dados." });
    }

    console.log(`Recebida ordem de envio para: ${telefoneEscolhido}`);
    
    try {
        // 2. Tenta enviar a mensagem usando o token
        await axios.post(process.env.API_URL, 
            {
                number: telefoneEscolhido,
                body: mensagem
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiToken}` // Usa o token do PG
                }
            }
        );

        // 3. Loga o sucesso no MongoDB
        console.log("Sucesso na API. Logando no MongoDB...");
        const logSucesso = {
            codigoReceita: Number(codigoReceita),
            nomeCliente: nomeCliente,
            telefoneEnviado: telefoneEscolhido,
            mensagem: mensagem,
            status: "sucesso",
            timestamp: new Date()
        };
        await mongoService.logToMongo(logSucesso);
        
        res.json({ status: "sucesso", mensagem: "Mensagem enviada e logada." });

    } catch (apiError) {
        // 4. Loga o erro no MongoDB
        console.error("Falha ao enviar pela API:", apiError.response ? apiError.response.data : apiError.message);
        const logErro = {
            codigoReceita: Number(codigoReceita),
            nomeCliente: nomeCliente,
            telefoneEnviado: telefoneEscolhido,
            status: "erro",
            detalheErro: apiError.response ? apiError.response.data : apiError.message,
            timestamp: new Date()
        };
        await mongoService.logToMongo(logErro);
        
        res.status(500).json({ status: "erro", mensagem: "Falha na API de envio. (Log de erro registrado)" });
    }
}

module.exports = {
    sendMessage
};
