'use strict';

// Resumo do cadastro para quem consome de fora.
//
// A integração não precisa do cadastro inteiro: precisa saber quem é a
// pessoa, o suficiente para ela se reconhecer, e o que falta preencher.
// Devolver CPF, endereço e telefone completos espalharia dado pessoal por
// toda ferramenta que encostar na API — e quem integra raramente apaga log.
//
// Quem precisa do dado cru continua tendo: ele está no ERP, na tela do
// balcão, com gente identificada por trás.

// Mostra o miolo e esconde as pontas: o cliente reconhece o próprio CPF,
// mas o número não sai daqui inteiro.
//   03721801911 -> ***.218.019-**
function mascararCpf(cpf) {
    const digitos = String(cpf ?? '').replace(/\D/g, '');
    if (digitos.length !== 11) return null;
    return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
}

function primeiroNome(nome) {
    const limpo = String(nome ?? '').trim();
    if (limpo === '') return null;
    return limpo.split(/\s+/)[0];
}

// Ordem fixa e propositalmente estável: quem integra monta a pergunta ao
// cliente a partir desta lista, e ordem que muda a cada chamada faria a
// conversa mudar sozinha.
const CAMPOS_CONFERIDOS = [
    'nome', 'cpf', 'nascimento', 'telefone',
    'logradouro', 'numero', 'bairro', 'cep', 'cidade', 'email',
];

// O endereço de entrega é o que interessa; sem marcação, o primeiro serve.
function enderecoPrincipal(cliente) {
    const enderecos = cliente.enderecos ?? [];
    return enderecos.find((e) => e.entrega) ?? enderecos[0] ?? {};
}

function faltando(cliente) {
    const e = enderecoPrincipal(cliente);
    const temTelefone = (cliente.telefones ?? []).length > 0;

    const presenca = {
        nome: Boolean(cliente.nome),
        cpf: Boolean(cliente.cpf),
        nascimento: Boolean(cliente.nascimento),
        telefone: temTelefone,
        logradouro: Boolean(e.logradouro),
        numero: Boolean(e.numero),
        bairro: Boolean(e.bairro),
        cep: Boolean(e.cep),
        cidade: Boolean(e.cidade),
        email: Boolean(cliente.email),
    };

    return CAMPOS_CONFERIDOS.filter((campo) => !presenca[campo]);
}

function resumir(cliente) {
    if (!cliente) return null;
    const e = enderecoPrincipal(cliente);
    const pendentes = faltando(cliente);

    return {
        codigoPessoa: cliente.codigoPessoa,
        nome: cliente.nome,
        primeiroNome: primeiroNome(cliente.nome),
        cpfMascarado: mascararCpf(cliente.cpf),
        cidade: e.cidade ? [e.cidade, e.uf].filter(Boolean).join('/') : null,
        completo: pendentes.length === 0,
        faltando: pendentes,
    };
}

module.exports = { resumir, mascararCpf, primeiroNome, faltando, CAMPOS_CONFERIDOS };
