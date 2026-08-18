import { buscarJson } from './cliente';

export type Usuario = {
    _id: string;
    nome: string;
    email: string;
    papel: 'atendente' | 'gestor' | 'admin';
};

export function buscarEu(): Promise<{ usuario: Usuario }> {
    return buscarJson<{ usuario: Usuario }>('/auth/eu');
}

export async function fazerLogin(email: string, senha: string): Promise<Usuario> {
    const resposta = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo?.erro || 'Não foi possível entrar.');
    return corpo.usuario as Usuario;
}

export async function fazerLogout(): Promise<void> {
    await fetch('/auth/logout', { method: 'POST' });
}
