'use strict';

function comTimeout(promessa, ms, mensagem) {
    return new Promise((resolve, reject) => {
        const relogio = setTimeout(() => reject(new Error(mensagem)), ms);
        promessa.then(
            (valor) => { clearTimeout(relogio); resolve(valor); },
            (erro) => { clearTimeout(relogio); reject(erro); }
        );
    });
}

module.exports = { comTimeout };
