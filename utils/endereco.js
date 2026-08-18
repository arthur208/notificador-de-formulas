'use strict';

const { toTitleCase } = require('./helpers');

// O ERP guarda preenchimento de fachada: "....." no logradouro, "00000" no
// número, "." ou "......" no bairro. Medido em 3.000 entregas recentes: 82%
// têm ao menos um campo assim, 22% têm todos. E 544 das 1.505 mensagens de
// entrega já enviadas (36%) saíram com esse lixo para o cliente.
const SO_PREENCHIMENTO = /^[\s.\-_*0]*$/;

function limpar(valor) {
    if (valor === null || valor === undefined) return '';
    const texto = String(valor).trim();
    if (SO_PREENCHIMENTO.test(texto)) return '';
    // Sobras de fachada grudadas no fim do valor real:
    // "RUA WALDEMAR DOS SANTOS....." vira "RUA WALDEMAR DOS SANTOS".
    return texto.replace(/[\s.\-_*]+$/, '');
}

// Junta as partes existentes e devolve null quando não sobra nada.
// Nunca produz pontuação órfã: o defeito anterior enviava ", - " ao cliente
// quando os campos vinham nulos.
function montarEndereco(dados) {
    if (!dados) return null;

    const logradouro = toTitleCase(limpar(dados.endereco));
    const numero = limpar(dados.numero);
    const bairro = toTitleCase(limpar(dados.bairro));

    const rua = [logradouro, numero].filter(Boolean).join(', ');
    const local = [dados.cidade, dados.estado].filter(Boolean).join('/');
    const texto = [rua, bairro, local].filter(Boolean).join(' - ');

    return texto === '' ? null : texto;
}

module.exports = { montarEndereco };
