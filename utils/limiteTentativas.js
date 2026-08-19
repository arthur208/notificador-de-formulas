// Freio para tentativa de login em série.
//
// Antes existia a whitelist de IP na frente de tudo. Ela saiu — não segurava
// nada, porque liberava a faixa privada inteira e o req.ip vinha de um
// cabeçalho que quem chama controla. Com ela fora, a tela de login é a única
// porta, e porta única sem freio é convite para tentativa automatizada.
//
// Conta na memória do processo. Reiniciar o serviço zera, e com o app em
// cluster cada worker tem a sua conta. Para o volume desta farmácia — uma
// dezena de pessoas — isso é proporcional; um contador no Mongo custaria uma
// escrita por senha errada e não resolveria muito mais.

const JANELA_MS = 15 * 60 * 1000;
const MAX_POR_CHAVE = 5;

// Espalhar tentativas por vários e-mails do mesmo IP não pode escapar do
// limite, por isso a origem também é contada — com folga maior, já que uma
// farmácia inteira sai pelo mesmo IP.
const MAX_POR_ORIGEM = 20;

const tentativas = new Map(); // chave -> { falhas, ate }

function agora() {
    return Date.now();
}

function estado(chave) {
    const item = tentativas.get(chave);
    if (!item) return null;
    if (item.ate <= agora()) {
        tentativas.delete(chave);
        return null;
    }
    return item;
}

function chaveEmail(email) {
    return `email:${String(email ?? '').trim().toLowerCase()}`;
}

function chaveOrigem(origem) {
    return `origem:${String(origem ?? 'desconhecida')}`;
}

// Devolve os segundos que faltam para poder tentar de novo, ou 0 se pode.
function bloqueadoPor(email, origem) {
    const porEmail = estado(chaveEmail(email));
    const porOrigem = estado(chaveOrigem(origem));

    const excedido = [
        porEmail && porEmail.falhas >= MAX_POR_CHAVE ? porEmail : null,
        porOrigem && porOrigem.falhas >= MAX_POR_ORIGEM ? porOrigem : null,
    ].filter(Boolean);

    if (excedido.length === 0) return 0;
    const maisLonge = Math.max(...excedido.map((e) => e.ate));
    return Math.ceil((maisLonge - agora()) / 1000);
}

function registrarFalha(email, origem) {
    for (const chave of [chaveEmail(email), chaveOrigem(origem)]) {
        const atual = estado(chave) ?? { falhas: 0, ate: 0 };
        atual.falhas += 1;
        // A janela reinicia a cada falha: quem insiste espera mais.
        atual.ate = agora() + JANELA_MS;
        tentativas.set(chave, atual);
    }
}

function registrarSucesso(email, origem) {
    tentativas.delete(chaveEmail(email));
    tentativas.delete(chaveOrigem(origem));
}

// Só para os testes não dependerem de relógio nem uns dos outros.
function _limpar() {
    tentativas.clear();
}

module.exports = {
    bloqueadoPor, registrarFalha, registrarSucesso, _limpar,
    JANELA_MS, MAX_POR_CHAVE, MAX_POR_ORIGEM,
};
