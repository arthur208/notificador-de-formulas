export type Modalidade =
    | 'retirada' | 'entrega' | 'entrega_sem_prazo' | 'entrega_local' | 'convenio';

export type Conferida = {
    codigoRec: number;
    nome: string;
    total: number;
    conferidas: number;
    completa: boolean;
    hora: string | null;
    jaAvisado: boolean;
    // Ausentes quando a classificação falha — a lista continua servindo.
    modalidade?: Modalidade;
    detalhe?: string | null;
    semPrazo?: boolean;
};

export type RespostaConferidas = {
    data: string;
    prontas: Conferida[];
    aguardando: Conferida[];
};

export class ErroApi extends Error {
    constructor(public status: number, mensagem: string) {
        super(mensagem);
        this.name = 'ErroApi';
    }
}
