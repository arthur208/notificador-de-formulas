// Inicializa componentes do Materialize
document.addEventListener('DOMContentLoaded', function() {
    M.AutoInit();
    
    const i18n_ptBR = {
        cancel: 'Cancelar',
        clear: 'Limpar',
        done: 'Ok',
        months: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
        monthsShort: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
        weekdays: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
        weekdaysShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'],
        weekdaysAbbrev: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
    };

    const datepickerInicioEl = document.getElementById('filtro-data-inicio');
    M.Datepicker.init(datepickerInicioEl, { format: 'yyyy-mm-dd', autoClose: true, i18n: i18n_ptBR });
    const datepickerFimEl = document.getElementById('filtro-data-fim');
    M.Datepicker.init(datepickerFimEl, { format: 'yyyy-mm-dd', autoClose: true, i18n: i18n_ptBR });

    carregarLogs(true);
});

// --- Seletores de Elementos (Notificador) ---
const btnBuscar = document.getElementById('btn-buscar');
const btnEnviar = document.getElementById('btn-enviar');
const btnCancelar = document.getElementById('btn-cancelar');
const inputCodigoReceita = document.getElementById('codigo_receita');
const codigoReceitaHidden = document.getElementById('codigo-receita-hidden');
const nomeClienteHidden = document.getElementById('nome-cliente-hidden');
const areaBusca = document.getElementById('area-busca');
const areaResultado = document.getElementById('area-resultado');
const loaderBusca = document.getElementById('loader-busca');
const nomeClienteDisplay = document.getElementById('nome-cliente-display');
const listaTelefonesEl = document.getElementById('lista-telefones');
const mensagemFinalEl = document.getElementById('mensagem-final');
const radioOutro = document.getElementById('radio-outro');
const inputOutroTelefone = document.getElementById('outro-telefone-input');
const avisoJaEnviadoEl = document.getElementById('aviso-ja-enviado');
// NOVO (Notificador)
const areaEntrega = document.getElementById('area-entrega');
const listaEnderecoEl = document.getElementById('lista-endereco');

// --- Seletores (Histórico) ---
const listaLogsEl = document.getElementById('lista-logs');
const logsLoader = document.getElementById('logs-loader');
const btnCarregarMais = document.getElementById('btn-carregar-mais');
const btnFiltrar = document.getElementById('btn-filtrar');
const btnLimparFiltro = document.getElementById('btn-limpar-filtro');
const filtroDataInicioInput = document.getElementById('filtro-data-inicio');
const filtroDataFimInput = document.getElementById('filtro-data-fim');

// --- Variáveis Globais (Histórico) ---
let logCurrentPage = 1;
let logDateStart = null;
let logDateEnd = null;
let isLoadingLogs = false;

// --- Event Listeners (Notificador) ---
btnBuscar.addEventListener('click', buscarCliente);
btnCancelar.addEventListener('click', resetarTela);
btnEnviar.addEventListener('click', enviarMensagem);
inputCodigoReceita.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); 
        buscarCliente();      
    }
});

// --- Event Listeners (Histórico) ---
btnCarregarMais.addEventListener('click', () => { carregarLogs(false); });
btnFiltrar.addEventListener('click', () => {
    logDateStart = filtroDataInicioInput.value;
    logDateEnd = filtroDataFimInput.value;
    carregarLogs(true);
});
btnLimparFiltro.addEventListener('click', () => {
    logDateStart = null;
    logDateEnd = null;
    filtroDataInicioInput.value = '';
    filtroDataFimInput.value = '';
    carregarLogs(true);
});

