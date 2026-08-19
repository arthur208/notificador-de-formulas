const firebirdService = require('../services/firebirdService');
const mongoService = require('../services/mongoService');
const { montarEndereco } = require('../utils/endereco');
const { montarMensagem } = require('../services/mensagemService');
const { VariavelAusenteError } = require('../utils/template');
const convenioService = require('../services/convenioService');

async function getCliente(req, res) {
    const codigoReceita = req.params.codigo;

    try {
        const logSucessoExistente = await mongoService.checkExistingLog(codigoReceita);

        const clienteData = await firebirdService.getRecipeData(codigoReceita);
        if (!clienteData) {
            return res.status(404).json({ erro: 'Cliente não encontrado.' });
        }

        const { isDelivery, deliveryAddress } = await firebirdService.getDeliveryData(codigoReceita);

        // O ERP diz quais convênios o CLIENTE tem. Só entram como sugestão
        // os que têm configuração — a existência da config é a allowlist.
        const vinculos = await firebirdService.conveniosDoCliente(codigoReceita);
        const conveniosSugeridos = [];
        for (const vinculo of vinculos) {
            const config = await convenioService.buscarConfiguracao(vinculo.codigoTs);
            if (config) {
                conveniosSugeridos.push({
                    codigoTs: vinculo.codigoTs,
                    nome: vinculo.nome,
                    nomeExibicao: config.nomeExibicao,
                });
            }
        }

        // A sugestão sai do MESMO montador do envio. Antes vinha de texto
        // fixo aqui, então o template editado em Configurações não chegava
        // ao cliente: a tela mandava este texto, e o servidor o respeitava.
        let previa = null;
        let faltando = null;
        try {
            const montada = await montarMensagem(codigoReceita, clienteData.nome);
            previa = {
                texto: montada.texto,
                cabecalho: montada.cabecalho,
                botoes: montada.botoes ?? [],
                modalidade: montada.modalidade,
            };
        } catch (erro) {
            if (!(erro instanceof VariavelAusenteError)) throw erro;
            faltando = erro.faltando;
        }

        res.json({
            dadosCliente: clienteData,
            previa,
            faltando,
            jaEnviado: logSucessoExistente !== null,
            isDelivery,
            deliveryAddress,
            conveniosSugeridos,
        });
    } catch (erro) {
        console.error('Erro na rota /cliente:', erro);
        res.status(500).json({ erro: 'Erro interno do servidor ao processar a receita.' });
    }
}

// Só o texto, para a tela reagir quando a atendente marca um convênio:
// o convênio troca o template inteiro, e a prévia precisa acompanhar.
// O nome vem do banco, não do cliente HTTP — é ele que entra na mensagem.
async function getMensagem(req, res) {
    const codigoReceita = req.params.codigo;
    const convenioTs = req.query.convenioTs ? Number(req.query.convenioTs) : undefined;

    try {
        const clienteData = await firebirdService.getRecipeData(codigoReceita);
        if (!clienteData) return res.status(404).json({ erro: 'Cliente não encontrado.' });

        const montada = await montarMensagem(codigoReceita, clienteData.nome, convenioTs);
        res.json({
            texto: montada.texto,
            cabecalho: montada.cabecalho,
            botoes: montada.botoes ?? [],
            modalidade: montada.modalidade,
        });
    } catch (erro) {
        if (erro instanceof VariavelAusenteError) {
            return res.status(422).json({
                erro: `O template está incompleto: ${erro.faltando.join(', ')}.`,
                faltando: erro.faltando,
            });
        }
        console.error('Erro ao montar a prévia:', erro);
        res.status(500).json({ erro: 'Não foi possível montar a mensagem.' });
    }
}

module.exports = { getCliente, getMensagem };
