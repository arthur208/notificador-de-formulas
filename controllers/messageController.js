const firebirdService = require('../services/firebirdService');
const mongoService = require('../services/mongoService');
const whatsmeowService = require('../services/whatsmeowService');
const templateService = require('../services/templateService');
const { formatPhoneNumber, getSaudacao, toTitleCase } = require('../utils/helpers');
const { renderizar, VariavelAusenteError } = require('../utils/template');
const { montarEndereco } = require('../utils/endereco');
const cidadeService = require('../services/cidadeService');

// Monta a mensagem no MOMENTO DO ENVIO. Antes ela era montada na busca,
// então quem buscasse 11h58 e enviasse 12h05 mandava "Bom dia" no almoço.
async function montarMensagem(codigoReceita, nomeCliente) {
    const { isDelivery, deliveryAddress } = await firebirdService.getDeliveryData(codigoReceita);
    const modalidade = isDelivery ? 'entrega' : 'retirada';

    // Loanda tem texto próprio (decisão D11). O mecanismo é override por
    // cidade: hoje só ela usa, mas qualquer cidade pode ganhar o seu.
    const prazo = isDelivery ? await cidadeService.resolverPrazo(deliveryAddress?.codigoCid) : null;
    const template = await templateService.carregarTemplate(prazo?.templateId || modalidade);

    const valores = {
        saudacao: getSaudacao(),
        nome: toTitleCase(nomeCliente),
        codigo: codigoReceita,
        qtdFormulas: await firebirdService.contarFormulas(codigoReceita),
        endereco: montarEndereco(deliveryAddress) || undefined,
        cidade: deliveryAddress?.cidade || undefined,
        // Cidade não cadastrada deixa {{dias}} ausente de propósito:
        // o template que promete prazo falha e avisa, em vez de inventar.
        dias: prazo?.dias,
    };

    return { texto: renderizar(template.corpo, valores), modalidade };
}

async function sendMessage(req, res) {
    const { codigoReceita, telefoneEscolhido, mensagem, nomeCliente } = req.body;

    const numeroFormatado = formatPhoneNumber(telefoneEscolhido);
    if (!numeroFormatado) {
        return res.status(400).json({
            status: 'erro',
            mensagem: 'Número de telefone inválido ou incompleto. Verifique se possui DDD.',
        });
    }

    let textoFinal = mensagem;
    try {
        // Texto editado pela atendente vence o template. Sem edição, monta agora.
        if (!textoFinal || textoFinal.trim() === '') {
            ({ texto: textoFinal } = await montarMensagem(codigoReceita, nomeCliente));
        }
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
        await whatsmeowService.enviarTexto({ numero: numeroFormatado, mensagem: textoFinal });

        await mongoService.logToMongo({
            codigoReceita: Number(codigoReceita),
            nomeCliente,
            telefoneEnviado: numeroFormatado,
            mensagem: textoFinal,
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
