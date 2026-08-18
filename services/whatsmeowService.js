const axios = require('axios');
const { config } = require('../config/db');
const { carregarCanal } = require('./canalConfigService');

const TEMPO_LIMITE_MS = 20000;
const MARGEM_RENOVACAO_MS = 60000;
const MAX_BOTOES = 3;

const TIPOS_BOTAO = {
    reply: ['id'],
    cta_url: ['url'],
    cta_call: ['phone_number'],
    cta_copy: ['copy_code'],
};

let cacheToken = null; // { accessToken, refreshToken, expiraEm }

function _limparCacheToken() {
    cacheToken = null;
}

function http() {
    return axios.create({
        baseURL: config.multiatendBaseUrl,
        timeout: TEMPO_LIMITE_MS,
    });
}

async function obterAccessToken() {
    if (cacheToken && cacheToken.expiraEm - MARGEM_RENOVACAO_MS > Date.now()) {
        return cacheToken.accessToken;
    }

    const canal = await carregarCanal();
    if (!canal || !canal.ativo) {
        throw new Error('Canal de envio não configurado. Cadastre em Configurações.');
    }

    const corpo = cacheToken?.refreshToken
        ? { grant_type: 'refresh_token', refresh_token: cacheToken.refreshToken }
        : { grant_type: 'client_credentials', client_id: canal.clientId, client_secret: canal.clientSecret };

    try {
        const { data } = await http().post('/api/v1/auth/token', corpo);
        cacheToken = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            // Sem expires_in explícito, assume 30 minutos e renova cedo.
            expiraEm: Date.now() + (Number(data.expires_in) * 1000 || 1800000),
        };
        return cacheToken.accessToken;
    } catch (erro) {
        // Refresh vencido: limpa e tenta uma vez pelo caminho completo.
        if (cacheToken?.refreshToken) {
            cacheToken = null;
            return obterAccessToken();
        }
        throw new Error('Não foi possível autenticar na API de envio.');
    }
}

function validarBotoes(botoes) {
    if (!Array.isArray(botoes) || botoes.length === 0) {
        throw new Error('Informe ao menos um botão.');
    }
    if (botoes.length > MAX_BOTOES) {
        throw new Error(`O whatsmeow aceita no máximo 3 botões; recebeu ${botoes.length}.`);
    }
    for (const botao of botoes) {
        if (!botao.title) throw new Error('Todo botão precisa de title.');
        const exigidos = TIPOS_BOTAO[botao.type];
        if (!exigidos) throw new Error(`Tipo de botão desconhecido: ${botao.type}`);
        for (const campo of exigidos) {
            if (!botao[campo]) {
                throw new Error(`O botão do tipo ${botao.type} exige ${campo}.`);
            }
        }
    }
}

async function postarNaApi(caminho, corpo) {
    const [token, canal] = await Promise.all([obterAccessToken(), carregarCanal()]);
    const { data } = await http().post(
        caminho,
        { ...corpo, token: canal.token },
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return { ok: true, resposta: data };
}

function enviarTexto({ numero, mensagem }) {
    return postarNaApi('/api/v1/messages/whatsmeow/send', { number: numero, body: mensagem });
}

function enviarBotoes({ numero, titulo, corpo, botoes }) {
    validarBotoes(botoes);
    return postarNaApi('/api/v1/messages/whatsmeow/buttons', {
        number: numero, title: titulo, body: corpo, buttons: botoes,
    });
}

module.exports = { enviarTexto, enviarBotoes, validarBotoes, _limparCacheToken };