// --- Funções (Notificador) ---
async function buscarCliente() {
    const codigo = inputCodigoReceita.value;
    if (!codigo) { M.toast({html: 'Por favor, digite um código de receita.'}); return; }
    areaBusca.style.display = 'none';
    loaderBusca.style.display = 'block';
    
    // Limpa a tela anterior antes da nova busca
    resetarTelaParcialmente();

    try {
        const response = await fetch(`http://192.168.254.71/api/cliente/${codigo}`);
        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.erro || 'Cliente não encontrado.');
        }
        
        // Recebe o payload completo
        const data = await response.json();
        
        // 1. Lida com o aviso de 'Já Enviado'
        if (data.jaEnviado) {
            avisoJaEnviadoEl.style.display = 'block';
        }

        // 2. Lida com os dados de Entrega (NOVO)
        if (data.isDelivery && data.deliveryAddress) {
            preencherDadosEntrega(data.deliveryAddress);
            areaEntrega.style.display = 'block';
        }

        // 3. Preenche os dados do cliente (Nome, Telefones, Mensagem Sugerida)
        preencherDadosCliente(data.dadosCliente, data.mensagemSugerida, codigo);
        
        // 4. Mostra o resultado
        loaderBusca.style.display = 'none';
        areaResultado.style.display = 'block';

    } catch (error) {
        M.toast({html: `Erro: ${error.message}`});
        resetarTela();
    }
}

// NOVO: Função para popular o bloco de endereço
function preencherDadosEntrega(address) {
    // Limpa a lista (exceto o header)
    const header = listaEnderecoEl.querySelector('.collection-header');
    listaEnderecoEl.innerHTML = '';
    listaEnderecoEl.appendChild(header); // Recoloca o header

    // Adiciona os itens
    if (address.endereco) {
        listaEnderecoEl.innerHTML += `<li class="collection-item"><strong>Endereço:</strong> ${address.endereco}</li>`;
    }
    if (address.numero) {
        listaEnderecoEl.innerHTML += `<li class="collection-item"><strong>Número:</strong> ${address.numero}</li>`;
    }
    if (address.bairro) {
        listaEnderecoEl.innerHTML += `<li class="collection-item"><strong>Bairro:</strong> ${address.bairro}</li>`;
    }
    // Mostra Cidade/Estado apenas se o ViaCEP encontrou
    if (address.cidade && address.estado) {
        listaEnderecoEl.innerHTML += `<li class="collection-item"><strong>Cidade:</strong> ${address.cidade} (${address.estado})</li>`;
    }
    if (address.cep) {
        listaEnderecoEl.innerHTML += `<li class="collection-item"><strong>CEP:</strong> ${address.cep}</li>`;
    }
}

function preencherDadosCliente(cliente, mensagemSugerida, codigo) {
    nomeClienteDisplay.innerText = cliente.nome;
    nomeClienteHidden.value = cliente.nome; 
    codigoReceitaHidden.value = codigo;
    mensagemFinalEl.value = mensagemSugerida;
    
    // Força a atualização dos labels e do textarea
    M.textareaAutoResize(mensagemFinalEl);
    M.updateTextFields(); 

    listaTelefonesEl.innerHTML = '';
    let primeiroTelefone = true;
    for (const [tipo, numero] of Object.entries(cliente.telefones)) {
        if (numero) { 
            const p = document.createElement('p');
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'telefone';
            input.value = numero;
            if (primeiroTelefone) {
                input.checked = true;
                primeiroTelefone = false;
            }
            const span = document.createElement('span');
            span.innerText = `${tipo}: ${numero}`;
            label.appendChild(input);
            label.appendChild(span);
            p.appendChild(label);
            listaTelefonesEl.appendChild(p);
        }
    }
    radioOutro.checked = false;
    inputOutroTelefone.value = '';
    if (primeiroTelefone) { 
         listaTelefonesEl.innerHTML = '<p class="orange-text text-lighten-2">Nenhum telefone encontrado no cadastro.</p>';
         radioOutro.checked = true;
    }
}

