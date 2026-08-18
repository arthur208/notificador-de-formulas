'use strict';

const FORMATO_ISO = /^\d{4}-\d{2}-\d{2}$/;

function doisDigitos(n) {
    return String(n).padStart(2, '0');
}

// Devolve a própria string quando é uma data real no formato AAAA-MM-DD,
// e null em qualquer outro caso. O null é o sinal para o controller
// responder 400 — nunca repassar entrada crua para a consulta.
function validarDataISO(valor) {
    if (typeof valor !== 'string' || !FORMATO_ISO.test(valor)) return null;
    const [ano, mes, dia] = valor.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    const confere =
        data.getUTCFullYear() === ano &&
        data.getUTCMonth() === mes - 1 &&
        data.getUTCDate() === dia;
    return confere ? valor : null;
}

function hojeISO(agora = new Date()) {
    return [
        agora.getFullYear(),
        doisDigitos(agora.getMonth() + 1),
        doisDigitos(agora.getDate()),
    ].join('-');
}

// A coluna HOTA de STATUSRECEITA é TIME; o driver devolve um Date
// posicionado na época com a hora local correta.
function formatarHora(valor) {
    if (!valor) return null;
    const data = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(data.getTime())) return null;
    return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
}

module.exports = { validarDataISO, hojeISO, formatarHora };
