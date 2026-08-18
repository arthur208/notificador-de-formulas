'use strict';

const PADRAO_VARIAVEL = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

class VariavelAusenteError extends Error {
    constructor(faltando) {
        super(`Variáveis sem valor no template: ${faltando.join(', ')}`);
        this.name = 'VariavelAusenteError';
        this.faltando = faltando;
    }
}

function variaveisUsadas(texto) {
    const nomes = new Set();
    for (const achado of String(texto ?? '').matchAll(PADRAO_VARIAVEL)) {
        nomes.add(achado[1]);
    }
    return [...nomes];
}

function ausente(valor) {
    return valor === undefined || valor === null || valor === '';
}

// Renderiza ou falha. Não existe meio-termo: mandar "{{local}}" literal
// para o cliente é pior do que não mandar nada.
function renderizar(texto, valores) {
    const faltando = variaveisUsadas(texto).filter((nome) => ausente(valores[nome]));
    if (faltando.length > 0) throw new VariavelAusenteError(faltando);
    return String(texto).replace(PADRAO_VARIAVEL, (_, nome) => String(valores[nome]));
}

module.exports = { renderizar, variaveisUsadas, VariavelAusenteError };
