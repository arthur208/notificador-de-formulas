'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// scrypt é nativo do Node. bcrypt e argon2 exigem node-gyp e quebram com
// frequência no Windows, que é o ambiente deste projeto.
// N=16384 leva ~50ms por verificação num servidor modesto — suficiente
// contra força bruta offline sem tornar o login lento.
const N = 16384;
const r = 8;
const p = 1;
const TAMANHO_HASH = 64;
const TAMANHO_SALT = 16;
const MINIMO_CARACTERES = 8;

async function gerarHash(senha) {
    if (typeof senha !== 'string' || senha.length === 0) {
        throw new Error('Informe a senha.');
    }
    if (senha.length < MINIMO_CARACTERES) {
        throw new Error('A senha precisa de pelo menos 8 caracteres.');
    }
    const salt = crypto.randomBytes(TAMANHO_SALT);
    const derivado = await scrypt(senha, salt, TAMANHO_HASH, { N, r, p });
    return ['scrypt', N, r, p, salt.toString('base64'), derivado.toString('base64')].join('$');
}

async function conferirSenha(senha, hashGuardado) {
    try {
        const partes = String(hashGuardado || '').split('$');
        if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

        const [, nGuardado, rGuardado, pGuardado, saltB64, hashB64] = partes;
        const salt = Buffer.from(saltB64, 'base64');
        const esperado = Buffer.from(hashB64, 'base64');

        const derivado = await scrypt(String(senha), salt, esperado.length, {
            N: Number(nGuardado), r: Number(rGuardado), p: Number(pGuardado),
        });

        // Tempo constante: comparar com === vazaria informação pelo tempo.
        return crypto.timingSafeEqual(derivado, esperado);
    } catch {
        return false;
    }
}

module.exports = { gerarHash, conferirSenha };
