'use strict';

const { variantesDeTelefone, soDigitos } = require('./telefone');

// Valida o cadastro inteiro ANTES de escrever qualquer coisa, e devolve
// TODOS os problemas de uma vez. Parar no primeiro erro obrigaria quem
// integra a descobrir os defeitos um por um, uma requisição por vez.
//
// Os limites vêm das colunas reais do ERP. Mandar texto maior que a coluna
// faria o Firebird truncar em silêncio ou recusar no meio da transação —
// depois de outras tabelas já terem sido tocadas.
const LIMITES = {
    nome: 40,          // PESSOAS.NOME
    logradouro: 40,    // PESSOAENDERECOS.LOGRADOURO
    numero: 5,         // PESSOAENDERECOS.NUMERO
    bairro: 20,        // PESSOAENDERECOS.BAIRRO
    complemento: 40,   // PESSOAENDERECOS.COMPLEMENTO
    email: 50,         // PESSOAINTERNET.ENDERECO
};

const TIPOS_FONE = ['celular', 'residencial', 'comercial', 'recado'];

// Dígitos verificadores. Sem isso, "11111111111" entraria como CPF válido
// e contaminaria o cadastro de forma difícil de desfazer.
function cpfValido(digitos) {
    if (digitos.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digitos)) return false;

    const calcular = (ate) => {
        let soma = 0;
        for (let i = 0; i < ate; i++) soma += Number(digitos[i]) * (ate + 1 - i);
        const resto = (soma * 10) % 11;
        return resto === 10 ? 0 : resto;
    };

    return calcular(9) === Number(digitos[9]) && calcular(10) === Number(digitos[10]);
}

function textoValido(valor) {
    return typeof valor === 'string' || typeof valor === 'number';
}

function validarCadastro(dados) {
    const erros = [];
    const erro = (campo, mensagem) => erros.push({ campo, erro: mensagem });

    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
        return [{ campo: 'corpo', erro: 'Envie um objeto com os campos a atualizar.' }];
    }

    const CONHECIDOS = ['nome', 'cpf', 'nascimento', 'email', 'telefones', 'endereco'];
    const desconhecidos = Object.keys(dados).filter((k) => !CONHECIDOS.includes(k));
    if (desconhecidos.length > 0) {
        // Campo com nome errado seria ignorado em silêncio, e quem integra
        // acharia que gravou.
        erro('corpo', `Campos desconhecidos: ${desconhecidos.join(', ')}. Aceitos: ${CONHECIDOS.join(', ')}.`);
    }
    if (Object.keys(dados).length === 0) {
        erro('corpo', 'Informe ao menos um campo para atualizar.');
    }

    if (dados.nome !== undefined) {
        if (!textoValido(dados.nome)) erro('nome', 'Precisa ser texto.');
        else {
            const nome = String(dados.nome).trim();
            if (nome === '') erro('nome', 'Não pode ficar vazio.');
            else if (nome.length > LIMITES.nome) erro('nome', `No máximo ${LIMITES.nome} caracteres; veio ${nome.length}.`);
            else if (!/[A-Za-zÀ-ÿ]/.test(nome)) erro('nome', 'Precisa ter ao menos uma letra.');
        }
    }

    if (dados.cpf !== undefined && dados.cpf !== null) {
        const digitos = soDigitos(dados.cpf);
        if (digitos.length !== 11) erro('cpf', 'Precisa ter 11 dígitos.');
        else if (!cpfValido(digitos)) erro('cpf', 'Dígitos verificadores não conferem.');
    }

    if (dados.nascimento !== undefined && dados.nascimento !== null) {
        const texto = String(dados.nascimento);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
            erro('nascimento', 'Use o formato AAAA-MM-DD.');
        } else {
            const data = new Date(`${texto}T00:00:00Z`);
            // Comparar os componentes de volta: "2026-02-31" vira 3 de março
            // em vez de falhar, e passaria por uma checagem só de ano.
            const volta = Number.isNaN(data.getTime()) ? '' : data.toISOString().slice(0, 10);
            if (volta !== texto) {
                erro('nascimento', 'Data inexistente.');
            } else if (data > new Date()) {
                erro('nascimento', 'Não pode ser no futuro.');
            } else if (data.getUTCFullYear() < 1900) {
                erro('nascimento', 'Anterior a 1900 — provável erro de digitação.');
            }
        }
    }

    if (dados.email !== undefined && dados.email !== null && String(dados.email).trim() !== '') {
        const email = String(dados.email).trim();
        if (email.length > LIMITES.email) erro('email', `No máximo ${LIMITES.email} caracteres; veio ${email.length}.`);
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erro('email', 'Formato inválido.');
    }

    if (dados.telefones !== undefined) {
        if (!Array.isArray(dados.telefones)) {
            erro('telefones', 'Precisa ser uma lista.');
        } else {
            dados.telefones.forEach((t, i) => {
                const onde = `telefones[${i}]`;
                if (!t || typeof t !== 'object') { erro(onde, 'Precisa ser um objeto {tipo, numero}.'); return; }
                if (!TIPOS_FONE.includes(t.tipo)) {
                    erro(`${onde}.tipo`, `Use um destes: ${TIPOS_FONE.join(', ')}.`);
                }
                // null apaga o número de propósito; string vazia é engano.
                if (t.numero !== null && variantesDeTelefone(t.numero).length === 0) {
                    erro(`${onde}.numero`, 'Telefone inválido. Informe com DDD, por exemplo 44991135801.');
                }
            });
            const tipos = dados.telefones.map((t) => t?.tipo).filter(Boolean);
            const repetidos = tipos.filter((t, i) => tipos.indexOf(t) !== i);
            if (repetidos.length > 0) {
                erro('telefones', `Tipo repetido: ${[...new Set(repetidos)].join(', ')}.`);
            }
        }
    }

    if (dados.endereco !== undefined) {
        const e = dados.endereco;
        if (!e || typeof e !== 'object' || Array.isArray(e)) {
            erro('endereco', 'Precisa ser um objeto.');
        } else {
            const CAMPOS_END = ['logradouro', 'numero', 'complemento', 'bairro', 'cep', 'codigoCidade'];
            const extras = Object.keys(e).filter((k) => !CAMPOS_END.includes(k));
            if (extras.length > 0) {
                erro('endereco', `Campos desconhecidos: ${extras.join(', ')}. Aceitos: ${CAMPOS_END.join(', ')}.`);
            }

            for (const campo of ['logradouro', 'numero', 'complemento', 'bairro']) {
                if (e[campo] === undefined || e[campo] === null) continue;
                if (!textoValido(e[campo])) { erro(`endereco.${campo}`, 'Precisa ser texto.'); continue; }
                const valor = String(e[campo]).trim();
                if (valor.length > LIMITES[campo]) {
                    erro(`endereco.${campo}`, `No máximo ${LIMITES[campo]} caracteres; veio ${valor.length}.`);
                }
            }

            if (e.cep !== undefined && e.cep !== null && String(e.cep).trim() !== '') {
                const digitos = soDigitos(e.cep);
                if (digitos.length !== 8) erro('endereco.cep', 'Precisa ter 8 dígitos.');
            }

            if (e.codigoCidade !== undefined && e.codigoCidade !== null) {
                if (!Number.isInteger(Number(e.codigoCidade)) || Number(e.codigoCidade) <= 0) {
                    erro('endereco.codigoCidade', 'Precisa ser um número inteiro positivo.');
                }
            }
        }
    }

    return erros;
}

module.exports = { validarCadastro, cpfValido, LIMITES, TIPOS_FONE };
