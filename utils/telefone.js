// Variantes de um telefone para busca no ERP.
//
// Dois problemas se somam aqui:
//
// 1. O 9º dígito. Linha antiga tem 8 dígitos, linha nova tem 9, e o mesmo
//    telefone aparece das duas formas conforme quem cadastrou e quando.
//    Quem procura por "44991135801" precisa achar "4491135801" também.
//
// 2. O ERP guarda com espaço e parêntese no meio: "44 34255793",
//    "44  4231513", "44991193243". Comparar texto direto nunca casa; a
//    limpeza acontece nos dois lados, aqui e no SQL.
//
// Devolve só dígitos, sem DDI. O DDI entra pelo lado do WhatsApp, não do
// cadastro — no ERP nenhum número tem 55 na frente.

function soDigitos(valor) {
    return String(valor ?? '').replace(/\D/g, '');
}

// Tira o 55 do começo quando o que sobra ainda é um telefone plausível.
// Sem essa condição, "5511999999" (DDD 55, Rio Grande do Sul) perderia
// os dois primeiros dígitos e viraria outro número.
function semDdi(digitos) {
    if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
        return digitos.slice(2);
    }
    return digitos;
}

function variantesDeTelefone(entrada) {
    const limpo = semDdi(soDigitos(entrada));

    // Menos que DDD + 8 dígitos não identifica ninguém: procurar só pelo
    // número, sem DDD, devolveria gente de outro estado.
    if (limpo.length < 10 || limpo.length > 11) return [];

    const ddd = limpo.slice(0, 2);
    const numero = limpo.slice(2);

    const variantes = new Set([limpo]);

    if (numero.length === 9 && numero.startsWith('9')) {
        variantes.add(ddd + numero.slice(1));   // sem o 9º dígito
    }
    if (numero.length === 8) {
        variantes.add(ddd + '9' + numero);      // com o 9º dígito
    }

    return [...variantes];
}

module.exports = { variantesDeTelefone, soDigitos, semDdi };
