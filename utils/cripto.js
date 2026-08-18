'use strict';

const crypto = require('node:crypto');

const ALGORITMO = 'aes-256-gcm';
const TAMANHO_IV = 12;
const TAMANHO_CHAVE = 32;

function obterChave(chaveBase64) {
    const chave = Buffer.from(String(chaveBase64 || ''), 'base64');
    if (chave.length !== TAMANHO_CHAVE) {
        throw new Error('A chave de cifragem deve ter 32 bytes codificados em base64.');
    }
    return chave;
}

// Formato do pacote: iv.tag.dados, todos em base64.
// GCM porque queremos detectar adulteração, não só confidencialidade.
function cifrar(texto, chaveBase64) {
    const chave = obterChave(chaveBase64);
    const iv = crypto.randomBytes(TAMANHO_IV);
    const cifra = crypto.createCipheriv(ALGORITMO, chave, iv);
    const dados = Buffer.concat([cifra.update(String(texto), 'utf8'), cifra.final()]);
    return [
        iv.toString('base64'),
        cifra.getAuthTag().toString('base64'),
        dados.toString('base64'),
    ].join('.');
}

function decifrar(pacote, chaveBase64) {
    const chave = obterChave(chaveBase64);
    const partes = String(pacote || '').split('.');
    if (partes.length !== 3) {
        throw new Error('Formato de valor cifrado inválido.');
    }
    const [iv, tag, dados] = partes;
    const decifra = crypto.createDecipheriv(ALGORITMO, chave, Buffer.from(iv, 'base64'));
    decifra.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
        decifra.update(Buffer.from(dados, 'base64')),
        decifra.final(),
    ]).toString('utf8');
}

function mascarar(valor) {
    const texto = String(valor || '');
    if (texto.length <= 4) return '••••';
    return '••••••••' + texto.slice(-4);
}

module.exports = { cifrar, decifrar, mascarar };
