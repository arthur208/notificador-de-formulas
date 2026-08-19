const firebirdService = require('./firebirdService');
const templateService = require('./templateService');
const { getSaudacao, toTitleCase } = require('../utils/helpers');
const { renderizar } = require('../utils/template');
const { montarEndereco } = require('../utils/endereco');
const { emDiasUteis } = require('../utils/prazo');
const cidadeService = require('./cidadeService');
const convenioService = require('./convenioService');

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

// Interruptor geral do canal: desliga botões em todas as modalidades sem
// apagar as definições. Aplicado aqui, e não no envio, para a prévia da
// tela e a mensagem enviada não poderem divergir.
async function botoesLigados() {
    // Desligado no código enquanto o endpoint do provedor está quebrado;
    // ver o comentário em templateService.BOTOES_DISPONIVEIS.
    if (!templateService.BOTOES_DISPONIVEIS) return false;
    try {
        const canal = await require('./canalConfigService').carregarCanal();
        return canal?.botoesAtivos === true;
    } catch (erro) {
        console.error('Não foi possível ler a configuração do canal:', erro.message);
        return false;
    }
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
            botoes: (await botoesLigados()) ? montarBotoes(template.botoes, valores) : null,
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
        botoes: (await botoesLigados()) ? montarBotoes(template.botoes, valores) : null,
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

    return definicoes.slice(0, 3).map((definicao, indice) => {
        const botao = { title: renderizar(definicao.title, valores), type: definicao.type };
        // A API exige `id` em TODO tipo de botão, não só no reply como diz
        // o OpenAPI: cta_call sem id volta 400 "buttons[0].id is a required
        // field". Medido contra a API real.
        botao.id = definicao.id || `botao_${indice + 1}`;
        if (definicao.type === 'cta_url') botao.url = renderizar(definicao.url, valores);
        if (definicao.type === 'cta_call') botao.phone_number = definicao.phone_number;
        if (definicao.type === 'cta_copy') botao.copy_code = renderizar(definicao.copy_code, valores);
        return botao;
    });
}


module.exports = { montarMensagem, montarBotoes, comCabecalho, escolherModalidade };
