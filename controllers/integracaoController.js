const clienteService = require('../services/clienteService');
const { variantesDeTelefone, soDigitos } = require('../utils/telefone');

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
            return res.json({ consultadoPor: 'cpf', encontrados: clientes.length, clientes });
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
            clientes,
        });
    } catch (erro) {
        console.error('Erro na consulta de cliente:', erro.message);
        return res.status(502).json({ erro: 'Não foi possível consultar o cadastro agora.' });
    }
}

module.exports = { buscarCliente };
