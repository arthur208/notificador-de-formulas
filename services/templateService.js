const { getDb } = require('../config/db');
const { variaveisUsadas } = require('../utils/template');

const COLECAO = 'templates';
const MAX_BOTOES = 3;

// O endpoint de botões exige `title`. Se o cabeçalho do template estiver
// vazio, é este que vai — nunca deixamos o envio falhar por falta dele.
const CABECALHO_PADRAO = 'Farmácia Bioessência Informa:';

// ---------------------------------------------------------------------
// Botões desligados em 19/08/2026.
//
// O endpoint /api/v1/messages/whatsmeow/buttons da MultiAtend devolve 500
// "Internal server error" para qualquer botão — reply, cta_call, cta_copy,
// com id ou sem, um ou três, corpo curto ou longo. Confirmado aqui e pelo
// cliente no Postman. O endpoint de texto responde 200 na mesma conexão,
// então o problema é do provedor, não da nossa chamada.
//
// Nada foi removido: definições, montagem, validação, envio e a queda para
// texto continuam no lugar e testados. Esta constante só esconde a opção
// das telas e impede o envio de tentar. Para religar quando eles
// consertarem, basta trocar para true.
// ---------------------------------------------------------------------
const BOTOES_DISPONIVEIS = false;

// O clique do cliente abre atendimento no MultiAtendWeb; este sistema não
// lê a resposta (decisão D8). Os ids existem para o bot decidir depois.
const BOTAO_CONFIRMAR = { type: 'reply', id: 'confirmar', title: 'Confirmar' };
const BOTAO_ENDERECO = { type: 'reply', id: 'endereco_errado', title: 'Endereço Errado' };

// Limite não documentado pelo fornecedor. O WhatsApp corta cabeçalho longo
// na exibição; o número vem da API oficial e serve como aviso, não trava.
const CABECALHO_RECOMENDADO = 60;

// Fallback embutido: se a coleção estiver vazia ou o documento quebrado,
// o sistema continua enviando com o texto que já usava.
const TEMPLATES_PADRAO = {
    retirada: {
        cabecalho: CABECALHO_PADRAO,
        botoes: [BOTAO_CONFIRMAR],
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'Sua receita (Nº {{codigo}}) está pronta ' +
            'para retirada em nossa loja. 💊✅\n\n' +
            'Ficamos à disposição e aguardamos sua visita!',
    },
    entrega: {
        cabecalho: CABECALHO_PADRAO,
        botoes: [BOTAO_CONFIRMAR, BOTAO_ENDERECO],
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'Sua receita (Nº {{codigo}}) está pronta ' +
            'e será enviada para entrega em {{cidade}}. 🚚✅\n\n' +
            'Previsão de entrega: {{dias}}.\n\n' +
            'Endereço de destino:\n{{endereco}}\n\nFicamos à disposição!',
    },
    // Cidade sem prazo cadastrado. Não promete data — é o único texto de
    // entrega que pode sair para as 47 cidades ainda não cadastradas.
    entrega_sem_prazo: {
        cabecalho: CABECALHO_PADRAO,
        botoes: [BOTAO_CONFIRMAR, BOTAO_ENDERECO],
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'Sua receita (Nº {{codigo}}) está pronta ' +
            'e será enviada para entrega. 🚚✅\n\n' +
            'Endereço de destino:\n{{endereco}}\n\n' +
            'Assim que sair para entrega avisamos por aqui. Ficamos à disposição!',
    },
    entrega_local: {
        cabecalho: CABECALHO_PADRAO,
        botoes: [BOTAO_CONFIRMAR, BOTAO_ENDERECO],
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'Sua receita (Nº {{codigo}}) está pronta ' +
            'e sai hoje para entrega aqui em {{cidade}}. 🚚✅\n\n' +
            'Endereço de destino:\n{{endereco}}\n\nFicamos à disposição!',
    },
    convenio: {
        cabecalho: CABECALHO_PADRAO,
        botoes: [BOTAO_CONFIRMAR, BOTAO_ENDERECO],
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'Sua receita (Nº {{codigo}}) foi enviada ' +
            'e estará disponível para retirada {{local}} em {{dias}}. 💊✅\n\n' +
            'Ficamos à disposição!',
    },
};

const VARIAVEIS_GLOBAIS = ['saudacao', 'nome', 'codigo', 'qtdFormulas'];

const VARIAVEIS_POR_MODALIDADE = {
    retirada: [],
    entrega: ['endereco', 'cidade', 'dias'],
    // Sem 'dias' de propósito: esta modalidade existe justamente porque a
    // cidade não tem prazo. Oferecer a variável só criaria o 422.
    entrega_sem_prazo: ['endereco', 'cidade'],
    // Entrega local sai no mesmo dia — o prazo cadastrado é ignorado.
    entrega_local: ['endereco', 'cidade'],
    convenio: ['local', 'dias'],
};

// Devolve as variáveis citadas que a modalidade não oferece.
// Vazio significa que o template pode ser salvo.
function validarTemplate(modalidade, corpo, extras = [], botoes = [], cabecalho = '') {
    const disponiveis = VARIAVEIS_POR_MODALIDADE[modalidade];
    if (!disponiveis) throw new Error(`Modalidade desconhecida: ${modalidade}`);

    const permitidas = new Set([...VARIAVEIS_GLOBAIS, ...disponiveis, ...extras]);

    // Cabeçalho e campos de texto do botão aceitam as mesmas variáveis do
    // corpo: um botão "Copiar {{codigo}}" precisa render igual.
    const textos = [corpo, cabecalho ?? ''];
    for (const botao of botoes ?? []) {
        textos.push(botao.title ?? '', botao.url ?? '', botao.copy_code ?? '');
    }

    const usadas = new Set();
    for (const texto of textos) for (const nome of variaveisUsadas(texto)) usadas.add(nome);
    return [...usadas].filter((nome) => !permitidas.has(nome));
}

async function carregarTemplate(modalidade) {
    try {
        const doc = await getDb().collection(COLECAO).findOne({ modalidade });
        if (doc && typeof doc.corpo === 'string' && doc.corpo.trim() !== '') {
            return { cabecalho: doc.cabecalho ?? '', corpo: doc.corpo, botoes: doc.botoes ?? [] };
        }
    } catch (erro) {
        console.error(`Falha ao carregar o template "${modalidade}":`, erro.message);
    }
    return TEMPLATES_PADRAO[modalidade] || null;
}

async function salvarTemplate(modalidade, { cabecalho, corpo, botoes }) {
    await getDb().collection(COLECAO).updateOne(
        { modalidade },
        {
            $set: {
                modalidade, corpo,
                cabecalho: (cabecalho ?? '').trim(),
                botoes: Array.isArray(botoes) ? botoes.slice(0, MAX_BOTOES) : [],
                atualizadoEm: new Date(),
            },
            // `titulo` era rótulo interno que nunca saiu para o cliente;
            // o cabeçalho tomou o lugar dele.
            $unset: { titulo: '' },
            $inc: { versao: 1 },
        },
        { upsert: true }
    );
}

async function listarTemplates() {
    return getDb().collection(COLECAO).find({}).toArray();
}

module.exports = {
    carregarTemplate, salvarTemplate, listarTemplates, validarTemplate,
    TEMPLATES_PADRAO, VARIAVEIS_POR_MODALIDADE, VARIAVEIS_GLOBAIS, MAX_BOTOES,
    CABECALHO_PADRAO, CABECALHO_RECOMENDADO, BOTOES_DISPONIVEIS,
};
