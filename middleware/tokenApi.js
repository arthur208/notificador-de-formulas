const crypto = require('node:crypto');
const { config } = require('../config/db');
const limite = require('../utils/limiteTentativas');

// Autenticação das rotas de integração. Separada da sessão de propósito:
// aqui quem chama é máquina, e máquina não tem cookie nem navegador.
//
// O token é a própria APP_CRYPTO_KEY. Se um dia convier separar os dois
// segredos, basta definir API_TOKEN no .env — o resto continua igual.
function tokenEsperado() {
    const valor = (process.env.API_TOKEN || config.chaveCripto || '').trim();
    return valor === '' ? null : valor;
}

// Tempo constante: comparar com === diria, pelo tempo de resposta, quantos
// caracteres do começo estão certos.
function confere(recebido, esperado) {
    const a = Buffer.from(String(recebido));
    const b = Buffer.from(esperado);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function exigirToken(req, res, next) {
    const esperado = tokenEsperado();
    if (!esperado) {
        console.error('Integração sem token configurado: APP_CRYPTO_KEY vazia.');
        return res.status(500).json({ erro: 'Integração não configurada no servidor.' });
    }

    const cabecalho = req.get('authorization') ?? '';
    const separador = cabecalho.indexOf(' ');
    const esquema = separador < 0 ? '' : cabecalho.slice(0, separador);
    // Fatiado, e não split: a chave é base64 e pode conter espaço nenhum,
    // mas dividir por espaço quebraria qualquer token que tivesse.
    const valor = separador < 0 ? '' : cabecalho.slice(separador + 1).trim();

    if (!valor || esquema.toLowerCase() !== 'bearer') {
        return res.status(401).json({ erro: 'Informe o token: Authorization: Bearer <token>.' });
    }

    // Mesmo freio do login. Sem ele, nada impediria tentativa em série.
    const espera = limite.bloqueadoPor('integracao', req.ip);
    if (espera > 0) {
        return res.status(429).json({
            erro: `Muitas tentativas. Tente de novo em ${Math.ceil(espera / 60)} minuto(s).`,
        });
    }

    if (!confere(valor, esperado)) {
        limite.registrarFalha('integracao', req.ip);
        return res.status(401).json({ erro: 'Token inválido.' });
    }

    limite.registrarSucesso('integracao', req.ip);
    next();
}

module.exports = { exigirToken };
