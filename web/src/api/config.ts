import { buscarJson } from './cliente';

export type Modalidade = 'retirada' | 'entrega' | 'entrega_sem_prazo' | 'entrega_local' | 'convenio';
export type Template = {
    modalidade: Modalidade; cabecalho: string; corpo: string;
    botoes?: BotaoDef[]; versao?: number;
};
export type Cidade = {
    codigoCid: number; nome: string; uf: string;
    dias: number; local: boolean; ativo: boolean;
};
export type Sugestao = { codigoCid: number; nome: string; uf: string; entregas: number };
export type Variaveis = { globais: string[]; porModalidade: Record<Modalidade, string[]> };

export function lerTemplates(): Promise<{
    templates: Template[];
    variaveis: Variaveis;
    recursos?: { botoes: boolean };
}> {
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

export const salvarTemplate = (m: Modalidade, dados: { cabecalho: string; corpo: string; botoes: BotaoDef[] }) =>
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

export type BotaoDef = {
    type: 'reply' | 'cta_url' | 'cta_call' | 'cta_copy';
    title: string;
    id?: string;
    url?: string;
    phone_number?: string;
    copy_code?: string;
};

export type Canal = {
    canal: string;
    numeroRemetente: string;
    botoesAtivos: boolean;
    botoes?: BotaoDef[];
    ativo: boolean;
    token: string;
    clientId: string;
    clientSecret: string;
} | null;

// O whatsmeow aceita os quatro; a Oficial API só os dois primeiros.
export const TIPOS_BOTAO = [
    { valor: 'cta_call', rotulo: 'Ligar' },
    { valor: 'cta_url', rotulo: 'Abrir link' },
    { valor: 'cta_copy', rotulo: 'Copiar texto' },
    { valor: 'reply', rotulo: 'Resposta rápida' },
] as const;

export function lerCanal(): Promise<{ canal: Canal }> {
    return buscarJson('/api/config/canal');
}

export const salvarCanal = (dados: unknown) => enviar('PUT', '/api/config/canal', dados);

export type Usuario = {
    _id: string;
    nome: string;
    email: string;
    papel: string;
    ativo: boolean;
    ultimoAcesso: string | null;
};

export type RegistroAuditoria = {
    _id: string;
    usuarioNome: string;
    acao: string;
    entidade: string;
    entidadeId: string | number | null;
    valorAnterior?: unknown;
    valorNovo?: unknown;
    quando: string;
};

export function lerUsuarios(): Promise<{ usuarios: Usuario[]; papeis: string[] }> {
    return buscarJson('/api/config/usuarios');
}

export function lerAuditoria(limite = 100): Promise<{ registros: RegistroAuditoria[] }> {
    return buscarJson(`/api/config/auditoria?limite=${limite}`);
}

export const criarUsuario = (dados: { nome: string; email: string; senha: string; papel: string }) =>
    enviar('POST', '/api/config/usuarios', dados);

export const atualizarUsuario = (id: string, dados: Partial<Usuario>) =>
    enviar('PUT', `/api/config/usuarios/${id}`, dados);

export const redefinirSenha = (id: string, senha: string) =>
    enviar('PUT', `/api/config/usuarios/${id}/senha`, { senha });
