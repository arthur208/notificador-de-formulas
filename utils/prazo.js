// O prazo sai por extenso, não como número solto: "em {{dias}} dias úteis"
// no template produzia "em 1 dias úteis". A variável já traz a unidade
// concordada, e o template escreve só "em {{dias}}".
//
// Zero é gramaticalmente plural em português ("0 dias"), mas numa mensagem
// para cliente "em 0 dias úteis" não diz nada. Cidade que entrega no mesmo
// dia deve ser marcada como entrega local, que tem texto próprio.
function emDiasUteis(valor) {
    if (valor === null || valor === undefined || valor === '') return undefined;

    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < 0) return undefined;

    return numero === 1 ? '1 dia útil' : `${numero} dias úteis`;
}

module.exports = { emDiasUteis };
