'use strict';

// Tratamento de erro que acontece ANTES de chegar na rota — corpo que não é
// JSON válido, corpo grande demais.
//
// Sem isto, o Express devolve uma página HTML com o stack trace inteiro,
// caminhos do servidor inclusive. Duas coisas erradas ao mesmo tempo: entrega
// estrutura interna a quem chamou, e quebra qualquer cliente que espere JSON —
// a plataforma de agente recebe `<!DOCTYPE html>` e engasga sem dizer por quê.

function tratarErros(erro, req, res, proximo) {
    if (res.headersSent) return proximo(erro);

    const paraApi = req.path.startsWith('/api/') || req.path.startsWith('/auth/');

    if (erro?.type === 'entity.parse.failed') {
        console.error(`JSON inválido em ${req.method} ${req.originalUrl}: ${erro.message}`);
        return res.status(400).json({
            erro: 'O corpo não é um JSON válido.',
            // A mensagem do parser aponta a posição do defeito; sem ela, quem
            // integra fica adivinhando onde errou.
            detalhe: erro.message,
        });
    }

    if (erro?.type === 'entity.too.large') {
        return res.status(413).json({ erro: 'O corpo é grande demais.' });
    }

    console.error(`Erro não tratado em ${req.method} ${req.originalUrl}:`, erro);
    if (paraApi) {
        return res.status(500).json({ erro: 'Erro interno.' });
    }
    return res.status(500).type('text/plain').send('Erro interno.');
}

module.exports = { tratarErros };
