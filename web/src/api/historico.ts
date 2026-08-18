import { buscarJson } from './cliente';

export type Envio = {
    _id: string;
    codigoReceita: number;
    nomeCliente: string;
    telefoneEnviado: string;
    status: 'sucesso' | 'erro';
    detalheErro?: unknown;
    tentativas: number;
    timestamp: string;
};

export function buscarHistorico(params: {
    page?: number; busca?: string; dateStart?: string; dateEnd?: string;
}): Promise<{ logs: Envio[]; hasMore: boolean; total: number }> {
    const consulta = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
        if (valor !== undefined && valor !== '') consulta.set(chave, String(valor));
    }
    return buscarJson(`/api/logs?${consulta.toString()}`);
}
