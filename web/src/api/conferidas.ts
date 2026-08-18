import { buscarJson } from './cliente';
import type { RespostaConferidas } from './tipos';

export function buscarConferidas(data?: string): Promise<RespostaConferidas> {
    const consulta = data ? `?data=${encodeURIComponent(data)}` : '';
    return buscarJson<RespostaConferidas>(`/api/conferidas${consulta}`);
}
