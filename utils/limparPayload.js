'use strict';

// Limpeza do corpo antes de validar.
//
// A plataforma de agente manda um template fixo com todos os campos. Quando o
// agente preenche um só, os outros chegam como string vazia, "null", ou com a
// variável não substituída — "{{cpf}}" literal. Como a validação é
// tudo-ou-nada, um único campo assim derrubava a atualização inteira.
//
// Chave ausente já significava "não mexer neste campo". Depois desta limpeza,
// campo vazio significa a mesma coisa: some antes de chegar na validação.

// Antes daqui, `null` era o pedido de apagar. Agora `null` chega demais — é o
// que a plataforma manda para campo não preenchido — então a remoção passou a
// exigir um marcador que ninguém envia por acidente.
const MARCADOR_REMOCAO = '__NULL__';

// O que conta como "não preenchido".
function semConteudo(valor) {
    if (valor === null || valor === undefined) return true;
    if (typeof valor !== 'string') return false;

    const texto = valor.trim();
    return texto === ''
        || texto === 'null'
        || texto === 'undefined'
        // Variável que a plataforma não substituiu: {{cpf}}, {{ endereco.cep }}.
        || /^\{\{[^}]*\}\}$/.test(texto);
}

function ehObjetoSimples(valor) {
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

// Devolve o valor limpo, ou o símbolo DESCARTAR quando a chave deve sumir.
const DESCARTAR = Symbol('descartar');

function limparValor(valor) {
    if (semConteudo(valor)) return DESCARTAR;

    if (typeof valor === 'string') {
        const texto = valor.trim();
        // O marcador vira o null de verdade, que a gravação já entende como
        // pedido de apagar. Converter aqui mantém todo o resto do código
        // falando a mesma língua de antes.
        return texto === MARCADOR_REMOCAO ? null : texto;
    }

    if (Array.isArray(valor)) {
        const itens = valor.map(limparValor).filter((v) => v !== DESCARTAR);
        return itens.length === 0 ? DESCARTAR : itens;
    }

    if (ehObjetoSimples(valor)) {
        const limpo = limparPayload(valor);
        // Objeto que ficou sem nenhuma chave não diz nada: sai do payload.
        return Object.keys(limpo).length === 0 ? DESCARTAR : limpo;
    }

    return valor;
}

function limparPayload(corpo) {
    if (!ehObjetoSimples(corpo)) return {};

    const limpo = {};
    for (const [chave, valor] of Object.entries(corpo)) {
        const resultado = limparValor(valor);
        if (resultado !== DESCARTAR) limpo[chave] = resultado;
    }
    return limpo;
}

module.exports = { limparPayload, semConteudo, MARCADOR_REMOCAO };
