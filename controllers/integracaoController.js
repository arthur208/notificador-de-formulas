const clienteService = require('../services/clienteService');
const { variantesDeTelefone, soDigitos } = require('../utils/telefone');
const { validarCadastro } = require('../utils/validacaoCadastro');
const { resumir, resumirConsulta } = require('../utils/resumoCliente');
const { limparPayload } = require('../utils/limparPayload');
const { logPayloadLimpo } = require('../middleware/logIntegracao');
const { classificarErroErp } = require('../utils/erroErp');
const { consultarCep, NAO_ENCONTRADO } = require('../services/cepService');
const { resolverCodigoCidade } = require('../services/cidadeErpService');

// Consulta de cadastro para integração (chatbot, automações).
//
// Aceita telefone em qualquer formato e com ou sem o 9º dígito, porque o
// cadastro do ERP tem as duas formas — quem chega pelo WhatsApp traz um
// formato e o balcão cadastrou outro.
async function buscarCliente(req, res) {
    const { telefone, cpf } = req.query;

    if (!telefone && !cpf) {
        return res.status(400).json({ erro: 'Informe telefone ou cpf.' });
    }
    if (telefone && cpf) {
        return res.status(400).json({ erro: 'Informe telefone OU cpf, não os dois.' });
    }

    try {
        if (cpf) {
            const digitos = soDigitos(cpf);
            if (digitos.length !== 11) {
                return res.status(400).json({ erro: 'CPF precisa ter 11 dígitos.' });
            }
            const resumos = (await clienteService.buscarPorCpf(digitos)).map(resumir);
            return res.json({
                consultadoPor: 'cpf',
                encontrados: resumos.length,
                // Mesma função da busca por telefone: o agente recebe o
                // primeiro nível idêntico, venha de onde vier.
                ...resumirConsulta(resumos),
                clientes: resumos,
            });
        }

        const variantes = variantesDeTelefone(telefone);
        if (variantes.length === 0) {
            return res.status(400).json({
                erro: 'Telefone inválido. Informe com DDD, por exemplo 44991135801.',
            });
        }
        const resumos = (await clienteService.buscarPorTelefone(telefone)).map(resumir);
        return res.json({
            consultadoPor: 'telefone',
            // Ajuda a depurar "por que não achou": mostra o que foi procurado.
            variantes,
            encontrados: resumos.length,
            ...resumirConsulta(resumos),
            clientes: resumos,
        });
    } catch (erro) {
        // A consulta não viola regra de banco, então na prática cai sempre em
        // 502 ou 500. Passa pelo mesmo classificador para que um SQL quebrado
        // nosso não se disfarce de ERP fora do ar e faça a integração repetir.
        const { situacao } = classificarErroErp(erro);
        console.error(`Erro na consulta de cliente (${situacao}):`, erro.message);
        return res.status(situacao === 502 ? 502 : 500).json({
            erro: situacao === 502
                ? 'O ERP não respondeu. Pode tentar de novo.'
                : 'Não foi possível consultar o cadastro agora.',
        });
    }
}

// Erro de regra do banco no mesmo envelope da validação de entrada, para
// quem integra ter uma forma só para tratar.
function recusar(res, campo, mensagem) {
    return res.status(422).json({
        erro: 'O cadastro não passou na validação do ERP. Nada foi alterado.',
        erros: [{ campo, erro: mensagem }],
    });
}

// Descobre o CODIGOCID antes de gravar, quando veio CEP e não veio cidade.
//
// O ERP exige CODIGOCID em PESSOAENDERECOS e não tem tabela de CEP, então a
// tradução passa por fora (cepService) e depois pela tabela CIDADES
// (cidadeErpService). Resolvendo ANTES da transação, a recusa chega como 422
// com o campo — em vez de estourar no meio da gravação e virar 502.
//
// Devolve null quando está tudo resolvido, ou { situacao, campo, erro }.
async function preencherCidade(corpo) {
    const e = corpo.endereco;
    if (!e) return null;
    if (e.codigoCidade) return null;   // quem integra mandou explícito; manda ela
    if (!e.cep) return null;           // sem CEP não há o que resolver aqui

    const cep = await consultarCep(e.cep);

    if (cep.erro === NAO_ENCONTRADO) {
        return {
            situacao: 422,
            campo: 'endereco.cep',
            erro: 'CEP não encontrado. Confirme o CEP com o cliente.',
        };
    }
    if (cep.erro) {
        // Os dois provedores fora do ar. É indisponibilidade de verdade:
        // repetir faz sentido, e por isso 502.
        return {
            situacao: 502,
            campo: 'endereco.cep',
            erro: 'Não foi possível consultar o CEP agora. Nada foi alterado.',
        };
    }

    const cidade = await resolverCodigoCidade(cep);
    if (!cidade) {
        // O CEP existe, mas a cidade dele não está cadastrada no ERP. Criar a
        // linha em CIDADES daqui encheria a tabela do ERP de duplicata.
        return {
            situacao: 422,
            campo: 'endereco.cidade',
            erro: `Cidade não identificada pelo CEP. O CEP é de ${cep.cidade}/${cep.uf}, que não está cadastrada no ERP.`,
        };
    }

    e.codigoCidade = cidade.codigoCidade;
    // Como a cidade foi decidida, para cidade errada no cadastro ter rastro.
    logPayloadLimpo(
        { cep: cep.cidade, uf: cep.uf, ibge: cep.ibge, fonte: cep.fonte, ...cidade },
        'cidade resolvida pelo CEP'
    );
    return null;
}

