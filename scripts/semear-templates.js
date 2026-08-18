require('dotenv').config();
const { connectToMongo, getDb, config } = require('../config/db');
const { TEMPLATES_PADRAO } = require('../services/templateService');

(async () => {
    await connectToMongo();
    console.log(`Semeando templates na base "${config.mongo.dbName}".`);

    const colecao = getDb().collection('templates');
    for (const [modalidade, template] of Object.entries(TEMPLATES_PADRAO)) {
        await colecao.updateOne(
            { modalidade },
            { $setOnInsert: { modalidade, ...template, versao: 1, atualizadoEm: new Date() } },
            { upsert: true }
        );
        console.log(`  ${modalidade}: pronto`);
    }
    process.exit(0);
})();
