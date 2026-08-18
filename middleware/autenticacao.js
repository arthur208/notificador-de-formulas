const sessaoService = require('../services/sessaoService');
const { lerCookies } = require('../utils/cookies');
const { NOME_COOKIE } = require('../controllers/authController');

// Hierarquia: quem está acima faz tudo que está abaixo.
const NIVEL = { atendente: 1, gestor: 2, admin: 3 };

function podePapel(papelDoUsuario, permitidos) {
    const meu = NIVEL[papelDoUsuario];
    if (!meu) return false;
    return permitidos.some((papel) => meu >= (NIVEL[papel] ?? Infinity));
}

// Popula req.usuario quando há sessão. Nunca bloqueia — quem bloqueia
// é exigirSessao. Assim uma rota pública ainda sabe quem está logado.
async function carregarUsuario(req, _res, next) {
    try {
        const token = lerCookies(req.headers.cookie)[NOME_COOKIE];
        const sessao = await sessaoService.buscarSessao(token);
        req.usuario = sessao?.usuario ?? null;
    } catch (erro) {
        console.error('Falha ao carregar a sessão:', erro.message);
        req.usuario = null;
    }
    next();
}

function exigirSessao(req, res, next) {
    if (!req.usuario) return res.status(401).json({ erro: 'Entre para continuar.' });
    next();
}

function exigirPapel(...papeis) {
    return (req, res, next) => {
        if (!req.usuario) return res.status(401).json({ erro: 'Entre para continuar.' });
        if (!podePapel(req.usuario.papel, papeis)) {
            return res.status(403).json({ erro: 'Seu perfil não permite esta ação.' });
        }
        next();
    };
}

module.exports = { carregarUsuario, exigirSessao, exigirPapel, podePapel };
