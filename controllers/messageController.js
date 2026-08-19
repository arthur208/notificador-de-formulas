const mongoService = require('../services/mongoService');
const whatsmeowService = require('../services/whatsmeowService');
const templateService = require('../services/templateService');
const { formatPhoneNumber } = require('../utils/helpers');
const { VariavelAusenteError } = require('../utils/template');
const { montarMensagem, comCabecalho } = require('../services/mensagemService');
const numeroService = require('../services/numeroService');

async function sendMessage(req, res) {
    const { codigoReceita, telefoneEscolhido, mensagem, nomeCliente, convenioTs } = req.body;

    // Só recusa o que nem número é. A forma final NÃO vem daqui.
    if (!formatPhoneNumber(telefoneEscolhido)) {
        return res.status(400).json({
            status: 'erro',
            mensagem: 'Número de telefone inválido ou incompleto. Verifique se possui DDD.',
        });
    }

    // Quem decide o número é a API, não a nossa regra do 9º dígito.
    // Ela existe porque a maioria das linhas novas tem o 9, mas linha
    // antiga de 8 dígitos não tem — e para essas o número com 9 é aceito
    // pelo endpoint de envio (200) sem entregar a ninguém. Foi o que
    // aconteceu em 19/08/2026: três envios "com sucesso" que nunca
    // chegaram. A validação devolve a forma canônica e vem do cache na
    // maioria das vezes.
    const situacao = await numeroService.validar(telefoneEscolhido);
    const numeroFormatado = situacao.numeroEnvio || formatPhoneNumber(telefoneEscolhido);

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
        let semBotoes = false;
        let idMensagem = null;

        if (botoes && botoes.length > 0) {
            try {
                const envio = await whatsmeowService.enviarBotoes({
                    numero: numeroFormatado,
                    // `title` é obrigatório no endpoint de botões.
                    titulo: cabecalho?.trim() || templateService.CABECALHO_PADRAO,
                    corpo: textoFinal,
                    botoes,
                });
                idMensagem = envio?.resposta?.data?.messageId ?? null;
            } catch (erroBotoes) {
                // O endpoint de botões da MultiAtend devolveu 500 para todo
                // tipo de botão em 19/08/2026, com o de texto funcionando na
                // mesma conexão. Cliente avisado sem botão é melhor que
                // cliente não avisado — o texto é o mesmo, e o cabeçalho vira
                // primeira linha em negrito. Fica registrado no log.
                console.error('Botões recusados, caindo para texto:', erroBotoes.message);
                semBotoes = true;
                textoEnviado = comCabecalho(cabecalho, textoFinal);
                const envio = await whatsmeowService.enviarTexto({ numero: numeroFormatado, mensagem: textoEnviado });
                idMensagem = envio?.resposta?.data?.messageId ?? null;
            }
        } else {
            textoEnviado = comCabecalho(cabecalho, textoFinal);
            const envio = await whatsmeowService.enviarTexto({ numero: numeroFormatado, mensagem: textoEnviado });
            idMensagem = envio?.resposta?.data?.messageId ?? null;
        }

        await mongoService.logToMongo({
            codigoReceita: Number(codigoReceita),
            nomeCliente,
            telefoneEnviado: numeroFormatado,
            mensagem: textoEnviado,
            cabecalho: cabecalho?.trim() || null,
            // Guardado para conferir depois: "não chegou" precisa poder ser
            // rastreado até o identificador que a API devolveu.
            telefoneDigitado: telefoneEscolhido,
            idMensagem: idMensagem || undefined,
            // Registra a degradação: o histórico precisa dizer que o cliente
            // recebeu sem botão, senão vira mistério depois.
            botoesRecusados: semBotoes || undefined,
            status: 'sucesso',
            timestamp: new Date(),
        });

        res.json({
            status: 'sucesso',
            mensagem: semBotoes ? 'Mensagem enviada, mas sem os botões.' : 'Mensagem enviada.',
            semBotoes,
        });
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
