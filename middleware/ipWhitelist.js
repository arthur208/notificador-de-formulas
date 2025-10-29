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
    
    // Normaliza o IP se for um IPv4-mapped IPv6
    if (ipRequisitante.startsWith('::ffff:')) {
        ipRequisitante = ipRequisitante.substring(7);
    }
    
    // Permite IPs da lista ou IPs de redes internas comuns
    const isAllowed = whitelist.includes(ipRequisitante) || 
                      ipRequisitante.startsWith('192.168.') || 
                      ipRequisitante.startsWith('10.');

    if (isAllowed) {
        next(); // Permitido
    } else {
        console.warn(`Acesso bloqueado para o IP: ${req.ip} (Normalizado para: ${ipRequisitante})`);
        res.status(403).send('Acesso Negado. Seu IP não está na lista de permissões.');
    }
};

module.exports = ipWhitelistMiddleware;
