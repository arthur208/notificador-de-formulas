const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const limite = require('../utils/limiteTentativas');

beforeEach(() => limite._limpar());

test('primeira tentativa não é barrada', () => {
    assert.strictEqual(limite.bloqueadoPor('a@b.com', '1.2.3.4'), 0);
});

test('barra depois do limite de falhas do mesmo e-mail', () => {
    for (let i = 0; i < limite.MAX_POR_CHAVE; i++) limite.registrarFalha('a@b.com', '1.2.3.4');
    assert.ok(limite.bloqueadoPor('a@b.com', '1.2.3.4') > 0);
});

test('abaixo do limite ainda passa', () => {
    for (let i = 0; i < limite.MAX_POR_CHAVE - 1; i++) limite.registrarFalha('a@b.com', '1.2.3.4');
    assert.strictEqual(limite.bloqueadoPor('a@b.com', '1.2.3.4'), 0);
});

// Espalhar por vários e-mails do mesmo IP não pode escapar do freio.
test('a origem também é contada', () => {
    for (let i = 0; i < limite.MAX_POR_ORIGEM; i++) {
        limite.registrarFalha(`usuario${i}@b.com`, '1.2.3.4');
    }
    assert.ok(limite.bloqueadoPor('novo@b.com', '1.2.3.4') > 0);
});

// Bloquear por e-mail não pode virar meio de descobrir quem existe: o
// bloqueio vale igual para e-mail que nunca foi cadastrado.
test('e-mail inexistente também acumula falha', () => {
    for (let i = 0; i < limite.MAX_POR_CHAVE; i++) limite.registrarFalha('ninguem@b.com', '9.9.9.9');
    assert.ok(limite.bloqueadoPor('ninguem@b.com', '9.9.9.9') > 0);
});

test('outro IP não herda o bloqueio de e-mail de terceiros', () => {
    for (let i = 0; i < limite.MAX_POR_CHAVE; i++) limite.registrarFalha('a@b.com', '1.2.3.4');
    assert.strictEqual(limite.bloqueadoPor('outro@b.com', '5.6.7.8'), 0);
});

test('acerto limpa a contagem', () => {
    for (let i = 0; i < limite.MAX_POR_CHAVE; i++) limite.registrarFalha('a@b.com', '1.2.3.4');
    limite.registrarSucesso('a@b.com', '1.2.3.4');
    assert.strictEqual(limite.bloqueadoPor('a@b.com', '1.2.3.4'), 0);
});

test('e-mail é comparado sem caixa nem espaço', () => {
    for (let i = 0; i < limite.MAX_POR_CHAVE; i++) limite.registrarFalha('  A@B.com ', '1.2.3.4');
    assert.ok(limite.bloqueadoPor('a@b.com', '1.2.3.4') > 0);
});
