const firebirdService = require('../services/firebirdService');
const mongoService = require('../services/mongoService');
const whatsmeowService = require('../services/whatsmeowService');
const templateService = require('../services/templateService');
const { formatPhoneNumber, getSaudacao, toTitleCase } = require('../utils/helpers');
const { renderizar, VariavelAusenteError } = require('../utils/template');
const { montarEndereco } = require('../utils/endereco');
const { emDiasUteis } = require('../utils/prazo');
const cidadeService = require('../services/cidadeService');
const convenioService = require('../services/convenioService');

// Monta a mensagem no MOMENTO DO ENVIO. Antes ela era montada na busca,
// então quem buscasse 11h58 e enviasse 12h05 mandava "Bom dia" no almoço.
// Precedência (decisão D3): convênio sobrepõe cidade e a flag
// entrega/retirada. Justificativa do cliente: "se a pessoa é de Porto Rico
// e temos entrega em Porto Rico, mas ela pediu no convênio, entregamos
// no convênio".
// Cidade sem cadastro não ganha prazo genérico — a mensagem sai sem a
// promessa em vez de inventar uma. Como o template não tem condicional,
// isso exige um texto próprio: com {{dias}} no corpo, receita de cidade
// não cadastrada seria recusada com 422 em vez de sair sem o prazo.
function escolherModalidade(isDelivery, prazo) {
    if (!isDelivery) return 'retirada';
    if (!prazo) return 'entrega_sem_prazo';
    return prazo.local ? 'entrega_local' : 'entrega';
}

async function montarMensagem(codigoReceita, nomeCliente, convenioTs) {
    const comuns = {
        saudacao: getSaudacao(),
        nome: toTitleCase(nomeCliente),
        codigo: codigoReceita,
        qtdFormulas: await firebirdService.contarFormulas(codigoReceita),
    };

    if (convenioTs) {
        const config = await convenioService.buscarConfiguracao(convenioTs);
        if (!config) {
            throw new Error('Este convênio não está configurado. Cadastre em Configurações.');
        }
        const template = await templateService.carregarTemplate(config.templateId || 'convenio');
        const valores = { ...comuns, ...convenioService.variaveisDoConvenio(config) };
        return {
            texto: renderizar(template.corpo, valores),
            cabecalho: renderizar(template.cabecalho ?? '', valores),
            botoes: montarBotoes(template.botoes, valores),
            modalidade: 'convenio',
        };
    }

    const { isDelivery, deliveryAddress } = await firebirdService.getDeliveryData(codigoReceita);
    const prazo = isDelivery ? await cidadeService.resolverPrazo(deliveryAddress?.codigoCid) : null;
    const modalidade = escolherModalidade(isDelivery, prazo);
    const template = await templateService.carregarTemplate(modalidade);

    const valores = {
        ...comuns,
        endereco: montarEndereco(deliveryAddress) || undefined,
        cidade: deliveryAddress?.cidade || undefined,
        dias: emDiasUteis(prazo?.dias),
    };
    return {
        texto: renderizar(template.corpo, valores),
        cabecalho: renderizar(template.cabecalho ?? '', valores),
        botoes: montarBotoes(template.botoes, valores),
        modalidade,
    };
}

// O cabeçalho só existe como campo próprio na mensagem com botões: o
// endpoint de texto simples aceita apenas `body`. Sem botões, ele entra
// como primeira linha em negrito — que é como o WhatsApp desenha o
// cabeçalho de qualquer jeito.
function comCabecalho(cabecalho, texto) {
    const limpo = (cabecalho ?? '').trim();
    if (limpo === '') return texto;
    return `*${limpo}*\n\n${texto}`;
}

// Os botões saem da configuração do canal, com as mesmas variáveis do
// template. Só existem como formato visual: o clique do cliente vira
// ticket no MultiAtendWeb e é tratado por pessoa (decisão D8).
function montarBotoes(definicoes, valores) {
    if (!Array.isArray(definicoes) || definicoes.length === 0) return null;

    return definicoes.slice(0, 3).map((definicao) => {
        const botao = { title: renderizar(definicao.title, valores), type: definicao.type };
        if (definicao.type === 'reply') botao.id = definicao.id;
        if (definicao.type === 'cta_url') botao.url = renderizar(definicao.url, valores);
        if (definicao.type === 'cta_call') botao.phone_number = definicao.phone_number;
        if (definicao.type === 'cta_copy') botao.copy_code = renderizar(definicao.copy_code, valores);
        return botao;
    });
}

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
        // botoesAtivos no canal é o interruptor geral: permite desligar
        // botões em todas as modalidades de uma vez, sem apagar as definições.
        const canal = await require('../services/canalConfigService').carregarCanal();
        if (!canal?.botoesAtivos) botoes = null;

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

module.exports = { sendMessage, comCabecalho, escolherModalidade };
