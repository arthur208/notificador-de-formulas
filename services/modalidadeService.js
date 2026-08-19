const firebirdService = require('./firebirdService');
const cidadeService = require('./cidadeService');
const convenioService = require('./convenioService');
const { escolherModalidade } = require('./mensagemService');

// Rótulo curto para a lista. O nome interno da modalidade não é nome para
// mostrar a ninguém, e "entrega sem prazo" só interessa a quem configura.
const ROTULO = {
    retirada: 'Retirada',
    entrega: 'Entrega',
    entrega_sem_prazo: 'Entrega',
    entrega_local: 'Entrega local',
    convenio: 'Convênio',
};

// Qual modalidade sai se a atendente abrir e enviar sem mexer em nada.
// É a mesma regra do envio, incluindo a sugestão automática de convênio
// quando o cliente tem exatamente um configurado — com dois a tela
// pergunta, então a lista mostra a modalidade de base.
function decidir({ entrega, convenios, prazoPorCidade, conveniosConfigurados }) {
    const configurados = (convenios ?? []).filter((c) => conveniosConfigurados.has(c.codigoTs));

    if (configurados.length === 1) {
        return {
            modalidade: 'convenio',
            detalhe: conveniosConfigurados.get(configurados[0].codigoTs),
        };
    }

    const prazo = entrega ? prazoPorCidade.get(entrega.codigoCid) ?? null : null;
    const modalidade = escolherModalidade(Boolean(entrega), prazo);

    return {
        modalidade,
        detalhe: entrega?.cidade || null,
        // A cidade sem cadastro é a razão de a mensagem sair sem prazo;
        // vale avisar na lista em vez de deixar descobrir depois.
        semPrazo: modalidade === 'entrega_sem_prazo',
    };
}

// Anota uma lista inteira de receitas. Cinco consultas no total: três no
// Firebird em lote e duas no Mongo, independente do tamanho da lista.
async function anotar(receitas) {
    if (!Array.isArray(receitas) || receitas.length === 0) return receitas ?? [];

    const codigos = receitas.map((r) => r.codigoRec);

    const [entregas, convenios, cidades, configs] = await Promise.all([
        firebirdService.entregasDasReceitas(codigos),
        firebirdService.conveniosDasReceitas(codigos),
        cidadeService.listarCidades(),
        convenioService.listarConfiguracoes(),
    ]);

    const prazoPorCidade = new Map(
        cidades
            .filter((c) => c.ativo !== false)
            .map((c) => [c.codigoCid, { dias: c.dias, local: Boolean(c.local) }])
    );
    const conveniosConfigurados = new Map(
        configs.filter((c) => c.ativo !== false).map((c) => [c.codigoTs, c.nomeExibicao])
    );

    return receitas.map((receita) => ({
        ...receita,
        ...decidir({
            entrega: entregas.get(receita.codigoRec) ?? null,
            convenios: convenios.get(receita.codigoRec),
            prazoPorCidade,
            conveniosConfigurados,
        }),
    }));
}

module.exports = { anotar, decidir, ROTULO };
