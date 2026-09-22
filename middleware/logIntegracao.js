'use strict';

// Registro das chamadas de integração, para ver o que a plataforma de agente
// manda de verdade — que costuma ser diferente do que ela diz que manda.
//
// Mostra o corpo CRU, antes de qualquer tratamento nosso. É onde aparecem os
// problemas que o JSON já parseado esconde: texto com codificação errada,
// JSON dentro de string, campo que chega como número quando devia ser texto.
//
// Fica ligado por padrão porque o volume é baixo e o motivo de existir é
// justamente depurar. Desligue com LOG_INTEGRACAO=0 no .env — ele imprime
// dado de cliente, e log costuma sobreviver mais do que deveria.

const LIMITE_CORPO = 2000;

function ligado() {
    return process.env.LOG_INTEGRACAO !== '0';
}

function agora() {
    return new Date().toISOString().slice(11, 23);
}

// Nunca imprime o token: o log é o lugar mais fácil de vazar credencial.
function descreverAutorizacao(cabecalho) {
    if (!cabecalho) return 'ausente';
    const [esquema, valor] = String(cabecalho).split(' ');
    if (!valor) return `malformado (${JSON.stringify(String(cabecalho).slice(0, 12))}…)`;
    return `${esquema} •••${valor.slice(-4)} (${valor.length} chars)`;
}

function cortar(texto) {
    if (texto === undefined || texto === null) return '(vazio)';
    const s = String(texto);
    return s.length > LIMITE_CORPO ? `${s.slice(0, LIMITE_CORPO)}… (+${s.length - LIMITE_CORPO})` : s;
}

function logIntegracao(req, res, next) {
    // Vale mesmo com o log desligado: nada aqui pode ser servido de cache.
    // Cadastro muda, e resposta velha no chatbot vira endereço errado.
    res.set('Cache-Control', 'no-store');

    if (!ligado()) return next();

    const inicio = Date.now();
    const marca = `[integracao ${agora()}]`;

    console.log(`${marca} ${req.method} ${req.originalUrl}`);
    console.log(`${marca}   origem: ${req.ip} · agente: ${req.get('user-agent') ?? '(nenhum)'}`);
    console.log(`${marca}   auth: ${descreverAutorizacao(req.get('authorization'))}`);

    if (req.method !== 'GET') {
        console.log(`${marca}   content-type: ${req.get('content-type') ?? '(nenhum)'} · ${req.get('content-length') ?? '?'} bytes`);
        // O bruto primeiro: é ele que denuncia JSON malformado ou duplamente
        // codificado, que o corpo já parseado não mostra.
        console.log(`${marca}   corpo cru: ${cortar(req.corpoBruto)}`);
        console.log(`${marca}   corpo lido: ${cortar(JSON.stringify(req.body))}`);
    }

    res.on('finish', () => {
        console.log(`${marca} -> ${res.statusCode} em ${Date.now() - inicio}ms`);
    });

    next();
}

// Chamado pelo controlador depois da limpeza, para a comparação ficar no log
// lado a lado: o que veio e o que sobrou.
function logPayloadLimpo(corpo, rotulo = 'apos limpeza') {
    if (!ligado()) return;
    console.log(`[integracao ${agora()}]   ${rotulo}: ${cortar(JSON.stringify(corpo))}`);
}

module.exports = { logIntegracao, logPayloadLimpo, LIMITE_CORPO };
