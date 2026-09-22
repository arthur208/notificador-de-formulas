// Cria um token de integração.
//   node scripts/criar-token-api.js "Chatbot WhatsApp"
//   node scripts/criar-token-api.js "n8n" clientes:ler,receitas:ler
//   node scripts/criar-token-api.js --listar
//   node scripts/criar-token-api.js --revogar <identificador>
require('dotenv').config();
const { connectToMongo, config } = require('../config/db');
const servico = require('../services/tokenApiService');

(async () => {
    await connectToMongo();
    await servico.garantirIndices();
    const [arg, extra] = process.argv.slice(2);

    if (arg === '--listar') {
        const tokens = await servico.listarTokens();
        if (tokens.length === 0) console.log('Nenhum token criado.');
        for (const t of tokens) {
            console.log(`${t.ativo ? 'ativo  ' : 'revogado'} ${t.identificador}  ${t.nome}`);
            console.log(`         escopos: ${(t.escopos || []).join(', ')}`);
            console.log(`         usos: ${t.chamadas ?? 0} | último: ${t.ultimoUso ?? 'nunca'}`);
        }
        process.exit(0);
    }

    if (arg === '--revogar') {
        if (!extra) { console.error('Informe o identificador. Veja com --listar.'); process.exit(1); }
        console.log(await servico.revogarToken(extra) ? 'Revogado.' : 'Identificador não encontrado.');
        process.exit(0);
    }

    if (!arg) {
        console.error('Uso: node scripts/criar-token-api.js "Nome do consumidor" [escopos]');
        console.error(`Escopos: ${servico.ESCOPOS.join(', ')}`);
        process.exit(1);
    }

    const escopos = extra ? extra.split(',').map((e) => e.trim()) : ['clientes:ler'];
    const criado = await servico.criarToken({ nome: arg, escopos });

    console.log(`\nBanco: ${config.mongo.dbName}`);
    console.log(`Nome:    ${criado.nome}`);
    console.log(`Escopos: ${criado.escopos.join(', ')}`);
    console.log(`\n  ${criado.token}\n`);
    console.log('Use assim:');
    console.log(`  curl -H "Authorization: Bearer ${criado.token}" "http://SEU-SERVIDOR:3008/api/integracao/cliente?telefone=44991135801"`);
    console.log('\nGuarde o token. Ele pode ser remontado a partir do identificador,');
    console.log('mas só por quem tiver acesso ao servidor e à APP_CRYPTO_KEY.');
    process.exit(0);
})().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
