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
 * Normaliza para o formato que o WhatsApp aceita: 55 + DDD + 9 dígitos.
 * Devolve null quando o número não dá para usar — quem chama trata.
 */
function formatPhoneNumber(phone) {

    if (!phone) {
        return null;
    }

    // 1. Deixa apenas números
    let cleanPhone = phone.toString().replace(/\D/g, '');

    // 2. Remove o 55 se já estiver lá
    if (cleanPhone.startsWith('55') && (cleanPhone.length === 12 || cleanPhone.length === 13)) {
        cleanPhone = cleanPhone.substring(2);
    }

    // 3. Regra do 9º Dígito (adiciona se tiver 10 dígitos)
    if (cleanPhone.length === 10) {
        cleanPhone = cleanPhone.substring(0, 2) + '9' + cleanPhone.substring(2);
    }

    // 4. Validação Final (deve ter 11 dígitos)
    if (cleanPhone.length !== 11) {
        return null; 
    }

    const finalResult = '55' + cleanPhone;
    return finalResult;
}

module.exports = {
    getSaudacao,
    toTitleCase,
    decodeFBString,
    formatPhoneNumber
};