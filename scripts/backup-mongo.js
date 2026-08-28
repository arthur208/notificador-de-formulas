// Backup e restauração do banco sem depender do mongodump.
//
// O mongodump vem no pacote mongodb-database-tools, que é separado do
// servidor e não estava instalado nem no servidor nem na máquina de
// desenvolvimento. Instalar pacote em máquina de produção só para tirar
// um backup é custo desnecessário: o driver que o sistema já usa faz isso.
//
// Grava um arquivo JSON por coleção, em formato EJSON — que preserva
// ObjectId, Date e os demais tipos do Mongo. JSON comum transformaria data
// em texto, e a restauração devolveria documento diferente do original.
//
//   node scripts/backup-mongo.js                      salva o banco do .env
//   node scripts/backup-mongo.js --banco notificador_logs --destino /tmp/bk
//   node scripts/backup-mongo.js --restaurar <pasta> --confirmar-banco <nome>
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');

function argumento(nome, padrao = null) {
    const i = process.argv.indexOf(`--${nome}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

function carimbo() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function salvar(cliente, banco, destino) {
    fs.mkdirSync(destino, { recursive: true });
    const db = cliente.db(banco);
    const colecoes = await db.listCollections().toArray();

    let total = 0;
    for (const { name } of colecoes) {
        const docs = await db.collection(name).find({}).toArray();
        fs.writeFileSync(
            path.join(destino, `${name}.json`),
            EJSON.stringify(docs, undefined, 2, { relaxed: false })
        );
        console.log(`  ${name}: ${docs.length} documento(s)`);
        total += docs.length;
    }

    fs.writeFileSync(
        path.join(destino, '_backup.json'),
        JSON.stringify({ banco, em: new Date().toISOString(), colecoes: colecoes.length, documentos: total }, null, 2)
    );
    console.log(`\n${total} documento(s) em ${colecoes.length} coleção(ões).`);
    console.log(`Salvo em ${destino}`);
}

async function restaurar(cliente, banco, origem, confirmado) {
    if (confirmado !== banco) {
        console.error(
            `Restaurar APAGA as coleções de "${banco}" e põe o conteúdo do backup no lugar.\n` +
            `Para confirmar, repita o nome do banco:\n\n` +
            `  node scripts/backup-mongo.js --restaurar ${origem} --confirmar-banco ${banco}\n`
        );
        process.exit(1);
    }

    const arquivos = fs.readdirSync(origem).filter((f) => f.endsWith('.json') && f !== '_backup.json');
    if (arquivos.length === 0) {
        console.error(`Nenhuma coleção em ${origem}.`);
        process.exit(1);
    }

    const db = cliente.db(banco);
    for (const arquivo of arquivos) {
        const nome = path.basename(arquivo, '.json');
        const docs = EJSON.parse(fs.readFileSync(path.join(origem, arquivo), 'utf8'));
        await db.collection(nome).deleteMany({});
        if (docs.length > 0) await db.collection(nome).insertMany(docs);
        console.log(`  ${nome}: ${docs.length} documento(s) restaurado(s)`);
    }
    console.log('\nRestauração concluída.');
}

(async () => {
    const banco = argumento('banco', process.env.MONGO_DB_NAME);
    const paraRestaurar = argumento('restaurar');

    if (!banco) {
        console.error('Sem banco: defina MONGO_DB_NAME no .env ou passe --banco.');
        process.exit(1);
    }

    const cliente = new MongoClient(process.env.MONGO_URI);
    await cliente.connect();

    try {
        if (paraRestaurar) {
            console.log(`Restaurando "${banco}" a partir de ${paraRestaurar}\n`);
            await restaurar(cliente, banco, paraRestaurar, argumento('confirmar-banco'));
        } else {
            const destino = argumento('destino', path.join('backups', `${banco}-${carimbo()}`));
            console.log(`Copiando "${banco}"\n`);
            await salvar(cliente, banco, destino);
        }
    } finally {
        await cliente.close();
    }
})().catch((erro) => {
    console.error('Falhou:', erro.message);
    process.exit(1);
});
