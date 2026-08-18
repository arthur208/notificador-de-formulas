import { buscarJson } from './cliente';

export type Modalidade = 'retirada' | 'entrega' | 'convenio';
export type Template = { modalidade: Modalidade; titulo: string; corpo: string; versao?: number };
export type Cidade = {
    codigoCid: number; nome: string; uf: string;
    dias: number; templateId: string | null; ativo: boolean;
};
export type Sugestao = { codigoCid: number; nome: string; uf: string; entregas: number };
export type Variaveis = { globais: string[]; porModalidade: Record<Modalidade, string[]> };

export function lerTemplates(): Promise<{ templates: Template[]; variaveis: Variaveis }> {
    return buscarJson('/api/config/templates');
}

export function lerCidades(): Promise<{ cidades: Cidade[] }> {
    return buscarJson('/api/config/cidades');
}

export function lerSugestoes(): Promise<{ sugestoes: Sugestao[] }> {
    return buscarJson('/api/config/cidades/sugestoes');
}

async function enviar(metodo: string, caminho: string, corpo?: unknown): Promise<void> {
    const resposta = await fetch(caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados?.erro || 'Não foi possível salvar.');
    }
}

export const salvarTemplate = (m: Modalidade, dados: { titulo: string; corpo: string }) =>
    enviar('PUT', `/api/config/templates/${m}`, dados);

export const salvarCidade = (codigoCid: number, dados: Partial<Cidade>) =>
    enviar('PUT', `/api/config/cidades/${codigoCid}`, dados);

export const removerCidade = (codigoCid: number) =>
    enviar('DELETE', `/api/config/cidades/${codigoCid}`);

export type ConvenioErp = {
    codigoTs: number;
    nome: string;
    config: {
        nomeExibicao: string;
        dias: number;
        variaveis: { chave: string; valor: string }[];
        ativo: boolean;
    } | null;
};

export function lerConvenios(): Promise<{ convenios: ConvenioErp[] }> {
    return buscarJson('/api/config/convenios');
}

export const salvarConvenio = (codigoTs: number, dados: unknown) =>
    enviar('PUT', `/api/config/convenios/${codigoTs}`, dados);

export const removerConvenio = (codigoTs: number) =>
    enviar('DELETE', `/api/config/convenios/${codigoTs}`);