// Atualiza o cadastro no ERP. Valida TUDO antes de gravar QUALQUER coisa e
// devolve a lista completa de problemas — quem integra corrige de uma vez,
// em vez de descobrir um defeito por requisição.
async function atualizarCliente(req, res) {
    const codigo = Number(req.params.codigoPessoa);
    if (!Number.isInteger(codigo) || codigo <= 0) {
        return res.status(400).json({ erro: 'codigoPessoa inválido.' });
    }

    // A plataforma de agente manda o template inteiro, com os campos não
    // preenchidos como "", "null" ou "{{cpf}}". Sai tudo isso antes de
    // validar — senão um slot vazio derruba a atualização inteira.
    // O express.json só lê corpo com content-type de JSON. Vindo outro, o
    // body chega vazio e a resposta seria "nenhum campo para atualizar" —
    // mentira, porque o campo veio. Melhor dizer qual é o problema.
    const tipo = req.get('content-type') ?? '';
    if (Number(req.get('content-length')) > 0 && !tipo.includes('json')) {
        return res.status(415).json({
            erro: `Envie com Content-Type: application/json. Veio "${tipo || '(nenhum)'}".`,
        });
    }

    const corpo = limparPayload(req.body);

    // Telefone sem número é slot do template que ninguém preencheu, não
    // pedido de alteração. `numero: null` (vindo de "__NULL__") permanece:
    // aquele é pedido de apagar.
    if (Array.isArray(corpo.telefones)) {
        corpo.telefones = corpo.telefones.filter((t) => t && t.numero !== undefined);
        if (corpo.telefones.length === 0) delete corpo.telefones;
    }

    logPayloadLimpo(corpo);

    if (Object.keys(corpo).length === 0) {
        return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
    }

    const erros = validarCadastro(corpo);
    if (erros.length > 0) {
        logPayloadLimpo(erros, 'erros de validacao');
        return res.status(422).json({
            erro: 'O cadastro não passou na validação. Nada foi alterado.',
            erros,
        });
    }

    try {
        // Depois da validação de forma: não faz sentido consultar CEP de um
        // payload que já está recusado, nem gastar chamada externa por isso.
        //
        // Dentro do try porque resolver a cidade consulta o Firebird, e a
        // queda dele aqui precisa virar 502 pelo mesmo classificador — fora
        // do try viraria 500 genérico no middleware de erros.
        const problemaCidade = await preencherCidade(corpo);
        if (problemaCidade) {
            const { situacao, campo, erro } = problemaCidade;
            if (situacao === 422) return recusar(res, campo, erro);
            return res.status(situacao).json({ erro });
        }

        const cliente = await clienteService.atualizarCadastro(codigo, corpo);
        // Mesmo resumo da consulta: se o PUT devolvesse o cadastro inteiro,
        // bastaria gravar qualquer coisa para ler o que o GET esconde.
        // O `faltando` aqui já reflete a gravação — é ele que diz se ainda
        // sobrou campo para pedir ao cliente.
        return res.json({ atualizado: true, cliente: resumir(cliente) });
    } catch (erro) {
        // Recusa nossa que já sabe o campo, como endereço novo sem cidade.
        if (erro.situacao === 422 && erro.campo) {
            return recusar(res, erro.campo, erro.message);
        }

        // O resto é classificado em utils/erroErp.js: regra do banco vira 422,
        // indisponibilidade vira 502, e o que não dá para afirmar vira 500.
        //
        // Antes tudo caía em 502, inclusive o CODIGOCID nulo — que nenhuma
        // repetição ia consertar, porque o banco nunca aceitaria aquele
        // INSERT. A integração repetiria para sempre.
        const { situacao, corpo: resposta } = classificarErroErp(erro);
        console.error(
            `Erro ao atualizar cadastro (${situacao}):`,
            erro.message,
            erro.gdscode ? `gdscode=${erro.gdscode}` : ''
        );
        return res.status(situacao).json(resposta);
    }
}

module.exports = { buscarCliente, atualizarCliente };
