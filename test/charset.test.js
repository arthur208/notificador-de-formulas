const { test, after } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();

const temBanco = Boolean(process.env.FB_HOST && process.env.FB_DB_PATH);

// O banco é charset NONE e o node-firebird decodifica tudo como UTF8,
// transformando byte acentuado em U+FFFD. Isso já mandou o nome corrompido
// para 258 clientes reais. A correção é CAST no SQL, feito pelo servidor.
const SUBSTITUICAO = '�';

test('nomes de cliente não voltam com caractere de substituição',
    { skip: !temBanco }, async () => {
        const { getRecipeData } = require('../services/firebirdService');

        // Receita cujo cliente tem "ç" no nome (MARIA DA CONCEIÇAO NASCIMENTO).
        const dados = await getRecipeData(441707);
        assert.ok(dados, 'a receita de referência precisa existir');
        assert.ok(
            !dados.nome.includes(SUBSTITUICAO),
            `O nome voltou corrompido: ${JSON.stringify(dados.nome)}. ` +
            `Faltou CAST(... CHARACTER SET WIN1252) na consulta.`
        );
        assert.match(dados.nome, /Concei[çc]ao/i);
    });

test('nomes na lista de conferidas também vêm íntegros',
    { skip: !temBanco }, async () => {
        const { getReceitasConferidas } = require('../services/firebirdService');
        const { hojeISO } = require('../utils/datas');

        const receitas = await getReceitasConferidas(hojeISO());
        const corrompidos = receitas.filter((r) => r.nome.includes(SUBSTITUICAO));
        assert.deepStrictEqual(
            corrompidos.map((r) => r.nome), [],
            'nenhum nome da lista pode conter caractere de substituição'
        );
    });

after(async () => {
    if (!temBanco) return;
    const { fbPool } = require('../config/db');
    await new Promise((resolve) => {
        try { fbPool.destroy(resolve); } catch { resolve(); }
    });
});
