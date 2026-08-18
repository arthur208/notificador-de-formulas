const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// Aceita o formato que o backend envia (55 + DDD + número) e devolve
// legível. O log de produção mostrava 5544997028340 cru na tela.
export function formatarTelefone(bruto: string): string {
    const digitos = (bruto ?? '').replace(/\D/g, '');
    const sem55 = digitos.startsWith('55') && digitos.length >= 12
        ? digitos.slice(2)
        : digitos;

    if (sem55.length === 11) {
        return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 7)}-${sem55.slice(7)}`;
    }
    if (sem55.length === 10) {
        return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 6)}-${sem55.slice(6)}`;
    }
    return bruto;
}

export function dataParaExibicao(iso: string): string {
    const [ano, mes, dia] = iso.split('-').map(Number);
    const data = new Date(ano, mes - 1, dia);
    return `${DIAS[data.getDay()]}, ${dia} de ${MESES[mes - 1]}`;
}
