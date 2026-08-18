export type Conferida = {
    codigoRec: number;
    nome: string;
    total: number;
    conferidas: number;
    completa: boolean;
    hora: string | null;
    jaAvisado: boolean;
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