async function enviarMensagem() {
    const codigoReceita = codigoReceitaHidden.value;
    const nomeCliente = nomeClienteHidden.value;
    const mensagem = mensagemFinalEl.value;
    let telefoneEscolhido = '';
    if (radioOutro.checked) {
        telefoneEscolhido = inputOutroTelefone.value;
    } else {
        const radioSelecionado = document.querySelector('input[name="telefone"]:checked');
        if (radioSelecionado) { telefoneEscolhido = radioSelecionado.value; }
    }
    if (!telefoneEscolhido) { M.toast({html: 'Por favor, selecione ou digite um telefone.'}); return; }
    if (!mensagem) { M.toast({html: 'A mensagem não pode estar vazia.'}); return; }
    btnEnviar.classList.add('disabled');
    M.toast({html: 'Enviando...'});
    try {
        const response = await fetch('http://192.168.254.71/api/enviar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                codigoReceita: codigoReceita,
                telefoneEscolhido: telefoneEscolhido,
                mensagem: mensagem,
                nomeCliente: nomeCliente
            })
        });
        const data = await response.json();
        if (!response.ok) { throw new Error(data.mensagem || 'Erro desconhecido no servidor.'); }
        M.toast({html: 'Mensagem enviada com sucesso!', classes: 'green'});
        resetarTela(); 
        
        carregarLogs(true); // Atualiza o histórico

    } catch (error) {
        M.toast({html: `Falha no envio: ${error.message}`, classes: 'red'});
        btnEnviar.classList.remove('disabled'); 
    }
}

// Reset completo
function resetarTela() {
    areaBusca.style.display = 'block';
    loaderBusca.style.display = 'none';
    areaResultado.style.display = 'none';
    inputCodigoReceita.value = '';
    
    resetarTelaParcialmente();
}

// Reset apenas da área de resultados
function resetarTelaParcialmente() {
    nomeClienteDisplay.innerText = '';
    listaTelefonesEl.innerHTML = '';
    mensagemFinalEl.value = '';
    btnEnviar.classList.remove('disabled');
    mensagemFinalEl.disabled = false;
    avisoJaEnviadoEl.style.display = 'none';
    
    // Reseta a área de entrega
    areaEntrega.style.display = 'none';
    const header = listaEnderecoEl.querySelector('.collection-header');
    listaEnderecoEl.innerHTML = '';
    if (header) {
        listaEnderecoEl.appendChild(header); // Mantém o header
    }
}


// --- Funções (Histórico) ---

async function carregarLogs(limparLista = false) {
    if (isLoadingLogs) return;
    isLoadingLogs = true;

    if (limparLista) {
        logCurrentPage = 1;
        listaLogsEl.innerHTML = '';
    }

    let url = `http://192.168.254.71/api/logs?page=${logCurrentPage}`;
    if (logDateStart) { url += `&dateStart=${logDateStart}`; }
    if (logDateEnd) { url += `&dateEnd=${logDateEnd}`; }

    logsLoader.style.display = 'block';
    btnCarregarMais.style.display = 'none';

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(log => {
                listaLogsEl.appendChild(renderizarLogItem(log));
            });
            if (data.hasMore) {
                btnCarregarMais.style.display = 'block';
                logCurrentPage++;
            } else {
                btnCarregarMais.style.display = 'none';
            }
        } else if (limparLista) {
            listaLogsEl.innerHTML = '<li class="collection-item center-align">Nenhum registro encontrado.</li>';
        }
    } catch (error) {
        M.toast({html: 'Erro ao carregar histórico.'});
    } finally {
        isLoadingLogs = false;
        logsLoader.style.display = 'none';
    }
}

function renderizarLogItem(log) {
    const li = document.createElement('li');
    li.className = 'collection-item';
    const dataFormatada = new Date(log.timestamp).toLocaleString('pt-BR', {
        dateStyle: 'short', timeStyle: 'short'
    });
    const statusTag = log.status === 'sucesso' 
        ? '<span class="new badge green" data-badge-caption="">Sucesso</span>'
        : '<span class="new badge red" data-badge-caption="">Erro</span>';
    li.innerHTML = `
        ${statusTag}
        <span class="title">Receita: ${log.codigoReceita} - ${log.nomeCliente}</span>
        <p>
            Telefone: ${log.telefoneEnviado} <br>
            Data: ${dataFormatada}
        </p>
    `;
    return li;
}