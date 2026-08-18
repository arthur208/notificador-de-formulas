const { test, after } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();

const temBanco = Boolean(process.env.FB_HOST && process.env.FB_DB_PATH);

test('getReceitasConferidas responde abaixo de 500ms', { skip: !temBanco }, async () => {
    const { getReceitasConferidas } = require('../services/firebirdService');
    const { hojeISO } = require('../utils/datas');

    // Aquece o pool: a primeira conexão custa centenas de ms e não tem
    // relação com o que este teste vigia, que é a forma da consulta.
    await getReceitasConferidas(hojeISO());

    const inicio = Date.now();
    await getReceitasConferidas(hojeISO());
    const decorrido = Date.now() - inicio;

    assert.ok(
        decorrido < 500,
        `A consulta levou ${decorrido}ms. Acima de 500ms indica que as duas ` +
        `queries voltaram a ser uma com IN (SELECT ...) — que mediu 6455ms.`
    );
});

// Sem isto o processo de teste nunca encerra: o pool do Firebird mantém
// conexões abertas e o event loop vivo.
after(async () => {
    if (!temBanco) return;
    const { fbPool } = require('../config/db');
    await new Promise((resolve) => {
        try {
            fbPool.destroy(resolve);
        } catch {
            resolve();
        }
    });
});
