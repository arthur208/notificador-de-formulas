import { buscarJson } from './cliente';

export type Telefone = { rotulo: string; numero: string };

export type DetalheReceita = {
    dadosCliente: { nome: string; telefones: Record<string, string | null> };
    mensagemSugerida: string;
    jaEnviado: boolean;
    isDelivery: boolean;
    deliveryAddress: { cidade?: string; estado?: string } | null;
    conveniosSugeridos: { codigoTs: number; nome: string; nomeExibicao: string }[];
};

export type Situacao = 'tem' | 'nao_tem' | 'desconhecido' | 'invalido';

export type NumeroValidado = {
    numero: string;
    situacao: Situacao;
    numeroEnvio: string | null;
    nomeVerificado?: string | null;
    doCache?: boolean;
};

export async function validarNumeros(
    numeros: string[],
    forcar = false
): Promise<NumeroValidado[]> {
    const resposta = await fetch('/api/numeros/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeros, forcar }),
    });
    if (!resposta.ok) throw new Error('Não foi possível validar os números.');
    return (await resposta.json()).numeros;
}

export function buscarReceita(codigo: number | string): Promise<DetalheReceita> {
    return buscarJson<DetalheReceita>(`/api/cliente/${encodeURIComponent(String(codigo))}`);
}

export async function enviarAviso(dados: {
    codigoReceita: number;
    telefoneEscolhido: string;
    mensagem: string;
    nomeCliente: string;
    convenioTs?: number;
}): Promise<void> {
    const resposta = await fetch('/api/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
    });
    if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new Error(corpo?.mensagem || 'Não foi possível enviar o aviso.');
    }
}

// Os quatro campos de telefone do ERP, na ordem em que a atendente costuma usar.
const ROTULOS: Record<string, string> = {
    FONECEL: 'celular',
    FONERES: 'residencial',
    FONECOM: 'comercial',
    FONEREC: 'recado',
};

export function listarTelefones(telefones: Record<string, string | null>): Telefone[] {
    return Object.entries(ROTULOS)
        .filter(([chave]) => Boolean(telefones?.[chave]))
        .map(([chave, rotulo]) => ({ rotulo, numero: telefones[chave] as string }));
}
