const { getDb } = require('../config/db');
const whatsmeowService = require('./whatsmeowService');
const { formatPhoneNumber } = require('../utils/helpers');

const COLECAO = 'numeros_validados';

// Cliente que troca de WhatsApp é raro; a atendente reabrir a mesma receita
// é comum. Sem cache, cada abertura de tela gastaria 4 chamadas na API.
const VALIDADE_DIAS = 30;

function colecao() {
    return getDb().collection(COLECAO);
}

async function garantirIndices() {
    await colecao().createIndex({ numero: 1 }, { unique: true });
}

function estaFresco(doc) {
    if (!doc?.validadoEm) return false;
    const idadeMs = Date.now() - new Date(doc.validadoEm).getTime();
    return idadeMs < VALIDADE_DIAS * 24 * 60 * 60 * 1000;
}

// A chave do cache é o número já normalizado pelo nosso lado. Sem isto,
// "(44) 99113-5801" e "44991135801" ocupariam entradas diferentes.
// Null aqui significa o mesmo que no envio: número que não dá para usar.
function chave(numero) {
    return formatPhoneNumber(numero);
}

// Nunca lança: a validação é conveniência de tela. API fora do ar devolve
// "desconhecido", e a atendente segue podendo enviar — antes disso ela
// enviava sem informação nenhuma.
async function validar(numero, { forcar = false } = {}) {
    const original = String(numero ?? '').trim();
    const normalizado = chave(original);

    if (!normalizado) {
        return { numero: original, situacao: 'invalido', numeroEnvio: null };
    }

    if (!forcar) {
        try {
            const doc = await colecao().findOne({ numero: normalizado });
            if (estaFresco(doc)) {
                return {
                    numero: original,
                    situacao: doc.existe ? 'tem' : 'nao_tem',
                    numeroEnvio: doc.numeroFormatado,
                    nomeVerificado: doc.nomeVerificado ?? null,
                    doCache: true,
                };
            }
        } catch (erro) {
            console.error('Cache de números indisponível:', erro.message);
        }
    }

    let resultado;
    try {
        resultado = await whatsmeowService.validarNumero(normalizado);
    } catch (erro) {
        console.error(`Falha ao validar ${normalizado}:`, erro.message);
        return { numero: original, situacao: 'desconhecido', numeroEnvio: normalizado };
    }

    try {
        await colecao().updateOne(
            { numero: normalizado },
            {
                $set: {
                    numero: normalizado,
                    existe: resultado.existe,
                    numeroFormatado: resultado.numeroFormatado,
                    nomeVerificado: resultado.nomeVerificado,
                    validadoEm: new Date(),
                },
            },
            { upsert: true }
        );
    } catch (erro) {
        console.error('Não foi possível gravar o cache de número:', erro.message);
    }

    return {
        numero: original,
        situacao: resultado.existe ? 'tem' : 'nao_tem',
        numeroEnvio: resultado.numeroFormatado,
        nomeVerificado: resultado.nomeVerificado,
        doCache: false,
    };
}

// Em paralelo: são no máximo 4 números por receita, e em série a tela
// esperaria a soma dos tempos.
async function validarVarios(numeros, opcoes) {
    const unicos = [...new Set((numeros ?? []).map((n) => String(n ?? '').trim()).filter(Boolean))];
    return Promise.all(unicos.map((n) => validar(n, opcoes)));
}

module.exports = { validar, validarVarios, garantirIndices, VALIDADE_DIAS };
