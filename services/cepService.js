'use strict';

// Resolve CEP em cidade/UF/IBGE, com dois provedores.
//
// A ORDEM NÃO É ARBITRÁRIA. Medido contra os dois, com cinco CEPs que não
// existem:
//
//   CEP        ViaCEP     BrasilAPI
//   99999999   recusou    Sarandi/PR ibge=4126256 (via "open-cep")
//   00000000   recusou    recusou (404)
//   87999999   recusou    recusou (404)
//   12345678   recusou    recusou (404)
//   98765432   recusou    recusou (404)
//
// A BrasilAPI é mais rápida (~30ms contra ~150ms) e agrega vários serviços,
// mas um deles inventou uma cidade para um CEP inexistente. Gravar isso num
// cadastro real trocaria a cidade de um cliente por causa de um dígito
// errado — e ninguém perceberia, porque a resposta vem com cara de certa.
//
// Por isso: o ViaCEP decide, e a BrasilAPI só entra quando o ViaCEP NÃO
// RESPONDE. "Este CEP não existe" é resposta, e é final — não vira consulta
// ao segundo provedor em busca de um sim.
//
// Vale lembrar que o ViaCEP já saiu deste projeto uma vez (decisão D1, em
// services/firebirdService.js) por "falhar em silêncio". O silêncio era o
// problema; aqui a falha é classificada e vira 422 ou 502, nunca cidade
// errada e nunca exceção solta.

const TIMEOUT_MS = 4000;

// Não achado é diferente de não respondeu: o primeiro é erro de quem mandou
// o CEP, o segundo é problema de rede. Viram 422 e 502 respectivamente.
const NAO_ENCONTRADO = 'NAO_ENCONTRADO';
const INDISPONIVEL = 'INDISPONIVEL';

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

async function pegarJson(url, buscar) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
    try {
        const resposta = await buscar(url, { signal: controle.signal });
        // 404 é resposta: o provedor procurou e não achou.
        if (resposta.status === 404) return { status: 404 };
        if (!resposta.ok) return { status: resposta.status };
        return { status: resposta.status, json: await resposta.json() };
    } catch {
        // Timeout, DNS, TLS, offline — tudo indisponibilidade.
        return { status: null };
    } finally {
        clearTimeout(relogio);
    }
}

// ViaCEP devolve 200 com {"erro":"true"} quando o CEP não existe — não um 404.
async function viaCep(cep, buscar) {
    const r = await pegarJson(`https://viacep.com.br/ws/${cep}/json/`, buscar);
    if (r.status === null) return { erro: INDISPONIVEL };
    if (r.status === 404) return { erro: NAO_ENCONTRADO };
    if (r.status !== 200 || !r.json) return { erro: INDISPONIVEL };
    if (r.json.erro) return { erro: NAO_ENCONTRADO };
    if (!r.json.localidade || !r.json.uf) return { erro: NAO_ENCONTRADO };
    return {
        ibge: soDigitos(r.json.ibge) || null,
        cidade: String(r.json.localidade).trim(),
        uf: String(r.json.uf).trim().toUpperCase(),
        fonte: 'viacep',
    };
}

// BrasilAPI devolve 404 quando nenhum serviço achou, e o IBGE vem aninhado
// em ibge.city — não num campo plano como no ViaCEP.
async function brasilApi(cep, buscar) {
    const r = await pegarJson(`https://brasilapi.com.br/api/cep/v1/${cep}`, buscar);
    if (r.status === null) return { erro: INDISPONIVEL };
    if (r.status === 404) return { erro: NAO_ENCONTRADO };
    if (r.status !== 200 || !r.json) return { erro: INDISPONIVEL };
    if (!r.json.city || !r.json.state) return { erro: NAO_ENCONTRADO };
    return {
        ibge: soDigitos(r.json.ibge?.city) || null,
        cidade: String(r.json.city).trim(),
        uf: String(r.json.state).trim().toUpperCase(),
        fonte: 'brasilapi',
    };
}

// `buscar` é injetável para o teste não depender de rede: a suíte roda em
// máquina sem internet e não pode ficar à mercê de dois serviços de fora.
async function consultarCep(cep, { buscar = fetch } = {}) {
    const digitos = soDigitos(cep);
    if (digitos.length !== 8) return { erro: NAO_ENCONTRADO };

    const primeiro = await viaCep(digitos, buscar);
    if (!primeiro.erro) return primeiro;

    // O ViaCEP disse que não existe. Isso é final: perguntar ao segundo
    // provedor aqui é exatamente como o CEP 99999999 viraria Sarandi/PR.
    if (primeiro.erro === NAO_ENCONTRADO) return primeiro;

    const segundo = await brasilApi(digitos, buscar);
    if (!segundo.erro) return segundo;

    // Nenhum dos dois respondeu: é indisponibilidade, não CEP errado.
    return { erro: segundo.erro === INDISPONIVEL ? INDISPONIVEL : segundo.erro };
}

module.exports = { consultarCep, NAO_ENCONTRADO, INDISPONIVEL, TIMEOUT_MS };
