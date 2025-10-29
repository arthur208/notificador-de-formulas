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

// Decodificador de strings do Firebird
function decodeFBString(field) {
    if (field === null || typeof field === 'undefined') return null;
    if (Buffer.isBuffer(field)) {
        return field.toString('utf-8').trim();
    }
    return field.toString().trim();
}

module.exports = {
    getSaudacao,
    toTitleCase,
    decodeFBString
};
