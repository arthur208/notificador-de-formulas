'use strict';

// Junta as partes existentes e devolve null quando não sobra nada.
// Nunca produz pontuação órfã: o defeito anterior enviava ", - " ao cliente
// quando os campos vinham nulos.
function montarEndereco(dados) {
    if (!dados) return null;

    const rua = [dados.endereco, dados.numero].filter(Boolean).join(', ');
    const local = [dados.cidade, dados.estado].filter(Boolean).join('/');
    const texto = [rua, dados.bairro, local].filter(Boolean).join(' - ');

    return texto === '' ? null : texto;
}

module.exports = { montarEndereco };
