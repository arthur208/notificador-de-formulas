const usuarioService = require('../services/usuarioService');
const sessaoService = require('../services/sessaoService');
const { conferirSenha } = require('../utils/senha');
const { lerCookies } = require('../utils/cookies');

const NOME_COOKIE = 'sessao';

function montarCookie(token, maxIdadeMs) {
    const partes = [
        `${NOME_COOKIE}=${token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${Math.floor(maxIdadeMs / 1000)}`,
    ];
    // O sistema roda atrás de HTTPS em produção. Em desenvolvimento sem TLS,
    // marcar Secure impediria o cookie de ser guardado.
    if (process.env.NODE_ENV === 'production') partes.push('Secure');
    return partes.join('; ');
}

async function login(req, res) {
    const { email, senha } = req.body || {};

    const usuario = await usuarioService.buscarPorEmail(email);
    const confere = usuario ? await conferirSenha(senha, usuario.senhaHash) : false;

    // Mesma resposta para e-mail inexistente e senha errada:
    // dizer qual dos dois falhou entrega lista de usuários válidos.
    if (!confere) {
        console.warn(`Login recusado para "${String(email).slice(0, 60)}".`);
        return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    const token = await sessaoService.abrirSessao(usuario);
    res.setHeader('Set-Cookie', montarCookie(token, sessaoService.DURACAO_MS));
    res.json({ usuario: usuarioService.semSegredo(usuario) });
}

async function logout(req, res) {
    const token = lerCookies(req.headers.cookie)[NOME_COOKIE];
    await sessaoService.encerrarSessao(token);
    res.setHeader('Set-Cookie', montarCookie('', 0));
    res.json({ ok: true });
}

async function eu(req, res) {
    if (!req.usuario) return res.status(401).json({ erro: 'Sessão expirada.' });
    res.json({ usuario: req.usuario });
}

module.exports = { login, logout, eu, NOME_COOKIE };
