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
//
// Tudo que um agente precisaria interpretar vem calculado daqui: a regra de
// negócio mora no servidor, não no prompt.

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

// O ERP preenche campo vazio com fachada em vez de nulo: "." no bairro,
// "....." no logradouro, "00000000" no CEP — isso vem dos gatilhos dele, não
// de erro de digitação. A limpeza do clienteService já tira boa parte, mas
// esta função não pode depender disso: `resumir` também serve o PUT, que
// relê o cadastro por outro caminho.
function vazio(valor) {
    if (valor === null || valor === undefined) return true;
    if (typeof valor === 'number') return false;

    const texto = String(valor).trim();
    if (texto === '') return true;
    // Só pontos: "." , "..", "....."
    if (/^\.+$/.test(texto)) return true;
    // Só zeros: "0", "00000", "00000000"
    if (/^0+$/.test(texto)) return true;

    return false;
}

// 1899-12-30 é o zero do Delphi, que é o que o ERP grava quando a data nunca
// foi preenchida. Chega como data válida e passaria por qualquer checagem de
// preenchimento.
const DATA_ZERO_DELPHI = '1899-12-30';

function nascimentoVazio(valor) {
    if (vazio(valor)) return true;

    const texto = String(valor).trim().slice(0, 10);
    if (texto === DATA_ZERO_DELPHI) return true;

    const data = new Date(`${texto}T00:00:00Z`);
    if (Number.isNaN(data.getTime())) return true;
    if (data.getUTCFullYear() < 1900) return true;
    if (data > new Date()) return true;

    return false;
}

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

// Ordem fixa e propositalmente estável: quem integra monta a pergunta ao
// cliente a partir desta lista, e ordem que muda a cada chamada faria a
// conversa mudar sozinha.
const CAMPOS_CONFERIDOS = [
    'nome', 'cpf', 'nascimento', 'telefone',
    'logradouro', 'numero', 'bairro', 'cep', 'cidade', 'email',
];

// Os campos de endereço viram UMA linha só no texto: pedir rua, número,
// bairro, CEP e cidade em cinco linhas separadas é conversa ruim no WhatsApp.
const CAMPOS_ENDERECO = ['logradouro', 'numero', 'bairro', 'cep', 'cidade'];

const LINHA_ENDERECO = '🏠 Endereço com número, bairro, CEP e cidade';

const LINHA_POR_CAMPO = {
    nome: '👤 Nome completo (sem abreviar)',
    cpf: '📄 CPF',
    nascimento: '🎂 Data de nascimento',
    email: '📧 E-mail',
};

// O endereço de entrega é o que interessa; sem marcação, o primeiro serve.
function enderecoPrincipal(cliente) {
    const enderecos = cliente.enderecos ?? [];
    return enderecos.find((e) => e.entrega) ?? enderecos[0] ?? {};
}

function faltando(cliente) {
    const e = enderecoPrincipal(cliente);
    const temTelefone = (cliente.telefones ?? []).length > 0;

    const presenca = {
        nome: !vazio(cliente.nome),
        // CPF e CEP pedem as DUAS regras. Só o tamanho deixaria passar
        // "00000000", que tem oito dígitos e é o enchimento que o próprio
        // gatilho do ERP escreve; só o `vazio` deixaria passar CEP com
        // quatro dígitos, que existe em cadastro antigo.
        cpf: !vazio(cliente.cpf) && soDigitos(cliente.cpf).length === 11,
        nascimento: !nascimentoVazio(cliente.nascimento),
        telefone: temTelefone,
        logradouro: !vazio(e.logradouro),
        numero: !vazio(e.numero),
        bairro: !vazio(e.bairro),
        cep: !vazio(e.cep) && soDigitos(e.cep).length === 8,
        cidade: !vazio(e.cidade),
        email: !vazio(cliente.email),
    };

    return CAMPOS_CONFERIDOS.filter((campo) => !presenca[campo]);
}

// Texto pronto para mandar no WhatsApp, uma linha por item.
//
// O telefone fica de fora de propósito: quem chegou pelo WhatsApp já mandou
// o número, e pedir "me informe seu telefone" soaria absurdo. Ele continua
// em `faltando` e em `completo`, porque para o balcão a falta importa.
function montarFaltandoTexto(pendentes) {
    const linhas = [];

    for (const campo of pendentes) {
        if (campo === 'telefone') continue;

        if (CAMPOS_ENDERECO.includes(campo)) {
            if (!linhas.includes(LINHA_ENDERECO)) linhas.push(LINHA_ENDERECO);
            continue;
        }

        const linha = LINHA_POR_CAMPO[campo];
        if (linha && !linhas.includes(linha)) linhas.push(linha);
    }

    return linhas.join('\n');
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
        // Quando o cadastro mudou pela última vez, no fuso do ERP. Serve
        // para a integração decidir se vale reconfirmar o dado com o
        // cliente ou aceitar o que está lá.
        atualizadoEm: cliente.atualizadoEm ?? null,
        completo: pendentes.length === 0,
        faltando: pendentes,
        faltandoTexto: montarFaltandoTexto(pendentes),
    };
}

// "Maria, João ou José" — vírgula entre os nomes, "ou" antes do último.
function juntarNomes(nomes) {
    const limpos = nomes.filter(Boolean);
    if (limpos.length === 0) return '';
    if (limpos.length === 1) return limpos[0];
    return `${limpos.slice(0, -1).join(', ')} ou ${limpos[limpos.length - 1]}`;
}

// Primeiro nível da resposta, para o agente decidir o rumo da conversa sem
// contar item de lista nem interpretar regra.
//
// `situacao` segue o faltandoTexto, não o campo `completo`. São diferentes de
// propósito: cadastro achado por CPF sem telefone tem `completo: false`, mas
// o faltandoTexto é vazio — não há o que pedir ao cliente. Fosse pelo
// `completo`, o agente receberia INCOMPLETO com uma lista vazia e ficaria
// sem saber o que dizer.
function resumirConsulta(resumos) {
    const lista = resumos ?? [];

    if (lista.length === 0) {
        return {
            situacao: 'SEM_CADASTRO',
            primeiroNome: '',
            codigoPessoa: null,
            faltandoTexto: '',
            nomesCadastros: '',
        };
    }

    if (lista.length > 1) {
        return {
            situacao: 'MULTIPLOS',
            primeiroNome: '',
            codigoPessoa: null,
            faltandoTexto: '',
            nomesCadastros: juntarNomes(lista.map((c) => c.primeiroNome)),
        };
    }

    const unico = lista[0];
    const texto = unico.faltandoTexto ?? '';

    return {
        situacao: texto === '' ? 'COMPLETO' : 'INCOMPLETO',
        primeiroNome: unico.primeiroNome ?? '',
        codigoPessoa: unico.codigoPessoa ?? null,
        faltandoTexto: texto,
        nomesCadastros: '',
    };
}

module.exports = {
    resumir, resumirConsulta, mascararCpf, primeiroNome, faltando,
    montarFaltandoTexto, juntarNomes, vazio, nascimentoVazio,
    CAMPOS_CONFERIDOS, CAMPOS_ENDERECO, LINHA_ENDERECO, LINHA_POR_CAMPO,
};
