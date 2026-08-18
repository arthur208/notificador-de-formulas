'use strict';

function emLotes(itens, tamanho) {
    if (!Number.isInteger(tamanho) || tamanho < 1) {
        throw new Error('tamanho do lote deve ser inteiro maior que zero');
    }
    const lotes = [];
    for (let i = 0; i < itens.length; i += tamanho) {
        lotes.push(itens.slice(i, i + tamanho));
    }
    return lotes;
}

// Monta a lista para cláusulas IN. Toda entrada precisa ser inteiro:
// é o que permite interpolar sem risco, e o IN literal é o que mantém
// a consulta em 48ms em vez de 6.455ms.
function listaInteirosSegura(valores) {
    return valores
        .map((valor) => {
            const numero = Number(valor);
            if (!Number.isInteger(numero)) {
                throw new Error(`valor não inteiro na lista: ${JSON.stringify(valor)}`);
            }
            return numero;
        })
        .join(',');
}

module.exports = { emLotes, listaInteirosSegura };
