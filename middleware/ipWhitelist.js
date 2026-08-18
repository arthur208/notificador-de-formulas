// Lembre-se de adicionar seus IPs públicos e internos aqui
const whitelist = [
    '::1',
    '127.0.0.1',
    '192.168.254.71',
    // '192.168.0.10',
    // '10.0.0.5',
];

const ipWhitelistMiddleware = (req, res, next) => {
    let ipRequisitante = req.ip;

    // Sem IP não há como avaliar a lista: nega (falha fechada).
    if (typeof ipRequisitante !== 'string' || ipRequisitante === '') {
        console.warn('Acesso bloqueado: requisição sem IP identificável.');
        return responderNegado(req, res);
    }

    // Normaliza o IP se for um IPv4-mapped IPv6 (ex: ::ffff:192.168.0.10)
    if (ipRequisitante.toLowerCase().startsWith('::ffff:')) {
        ipRequisitante = ipRequisitante.slice('::ffff:'.length);
    }

    // Permite IPs da lista ou IPs de redes internas comuns
    const isAllowed = whitelist.includes(ipRequisitante) ||
                      ipRequisitante.startsWith('192.168.') ||
                      ipRequisitante.startsWith('10.');

    if (isAllowed) return next();

    console.warn(`Acesso bloqueado para o IP: ${req.ip} (normalizado: ${ipRequisitante})`);
    return responderNegado(req, res);
};

// O front chama response.json() nas rotas de API. Devolver text/html ali
// fazia a atendente ver "Unexpected token 'A'" em vez de "acesso negado".
function responderNegado(req, res) {
    if (typeof req.path === 'string' && req.path.startsWith('/api/')) {
        return res.status(403).json({ erro: 'Acesso negado.' });
    }
    return res.status(403).type('text/plain').send('Acesso negado.');
}

module.exports = ipWhitelistMiddleware;
