// Conferência antes de deixar o sistema no ar. Toca em tudo que, faltando,
// só apareceria com a farmácia usando: bancos, credenciais, semeaduras.
//
// Uso:  node scripts/verificar-ambiente.js
// Sai com código 1 se algo estiver bloqueando.
require('dotenv').config();

const problemas = [];
const avisos = [];

function ok(texto) { console.log(`  ok    ${texto}`); }
function falha(texto) { console.log(`  FALHA ${texto}`); problemas.push(texto); }
function aviso(texto) { console.log(`  aviso ${texto}`); avisos.push(texto); }

async function main() {
    console.log('\n--- Configuração ---');
    let config;
    try {
        config = require('../config/db').config;
        ok(`porta ${config.porta}`);
        ok(`Firebird ${config.firebird.host}:${config.firebird.port}`);
        ok(`Mongo ${config.mongo.uri} · banco "${config.mongo.dbName}" · logs "${config.mongo.colecaoLogs}"`);
        ok(`MultiAtend ${config.multiatendBaseUrl}`);
    } catch (erro) {
        falha(erro.message);
        return relatorio();
    }

    // A chave cifra as credenciais do canal. Trocá-la torna o que está
    // gravado ilegível, e o envio passa a falhar na autenticação.
    if ((process.env.APP_CRYPTO_KEY || '').length < 32) {
        falha('APP_CRYPTO_KEY curta demais — gere com crypto.randomBytes(32)');
    } else {
        ok('APP_CRYPTO_KEY presente');
    }

    console.log('\n--- MongoDB ---');
    const { connectToMongo, getDb } = require('../config/db');
    try {
        await connectToMongo();
        ok('conectado');
    } catch (erro) {
        falha(`Mongo inacessível: ${erro.message}`);
        return relatorio();
    }

    const db = getDb();

    // Histórico: se a coleção de logs estiver vazia em produção, quase certo
    // que MONGO_DB_NAME ou MONGO_COLLECTION_LOGS está apontando para o lugar
    // errado — e o sistema começaria a gravar num canto novo, sem histórico.
    const colLogs = db.collection(config.mongo.colecaoLogs);
    const logs = await colLogs.countDocuments();
    if (logs === 0) {
        aviso(`coleção de logs vazia — confira MONGO_DB_NAME e MONGO_COLLECTION_LOGS`);
    } else {
        ok(`${logs} envios no histórico`);

        // O "já avisada" da lista depende deste formato. Se codigoReceita
        // estiver gravado como texto, o $in com números não casa, a tela
        // mostra todo mundo como pendente e a farmácia reavisa a base
        // inteira. Falha silenciosa e cara — vale conferir antes.
        const tipos = await colLogs.aggregate([
            { $group: { _id: { $type: '$codigoReceita' }, qtd: { $sum: 1 } } },
        ]).toArray();
        const naoInteiros = tipos.filter((t) => !['int', 'long', 'double'].includes(t._id));
        if (naoInteiros.length > 0) {
            falha(`codigoReceita não é número em ${naoInteiros.map((t) => `${t.qtd} doc(s) do tipo ${t._id}`).join(', ')} — a deduplicação vai falhar`);
        } else {
            ok('formato do histórico compatível com a deduplicação');
        }

        const sucessos = await colLogs.countDocuments({ status: 'sucesso' });
        if (sucessos === 0) falha('nenhum registro com status "sucesso" — a deduplicação nunca vai encontrar nada');
        else ok(`${sucessos} envios com sucesso reconhecíveis`);
    }

    console.log('\n--- Semeaduras obrigatórias ---');
    const admins = await db.collection('usuarios').countDocuments({ papel: 'admin', ativo: { $ne: false } });
    if (admins === 0) falha('nenhum admin ativo — rode scripts/criar-usuario.js');
    else ok(`${admins} admin(s) ativo(s)`);

    const canal = await db.collection('canal_config').findOne({});
    if (!canal) falha('canal de envio não configurado — rode scripts/semear-canal.js');
    else if (!canal.ativo) falha('canal existe mas está inativo');
    else if (!canal.token || !canal.clientId || !canal.clientSecret) falha('canal incompleto');
    else ok('canal de envio configurado');

    const templates = await db.collection('templates').countDocuments();
    const { VARIAVEIS_POR_MODALIDADE } = require('../services/templateService');
    const esperados = Object.keys(VARIAVEIS_POR_MODALIDADE).length;
    if (templates === 0) aviso(`nenhum template salvo — o sistema usa os padrões embutidos`);
    else if (templates < esperados) aviso(`${templates} de ${esperados} templates salvos; o resto usa o padrão`);
    else ok(`${templates} templates`);

    const cidades = await db.collection('cidades_entrega').countDocuments({ ativo: { $ne: false } });
    if (cidades === 0) aviso('nenhuma cidade cadastrada — toda entrega sai sem prazo');
    else ok(`${cidades} cidade(s) com prazo`);

    console.log('\n--- Firebird ---');
    const { fbPool } = require('../config/db');
    try {
        const fb = require('../services/firebirdService');
        const inicio = Date.now();
        const hoje = new Date().toISOString().slice(0, 10);
        const receitas = await fb.getReceitasConferidas(hoje);
        ok(`consulta do dia respondeu em ${Date.now() - inicio}ms (${receitas.length} receitas)`);
    } catch (erro) {
        falha(`Firebird: ${erro.message}`);
    } finally {
        fbPool.destroy();
    }

    console.log('\n--- API de envio ---');
    try {
        const axios = require('axios');
        const { carregarCanal } = require('../services/canalConfigService');
        const c = await carregarCanal();
        if (!c) {
            falha('sem canal para testar');
        } else {
            const { data } = await axios.post(
                `${config.multiatendBaseUrl}/api/v1/auth/token`,
                { grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.clientSecret },
                { timeout: 20000 }
            );
            if (data?.access_token) ok('autenticação aceita');
            else falha('autenticação não devolveu access_token');
        }
    } catch (erro) {
        falha(`API de envio recusou: ${erro.response?.status ?? erro.message}`);
    }

    console.log('\n--- Front construído ---');
    const fs = require('node:fs');
    const path = require('node:path');
    const indice = path.join(__dirname, '..', 'public', 'index.html');
    if (!fs.existsSync(indice)) {
        falha('public/index.html não existe — rode npm run build');
    } else {
        const idade = Math.round((Date.now() - fs.statSync(indice).mtimeMs) / 60000);
        ok(`public/index.html gerado há ${idade} min`);
    }

    relatorio();
}

function relatorio() {
    console.log('\n========================================');
    if (problemas.length === 0 && avisos.length === 0) {
        console.log('Tudo certo. Pode subir.');
    } else {
        if (avisos.length > 0) console.log(`${avisos.length} aviso(s) — não bloqueiam, mas confira.`);
        if (problemas.length > 0) {
            console.log(`${problemas.length} problema(s) BLOQUEANDO:`);
            for (const p of problemas) console.log(`  - ${p}`);
        }
    }
    console.log('========================================\n');
    process.exit(problemas.length > 0 ? 1 : 0);
}

main().catch((erro) => {
    console.error('\nErro inesperado na verificação:', erro);
    process.exit(1);
});
