// Carrega as variáveis de ambiente (do .env)
require('dotenv').config(); 

const express = require('express');
const cors = require('cors');
const Firebird = require('node-firebird');
const axios = require('axios');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = 80;

// --- Configurações dos Bancos ---
const fbOptions = {
    host: process.env.FB_HOST,
    port: process.env.FB_PORT || 3050,
    database: process.env.FB_DB_PATH,
    user: process.env.FB_USER,
    password: process.env.FB_PASS,
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

// Pool de conexões
const pool = Firebird.pool(10, fbOptions);

// Configs do MongoDB
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
let logsCollection;

// --- Middlewares ---
app.use(cors()); 
app.use(express.json()); 
app.use(express.static('public'));

// --- Funções Auxiliares ---
function getSaudacao() {
    const hora = new Date().getHours();
    if (hora < 12) return "Bom dia";
    if (hora < 18) return "Boa tarde";
    return "Boa noite";
}

function toTitleCase(str) {
    if (!str) return "";
    const exceptions = ['da', 'de', 'do', 'das', 'dos', 'e'];
    return str.toLowerCase().split(' ').map((word, index) => {
        if (exceptions.includes(word) && index > 0) {
            return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

// Função "Promisify" para o Firebird (torna o async/await possível)
function queryDB(sql, params) {
    return new Promise((resolve, reject) => {
        pool.get((err, db) => {
            if (err) {
                console.error("Erro ao pegar conexão do pool Firebird:", err);
                return reject(new Error("Erro ao conectar ao DB."));
            }
            
            db.query(sql, params, (err, result) => {
                db.detach(); // Devolve a conexão ao pool
                if (err) {
                    console.error("Erro na query Firebird:", err);
                    return reject(err);
                }
                resolve(result); // Sucesso
            });
        });
    });
}

// Função de decodificação corrigida e mais robusta
function decodeFBString(field) {
    if (field === null || typeof field === 'undefined') return null;

    // Se for um Buffer (campos CHAR/VARCHAR antigos)
    if (Buffer.isBuffer(field)) {
        return field.toString('utf-8').trim();
    }
    
    // Se for Número ou String (campos NUMERIC, INT, ou VARCHAR >= 3)
    return field.toString().trim();
}


// --- Rotas da API ---

// Rota 1: Buscar Cliente
app.get('/api/cliente/:codigo', async (req, res) => {
    const codigoReceita = req.params.codigo;
    console.log(`Buscando (MODO COMPLETO) para receita: ${codigoReceita}`);

    try {
        // --- Consulta 1: Log de Envio (MongoDB) ---
        let logSucessoExistente;
        try {
            logSucessoExistente = await logsCollection.findOne({ 
                codigoReceita: Number(codigoReceita),
                status: "sucesso"
            });
        } catch (mongoErr) {
            console.error("Erro ao checar log no MongoDB:", mongoErr);
        }

        // --- Consulta 2: Dados Principais (Cliente + Telefones) ---
        // MUDANÇA AQUI: Trocado 'INNER JOIN' por 'LEFT JOIN' na T3 (PESSOASFONE)
        const sqlPrincipal = `
            SELECT T2.NOME, T3.FONERES, T3.FONECEL, T3.FONECOM, T3.FONEREC
            FROM RECCLIENTE T1
            INNER JOIN PESSOAS T2 ON T1.CODIGOPES = T2.CODIGOPES
            LEFT JOIN PESSOASFONE T3 ON T2.CODIGOPES = T3.CODIGOPES
            WHERE T1.CODIGOREC = ?;
        `;
        // FIM DA MUDANÇA
        
        const mainResult = await queryDB(sqlPrincipal, [codigoReceita]);

        if (!mainResult || mainResult.length === 0) {
            return res.status(404).json({ erro: "Cliente não encontrado." });
        }

        const dbRow = mainResult[0];
        const nomeFormatado = toTitleCase(decodeFBString(dbRow.NOME));
        
        const dadosCliente = {
            nome: nomeFormatado,
            // A função decodeFBString já trata os 'null' que virão do LEFT JOIN
            telefones: {
                FONERES: decodeFBString(dbRow.FONERES),
                FONECEL: decodeFBString(dbRow.FONECEL),
                FONECOM: decodeFBString(dbRow.FONECOM),
                FONEREC: decodeFBString(dbRow.FONEREC)
            }
        };
        
        // --- Consulta 3: Checar se é Entrega (RECROMANEIO) ---
        const sqlCheckEntrega = `SELECT T1.CODIGOR FROM RECROMANEIO T1 WHERE T1.CODIGOREC = ?`;
        const entregaResult = await queryDB(sqlCheckEntrega, [codigoReceita]);

        const codigor = (entregaResult && entregaResult.length > 0) ? decodeFBString(entregaResult[0].CODIGOR) : null;

        let isDelivery = false;
        let deliveryAddress = null;
        let mensagemSugerida = "";
        const saudacao = getSaudacao();

        // --- LÓGICA CONDICIONAL: SE FOR ENTREGA ---
        if (codigor) {
            isDelivery = true;
            console.log(`Receita ${codigoReceita} é uma entrega (CODIGOR: ${codigor}). Buscando endereço...`);

            // --- Consulta 4: Buscar Endereço (ROMANEIO) ---
            const sqlEndereco = `SELECT T1.ENDERECO, T1.NUMERO, T1.BAIRRO, T1.CEP FROM ROMANEIO T1 WHERE T1.CODIGOR = ?`;
            const enderecoResult = await queryDB(sqlEndereco, [codigor]);
            
            if (enderecoResult && enderecoResult.length > 0) {
                const dbAddr = enderecoResult[0];
                deliveryAddress = {
                    endereco: decodeFBString(dbAddr.ENDERECO),
                    numero: decodeFBString(dbAddr.NUMERO),
                    bairro: decodeFBString(dbAddr.BAIRRO),
                    cep: decodeFBString(dbAddr.CEP),
                    cidade: null,
                    estado: null
                };

                // --- Consulta 5: API ViaCEP (Externa) ---
                if (deliveryAddress.cep) {
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
            }

            let fullAddress = `${deliveryAddress.endereco || ''}, ${deliveryAddress.numero || ''} - ${deliveryAddress.bairro || ''}`;
            if(deliveryAddress.cidade) {
                fullAddress += ` / ${deliveryAddress.cidade} (${deliveryAddress.estado})`;
            }

            // Mensagem de ENTREGA
            mensagemSugerida = `${saudacao}, ${nomeFormatado}! 👋\n\nA Farmácia Bioessência informa: Sua receita (Nº ${codigoReceita}) está pronta e será enviada para entrega. 🚚✅\n\nEndereço de destino:\n${fullAddress}\n\nFicamos à disposição!`;

        } else {
            // --- LÓGICA PADRÃO: SE FOR RETIRADA ---
            isDelivery = false;
            // Mensagem de RETIRADA
            mensagemSugerida = `${saudacao}, ${nomeFormatado}! 👋\n\nA Farmácia Bioessência informa: Sua receita (Nº ${codigoReceita}) está pronta para retirada em nossa loja. 💊✅\n\nFicamos à disposição e aguardamos sua visita!`;
        }

        // --- Resposta Final ---
        res.json({
            dadosCliente: dadosCliente,
            mensagemSugerida: mensagemSugerida,
            jaEnviado: (logSucessoExistente !== null),
            isDelivery: isDelivery,
            deliveryAddress: deliveryAddress
        });

    } catch (error) {
        console.error("Erro fatal na Rota 1:", error);
        res.status(500).json({ erro: "Erro interno do servidor ao processar a receita." });
    }
});

// Rota 2: Enviar a Mensagem
app.post('/api/enviar', async (req, res) => {
    const { codigoReceita, telefoneEscolhido, mensagem, nomeCliente } = req.body;

    console.log("Recebida ordem de envio REAL (sem bloqueio):");
    
    try {
        console.log(`Enviando para API: ${telefoneEscolhido}`);
        
        await axios.post(process.env.API_URL, 
            {
                number: telefoneEscolhido,
                body: mensagem
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.API_TOKEN}`
                }
            }
        );

        console.log("Sucesso na API. Logando no MongoDB...");
        const logSucesso = {
            codigoReceita: Number(codigoReceita),
            nomeCliente: nomeCliente,
            telefoneEnviado: telefoneEscolhido,
            mensagem: mensagem,
            status: "sucesso",
            timestamp: new Date()
        };
        await logsCollection.insertOne(logSucesso);
        
        res.json({ status: "sucesso", mensagem: "Mensagem enviada e logada." });

    } catch (apiError) {
        console.error("Falha ao enviar pela API:", apiError.response ? apiError.response.data : apiError.message);

        const logErro = {
            codigoReceita: Number(codigoReceita),
            nomeCliente: nomeCliente,
            telefoneEnviado: telefoneEscolhido,
            status: "erro",
            detalheErro: apiError.response ? apiError.response.data : apiError.message,
            timestamp: new Date()
        };
        
        try {
            await logsCollection.insertOne(logErro);
        } catch (mongoErr) {
            console.error("Falha ao logar o ERRO no MongoDB:", mongoErr);
        }
        
        res.status(500).json({ status: "erro", mensagem: "Falha na API de envio. (Log de erro registrado)" });
    }
});

// Rota 3 - Buscar Logs de Envio (COM FILTRO DE PERÍODO)
app.get('/api/logs', async (req, res) => {
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

        const logs = await logsCollection.find(query)
            .sort({ timestamp: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray();
        
        const totalLogs = await logsCollection.countDocuments(query);
        const hasMore = (page * limit) < totalLogs;

        res.json({ logs: logs, hasMore: hasMore });

    } catch (err) {
        console.error("Erro ao buscar logs:", err);
        res.status(500).json({ erro: "Falha ao consultar histórico." });
    }
});

// --- Iniciar o Servidor ---
async function startServer() {
    try {
        await mongoClient.connect();
        db = mongoClient.db(process.env.MONGO_DB_NAME);
        logsCollection = db.collection("logs_envio");
        console.log("Conectado ao MongoDB com sucesso!");

        app.listen(PORT, () => {
            console.log(`Servidor rodando em http://localhost:${PORT}`);
            console.log("Tentando conectar ao Firebird em:", fbOptions.host);
        });

    } catch (err) {
        console.error("Falha fatal ao conectar ao MongoDB. Servidor não iniciado.");
        console.error(err);
        process.exit(1);
    }
}

// Inicia tudo
startServer();