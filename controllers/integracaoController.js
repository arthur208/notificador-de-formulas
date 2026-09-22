const clienteService = require('../services/clienteService');
const { variantesDeTelefone, soDigitos } = require('../utils/telefone');
const { validarCadastro } = require('../utils/validacaoCadastro');
const { resumir } = require('../utils/resumoCliente');
const { limparPayload } = require('../utils/limparPayload');

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
            const clientes = await clienteService.buscarPorCpf(digitos);
            return res.json({
                consultadoPor: 'cpf',
                encontrados: clientes.length,
                clientes: clientes.map(resumir),
            });
        }

        const variantes = variantesDeTelefone(telefone);
        if (variantes.length === 0) {
            return res.status(400).json({
                erro: 'Telefone inválido. Informe com DDD, por exemplo 44991135801.',
            });
        }
        const clientes = await clienteService.buscarPorTelefone(telefone);
        return res.json({
            consultadoPor: 'telefone',
            // Ajuda a depurar "por que não achou": mostra o que foi procurado.
            variantes,
            encontrados: clientes.length,
            clientes: clientes.map(resumir),
        });
    } catch (erro) {
        console.error('Erro na consulta de cliente:', erro.message);
        return res.status(502).json({ erro: 'Não foi possível consultar o cadastro agora.' });
    }
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
    const corpo = limparPayload(req.body);

    // Telefone sem número é slot do template que ninguém preencheu, não
    // pedido de alteração. `numero: null` (vindo de "__NULL__") permanece:
    // aquele é pedido de apagar.
    if (Array.isArray(corpo.telefones)) {
        corpo.telefones = corpo.telefones.filter((t) => t && t.numero !== undefined);
        if (corpo.telefones.length === 0) delete corpo.telefones;
    }

    if (Object.keys(corpo).length === 0) {
        return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
    }

    const erros = validarCadastro(corpo);
    if (erros.length > 0) {
        return res.status(422).json({
            erro: 'O cadastro não passou na validação. Nada foi alterado.',
            erros,
        });
    }

    try {
        const cliente = await clienteService.atualizarCadastro(codigo, corpo);
        // Mesmo resumo da consulta: se o PUT devolvesse o cadastro inteiro,
        // bastaria gravar qualquer coisa para ler o que o GET esconde.
        // O `faltando` aqui já reflete a gravação — é ele que diz se ainda
        // sobrou campo para pedir ao cliente.
        return res.json({ atualizado: true, cliente: resumir(cliente) });
    } catch (erro) {
        if (erro.situacao) {
            return res.status(erro.situacao).json({ erro: erro.message });
        }
        console.error('Erro ao atualizar cadastro:', erro.message);
        return res.status(502).json({
            erro: 'Não foi possível gravar no ERP. Nada foi alterado.',
            detalhe: erro.message,
        });
    }
}

module.exports = { buscarCliente, atualizarCliente };
