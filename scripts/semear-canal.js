// Semeia as credenciais do canal no Mongo, sem passar por arquivo.
// Uso: node scripts/semear-canal.js
require('dotenv').config();
const readline = require('node:readline/promises');
const { connectToMongo, config } = require('../config/db');
const { salvarCanal, carregarCanal, canalParaExibicao } = require('../services/canalConfigService');

(async () => {
    await connectToMongo();
    console.log(`Gravando na base "${config.mongo.dbName}". Confirme que NÃO é produção.\n`);

    const io = readline.createInterface({ input: process.stdin, output: process.stdout });
    const token = await io.question('Token da conexão whatsmeow: ');
    const clientId = await io.question('client_id: ');
    const clientSecret = await io.question('client_secret: ');
    const numeroRemetente = await io.question('Número remetente (só dígitos, com DDI): ');
    io.close();

    await salvarCanal({
        canal: 'whatsmeow',
        token: token.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        numeroRemetente: numeroRemetente.trim(),
        botoesAtivos: false,
        ativo: true,
    });

    console.log('\nGravado:', canalParaExibicao(await carregarCanal()));
    process.exit(0);
})();
