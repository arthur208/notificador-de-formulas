'use strict';

// Cinco linhas em vez de mais uma dependência. O Express 5 não parseia
// cookies sozinho, e cookie-parser não paga o próprio custo aqui.
function lerCookies(cabecalho) {
    const resultado = {};
    if (typeof cabecalho !== 'string' || cabecalho === '') return resultado;

    for (const parte of cabecalho.split(';')) {
        const separador = parte.indexOf('=');
        if (separador < 1) continue;
        const nome = parte.slice(0, separador).trim();
        const valor = parte.slice(separador + 1).trim();
        try {
            resultado[nome] = decodeURIComponent(valor);
        } catch {
            resultado[nome] = valor;
        }
    }
    return resultado;
}

module.exports = { lerCookies };
