import { ref } from 'vue';
import { buscarEu, fazerLogin, fazerLogout, type Usuario } from '@/api/auth';

export const usuarioAtual = ref<Usuario | null>(null);
export const sessaoCarregada = ref(false);

export async function carregarSessao(): Promise<void> {
    try {
        const { usuario } = await buscarEu();
        usuarioAtual.value = usuario;
    } catch {
        usuarioAtual.value = null;
    } finally {
        sessaoCarregada.value = true;
    }
}

export async function entrar(email: string, senha: string): Promise<void> {
    usuarioAtual.value = await fazerLogin(email, senha);
}

export async function sair(): Promise<void> {
    await fazerLogout();
    usuarioAtual.value = null;
}

export function podeGerir(): boolean {
    return usuarioAtual.value?.papel === 'gestor' || usuarioAtual.value?.papel === 'admin';
}

export function ehAdmin(): boolean {
    return usuarioAtual.value?.papel === 'admin';
}
