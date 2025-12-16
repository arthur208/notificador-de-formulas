function getSaudacao() {
    const hora = new Date().getHours();
    if (hora < 12) return "Bom dia";
    if (hora < 18) return "Boa tarde";
    return "Boa noite";
}

function toTitleCase(str) {
    if (!str) return "";
    const exceptions = ['da', 'de', 'do', 'das', 'dos', 'e'];
    return str.toLowerCase().split(' ').map((word, index) => {
        if (exceptions.includes(word) && index > 0) {
            return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

function decodeFBString(field) {
    if (field === null || typeof field === 'undefined') return null;
    if (Buffer.isBuffer(field)) {
        return field.toString('utf-8').trim();
    }
    return field.toString().trim();
}

/**
 * Formata o número de telefone com LOGS DE DEBUG.
 */
function formatPhoneNumber(phone) {
    console.log(`[DEBUG] formatPhoneNumber - Entrada: "${phone}"`); // LOG 1

    if (!phone) {
        console.log(`[DEBUG] formatPhoneNumber - Telefone vazio/nulo.`);
        return null;
    }

    // 1. Deixa apenas números
    let cleanPhone = phone.toString().replace(/\D/g, '');
    console.log(`[DEBUG] formatPhoneNumber - Apenas dígitos: ${cleanPhone}`); // LOG 2

    // 2. Remove o 55 se já estiver lá
    if (cleanPhone.startsWith('55') && (cleanPhone.length === 12 || cleanPhone.length === 13)) {
        cleanPhone = cleanPhone.substring(2);
        console.log(`[DEBUG] formatPhoneNumber - Removeu 55 inicial: ${cleanPhone}`); // LOG 3
    }

    // 3. Regra do 9º Dígito (adiciona se tiver 10 dígitos)
    if (cleanPhone.length === 10) {
        cleanPhone = cleanPhone.substring(0, 2) + '9' + cleanPhone.substring(2);
        console.log(`[DEBUG] formatPhoneNumber - Adicionou 9º dígito: ${cleanPhone}`); // LOG 4
    }

    // 4. Validação Final (deve ter 11 dígitos)
    if (cleanPhone.length !== 11) {
        console.log(`[DEBUG] formatPhoneNumber - FALHA: Tamanho inválido (${cleanPhone.length} dígitos). Esperado 11.`); // LOG ERRO
        return null; 
    }

    const finalResult = '55' + cleanPhone;
    console.log(`[DEBUG] formatPhoneNumber - SUCESSO: Resultado final: ${finalResult}`); // LOG FINAL
    return finalResult;
}

module.exports = {
    getSaudacao,
    toTitleCase,
    decodeFBString,
    formatPhoneNumber
};