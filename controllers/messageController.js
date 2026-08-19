const mongoService = require('../services/mongoService');
const whatsmeowService = require('../services/whatsmeowService');
const templateService = require('../services/templateService');
const { formatPhoneNumber } = require('../utils/helpers');
const { VariavelAusenteError } = require('../utils/template');
const { montarMensagem, comCabecalho } = require('../services/mensagemService');

async function sendMessage(req, res) {
    const { codigoReceita, telefoneEscolhido, mensagem, nomeCliente, convenioTs } = req.body;

    const numeroFormatado = formatPhoneNumber(telefoneEscolhido);
    if (!numeroFormatado) {
        return res.status(400).json({
            status: 'erro',
            mensagem: 'Número de telefone inválido ou incompleto. Verifique se possui DDD.',
        });
    }

    let textoFinal = mensagem;
    let botoes = null;
    let cabecalho = '';
    try {
        // Sempre monta: mesmo com o texto editado pela atendente, botões e
        // cabeçalho vêm do template — ela edita a mensagem, não a estrutura.
        const montada = await montarMensagem(codigoReceita, nomeCliente, convenioTs);
        botoes = montada.botoes;
        cabecalho = montada.cabecalho;
        if (!textoFinal || textoFinal.trim() === '') textoFinal = montada.texto;
    } catch (erro) {
        if (erro instanceof VariavelAusenteError) {
            return res.status(422).json({
                status: 'erro',
                mensagem: `O template está incompleto: ${erro.faltando.join(', ')}. Ajuste em Configurações.`,
            });
        }
        console.error('Erro ao montar a mensagem:', erro);
        return res.status(500).json({ status: 'erro', mensagem: 'Não foi possível montar a mensagem.' });
    }

    try {
        // O que de fato saiu, para o log conferir com o que o cliente viu.
        let textoEnviado = textoFinal;

        if (botoes && botoes.length > 0) {
            await whatsmeowService.enviarBotoes({
                numero: numeroFormatado,
                // `title` é obrigatório no endpoint de botões.
                titulo: cabecalho?.trim() || templateService.CABECALHO_PADRAO,
                corpo: textoFinal,
                botoes,
            });
        } else {
            textoEnviado = comCabecalho(cabecalho, textoFinal);
            await whatsmeowService.enviarTexto({ numero: numeroFormatado, mensagem: textoEnviado });
        }

        await mongoService.logToMongo({
            codigoReceita: Number(codigoReceita),
            nomeCliente,
            telefoneEnviado: numeroFormatado,
            mensagem: textoEnviado,
            cabecalho: cabecalho?.trim() || null,
            status: 'sucesso',
            timestamp: new Date(),
        });

        res.json({ status: 'sucesso', mensagem: 'Mensagem enviada.' });
    } catch (erro) {
        console.error('Falha no envio:', erro.message);

        await mongoService.logToMongo({
            codigoReceita: Number(codigoReceita),
            nomeCliente,
            telefoneEnviado: numeroFormatado,
            status: 'erro',
            detalheErro: erro.response?.data ?? erro.message,
            timestamp: new Date(),
        });

        res.status(502).json({
            status: 'erro',
            mensagem: 'Falha na comunicação com o servidor de envio.',
        });
    }
}

module.exports = { sendMessage };
