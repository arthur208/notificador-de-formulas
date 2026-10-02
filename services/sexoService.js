'use strict';

// Deduz o sexo pelo primeiro nome, com a API de nomes do IBGE (censo).
//
// Existe porque o ERP exige SEXO para criar a ficha de pessoa física —
// CHECK (VALUE IN ('F','M')) e NOT NULL, sem valor para "não informado" — e
// 14.464 clientes (29% da base) não têm essa ficha. Sem isto, gravar o CPF
// deles obrigaria a perguntar o sexo no meio da conversa.
//
// A pergunta óbvia é se dá para confiar. Medido contra os 36.740 cadastros
// que JÁ têm o sexo preenchido, numa amostra de 707 espalhada pela base:
//
//   nome não encontrado no IBGE          2,0%
//   quando responde, concorda com o ERP  96,1%
//
// Os 3,9% de divergência pareciam erro da dedução, mas não são. Subir o
// limite de confiança NÃO melhora a precisão: ela fica em ~96,5% mesmo acima
// de 99%, o que mostra que os erros não são casos duvidosos — são nomes
// inequívocos discordando ("MARIA" com 99,7% de F, cadastro dizendo M).
//
// Conferido direto no banco, com nomes que não têm ambiguidade real:
//
//   4.519 cadastros de nome feminino, 152 gravados como M    3,36%
//   3.064 cadastros de nome masculino, 106 gravados como F   3,46%
//   -> 3,40% do campo SEXO do ERP está errado
//
// O erro é simétrico, então não é valor padrão enviesado: é clique errado no
// balcão. E 3,40% de erro do ERP explica quase toda a divergência de 3,9%.
// A dedução é tão precisa quanto o cadastro feito à mão — provavelmente mais.
//
// Ainda assim ela nunca passa na frente de ninguém: `sexo` continua no
// contrato do PUT, e o que o cliente responde sempre vence.

// Abaixo disso o nome é genuinamente dividido ("DARCI": 66,9% M) e deduzir
// seria sorteio. Nesses casos a API recusa e o agente pergunta.
const CONFIANCA_MINIMA = 0.9;

const TIMEOUT_MS = 4000;

// Os mesmos primeiros nomes repetem muito — na amostra, 707 cadastros deram
// 432 nomes distintos. Sem cache seria uma chamada externa por gravação.
// Nome não envelhece, então não há invalidação: o processo reinicia e pronto.
const cache = new Map();
const LIMITE_CACHE = 5000;

function primeiroNome(nome) {
    const limpo = String(nome ?? '').trim();
    if (limpo === '') return null;
    return limpo
        .split(/\s+/)[0]
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z]/g, '')
        .toUpperCase() || null;
}

async function frequencia(nome, sexo, buscar) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
    try {
        const url = `https://servicodados.ibge.gov.br/api/v2/censos/nomes/${encodeURIComponent(nome)}?sexo=${sexo}`;
        const resposta = await buscar(url, { signal: controle.signal });
        if (!resposta.ok) return null;
        const corpo = await resposta.json();
        if (!Array.isArray(corpo) || !corpo[0]?.res) return 0;
        return corpo[0].res.reduce((soma, periodo) => soma + (periodo.frequencia || 0), 0);
    } catch {
        // Timeout, DNS, offline. Indistinguível de nome desconhecido para
        // quem chama, e o efeito é o mesmo: perguntar ao cliente.
        return null;
    } finally {
        clearTimeout(relogio);
    }
}

// Devolve { sexo: 'F'|'M', confianca, nome } ou null quando não dá para
// afirmar — nome desconhecido, nome dividido, ou IBGE fora do ar.
//
// Nunca devolve um palpite fraco disfarçado de resposta: null é o sinal para
// perguntar, e quem chama trata isso.
async function deduzirSexo(nomeCompleto, { buscar = fetch } = {}) {
    const nome = primeiroNome(nomeCompleto);
    if (!nome) return null;

    if (cache.has(nome)) return cache.get(nome);

    const [f, m] = await Promise.all([
        frequencia(nome, 'F', buscar),
        frequencia(nome, 'M', buscar),
    ]);

    // Falha de rede não entra no cache: senão uma oscilação de alguns
    // segundos ficaria grudada até o processo reiniciar.
    if (f === null || m === null) return null;

    const total = f + m;
    let resultado = null;
    if (total > 0) {
        const confianca = Math.max(f, m) / total;
        if (confianca >= CONFIANCA_MINIMA) {
            resultado = { sexo: f > m ? 'F' : 'M', confianca, nome };
        }
    }

    if (cache.size < LIMITE_CACHE) cache.set(nome, resultado);
    return resultado;
}

module.exports = { deduzirSexo, primeiroNome, CONFIANCA_MINIMA, TIMEOUT_MS };
