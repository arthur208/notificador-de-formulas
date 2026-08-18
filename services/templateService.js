const { getDb } = require('../config/db');
const { variaveisUsadas } = require('../utils/template');

const COLECAO = 'templates';

// Fallback embutido: se a coleção estiver vazia ou o documento quebrado,
// o sistema continua enviando com o texto que já usava.
const TEMPLATES_PADRAO = {
    retirada: {
        titulo: 'Fórmula pronta',
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'A Farmácia Bioessência informa: Sua receita (Nº {{codigo}}) está pronta ' +
            'para retirada em nossa loja. 💊✅\n\n' +
            'Ficamos à disposição e aguardamos sua visita!',
    },
    entrega: {
        titulo: 'Fórmula a caminho',
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'A Farmácia Bioessência informa: Sua receita (Nº {{codigo}}) está pronta ' +
            'e será enviada para entrega. 🚚✅\n\n' +
            'Endereço de destino:\n{{endereco}}\n\nFicamos à disposição!',
    },
    convenio: {
        titulo: 'Fórmula no convênio',
        corpo:
            '{{saudacao}}, {{nome}}! 👋\n\n' +
            'A Farmácia Bioessência informa: Sua receita (Nº {{codigo}}) foi enviada ' +
            'e estará disponível para retirada {{local}} em {{dias}} dias úteis. 💊✅\n\n' +
            'Ficamos à disposição!',
    },
};

const VARIAVEIS_GLOBAIS = ['saudacao', 'nome', 'codigo', 'qtdFormulas'];

const VARIAVEIS_POR_MODALIDADE = {
    retirada: [],
    entrega: ['endereco', 'cidade', 'dias'],
    convenio: ['local', 'dias'],
};

// Devolve as variáveis citadas que a modalidade não oferece.
// Vazio significa que o template pode ser salvo.
function validarTemplate(modalidade, corpo, extras = []) {
    const disponiveis = VARIAVEIS_POR_MODALIDADE[modalidade];
    if (!disponiveis) throw new Error(`Modalidade desconhecida: ${modalidade}`);

    const permitidas = new Set([...VARIAVEIS_GLOBAIS, ...disponiveis, ...extras]);
    return variaveisUsadas(corpo).filter((nome) => !permitidas.has(nome));
}

async function carregarTemplate(modalidade) {
    try {
        const doc = await getDb().collection(COLECAO).findOne({ modalidade });
        if (doc && typeof doc.corpo === 'string' && doc.corpo.trim() !== '') {
            return { titulo: doc.titulo || '', corpo: doc.corpo };
        }
    } catch (erro) {
        console.error(`Falha ao carregar o template "${modalidade}":`, erro.message);
    }
    return TEMPLATES_PADRAO[modalidade] || null;
}

async function salvarTemplate(modalidade, { titulo, corpo }) {
    await getDb().collection(COLECAO).updateOne(
        { modalidade },
        { $set: { modalidade, titulo, corpo, atualizadoEm: new Date() }, $inc: { versao: 1 } },
        { upsert: true }
    );
}

async function listarTemplates() {
    return getDb().collection(COLECAO).find({}).toArray();
}

module.exports = {
    carregarTemplate, salvarTemplate, listarTemplates, validarTemplate,
    TEMPLATES_PADRAO, VARIAVEIS_POR_MODALIDADE, VARIAVEIS_GLOBAIS,
};
