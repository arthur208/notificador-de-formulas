const usuarioService = require('../services/usuarioService');
const auditoria = require('../services/auditoriaService');

async function listar(_req, res) {
    res.json({
        usuarios: await usuarioService.listarUsuarios(),
        papeis: usuarioService.PAPEIS,
    });
}

async function criar(req, res) {
    const { nome, email, senha, papel } = req.body || {};

    if (!nome || !email || !senha) {
        return res.status(400).json({ erro: 'Informe nome, e-mail e senha.' });
    }

    try {
        const usuario = await usuarioService.criarUsuario({ nome, email, senha, papel });
        await auditoria.registrar({
            usuario: req.usuario, acao: 'criar', entidade: 'usuario',
            entidadeId: String(usuario._id),
            valorNovo: { nome: usuario.nome, email: usuario.email, papel: usuario.papel },
        });
        res.status(201).json({ usuario });
    } catch (erro) {
        // Índice único de e-mail.
        if (erro.code === 11000) {
            return res.status(409).json({ erro: 'Já existe um usuário com este e-mail.' });
        }
        res.status(400).json({ erro: erro.message });
    }
}

async function atualizar(req, res) {
    const { id } = req.params;
    const { nome, papel, ativo } = req.body || {};

    const anterior = await usuarioService.buscarPorId(id);
    if (!anterior) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    // Deixar o sistema sem nenhum admin ativo o tornaria inadministrável:
    // ninguém mais mexeria em credencial nem criaria usuário.
    const perdeAdmin = (papel !== undefined && papel !== 'admin') || ativo === false;
    if (perdeAdmin && await usuarioService.ehUltimoAdmin(id)) {
        return res.status(409).json({
            erro: 'Este é o único admin ativo. Promova outro antes de mudar este.',
        });
    }

    try {
        await usuarioService.atualizarUsuario(id, { nome, papel, ativo });
        await auditoria.registrar({
            usuario: req.usuario, acao: 'atualizar', entidade: 'usuario', entidadeId: id,
            valorAnterior: { nome: anterior.nome, papel: anterior.papel, ativo: anterior.ativo },
            valorNovo: { nome, papel, ativo },
        });
        res.json({ ok: true });
    } catch (erro) {
        res.status(400).json({ erro: erro.message });
    }
}

async function redefinirSenha(req, res) {
    const { id } = req.params;
    const { senha } = req.body || {};

    const alvo = await usuarioService.buscarPorId(id);
    if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    try {
        await usuarioService.trocarSenha(id, senha);
        await auditoria.registrar({
            usuario: req.usuario, acao: 'redefinir senha', entidade: 'usuario', entidadeId: id,
            valorNovo: { email: alvo.email, senha },
        });
        res.json({ ok: true });
    } catch (erro) {
        res.status(400).json({ erro: erro.message });
    }
}

async function listarAuditoria(req, res) {
    const limite = Math.min(500, Math.max(1, parseInt(req.query.limite, 10) || 100));
    res.json({ registros: await auditoria.listarAuditoria({ limite }) });
}

module.exports = { listar, criar, atualizar, redefinirSenha, listarAuditoria };
