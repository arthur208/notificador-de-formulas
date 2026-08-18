import { ErroApi } from './tipos';

const TEMPO_LIMITE_MS = 20000;

export async function buscarJson<T>(caminho: string): Promise<T> {
    const controlador = new AbortController();
    const relogio = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);

    try {
        const resposta = await fetch(caminho, { signal: controlador.signal });

        if (!resposta.ok) {
            // Sessão perdida: leva ao login guardando para onde voltar.
            if (resposta.status === 401 && !location.pathname.startsWith('/entrar')) {
                location.assign(`/entrar?destino=${encodeURIComponent(location.pathname)}`);
            }
            // O backend responde JSON em /api/* desde a Parte 1. Ainda assim,
            // não confiamos: um proxy no caminho pode devolver HTML.
            let mensagem = `Falha na requisição (${resposta.status}).`;
            try {
                const corpo = await resposta.json();
                if (corpo?.erro) mensagem = corpo.erro;
            } catch {
                // corpo não era JSON — mantém a mensagem genérica
            }
            throw new ErroApi(resposta.status, mensagem);
        }

        return (await resposta.json()) as T;
    } catch (erro) {
        if (erro instanceof ErroApi) throw erro;
        if (erro instanceof DOMException && erro.name === 'AbortError') {
            throw new ErroApi(0, 'O servidor demorou demais para responder.');
        }
        throw new ErroApi(0, 'Sem conexão com o servidor.');
    } finally {
        clearTimeout(relogio);
    }
}
