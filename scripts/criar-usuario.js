require('dotenv').config();
const readline = require('node:readline/promises');
const { connectToMongo, config } = require('../config/db');
const { criarUsuario, garantirIndices, PAPEIS } = require('../services/usuarioService');

(async () => {
    await connectToMongo();
    await garantirIndices();
    console.log(`Criando usuário na base "${config.mongo.dbName}".\n`);

    const io = readline.createInterface({ input: process.stdin, output: process.stdout });
    const nome = await io.question('Nome: ');
    const email = await io.question('E-mail: ');
    const senha = await io.question('Senha (mínimo 8 caracteres): ');
    const papel = await io.question(`Papel (${PAPEIS.join(' / ')}): `);
    io.close();

    const usuario = await criarUsuario({ nome, email, senha, papel: papel.trim() });
    console.log('\nCriado:', { nome: usuario.nome, email: usuario.email, papel: usuario.papel });
    process.exit(0);
})();
