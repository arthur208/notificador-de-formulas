const tokenApiService = require('../services/tokenApiService');
const limite = require('../utils/limiteTentativas');

// Autenticação das rotas de integração. Separada da sessão de propósito:
// aqui quem chama é máquina, e máquina não tem cookie nem navegador.
//
// Vale só em /api/integracao. As rotas que a tela usa continuam exigindo
// sessão — um token vazado não pode virar acesso ao sistema inteiro.
function exigirToken(...escoposNecessarios) {
    return async (req, res, next) => {
        const cabecalho = req.get('authorization') ?? '';
        const [esquema, valor] = cabecalho.split(' ');

        if (!valor || String(esquema).toLowerCase() !== 'bearer') {
            return res.status(401).json({
                erro: 'Informe o token: Authorization: Bearer <token>.',
            });
        }

        // Mesmo freio do login. Token é adivinhável em teoria, e nada aqui
        // impediria alguém de tentar milhões de vezes.
        const espera = limite.bloqueadoPor(valor.slice(0, 20), req.ip);
        if (espera > 0) {
            return res.status(429).json({
                erro: `Muitas tentativas. Tente de novo em ${Math.ceil(espera / 60)} minuto(s).`,
            });
        }

        let dono;
        try {
            dono = await tokenApiService.validarToken(valor);
        } catch (erro) {
            console.error('Falha ao validar token de API:', erro.message);
            return res.status(500).json({ erro: 'Não foi possível validar o token.' });
        }

        if (!dono) {
            limite.registrarFalha(valor.slice(0, 20), req.ip);
            // Uma resposta só para token inexistente, revogado e segredo
            // errado: distinguir diria a quem tenta o que acertou.
            return res.status(401).json({ erro: 'Token inválido.' });
        }

        const faltando = escoposNecessarios.filter((e) => !dono.escopos.includes(e));
        if (faltando.length > 0) {
            return res.status(403).json({
                erro: `Este token não tem permissão para: ${faltando.join(', ')}.`,
            });
        }

        limite.registrarSucesso(valor.slice(0, 20), req.ip);
        req.tokenApi = dono;
        next();
    };
}

module.exports = { exigirToken };
