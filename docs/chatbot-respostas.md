# Fluxo do botão "Endereço Errado"

Para configurar no MultiAtendWeb. O notificador só envia — quem conduz a
conversa é o bot de lá.

Data: 2026-08-19

---

## Gatilho

Cliente clica no botão de id `endereco_errado`.

## Passo 1 — bot pede o endereço

> Obrigado por avisar, {{nome}}! 🙏
>
> Me manda o endereço correto, por favor:
>
> Rua e número
> Bairro
> Cidade
> Ponto de referência, se tiver
>
> Pode mandar tudo em uma mensagem só.

**Espera:** próxima mensagem do cliente, em texto livre.

## Passo 2 — bot recebe e direciona

> Recebi, {{nome}}! ✅
>
> Vou direcionar para um de nossos atendentes atualizar seu cadastro.
> Sua fórmula fica retida até o endereço ser corrigido.

**Ação:** abre atendimento na fila da farmácia, com:

- etiqueta `endereço`
- o texto do cliente no corpo do atendimento
- o número da receita, se o bot conseguir extrair da mensagem citada

Bot sai da conversa. A partir daqui é pessoa.

---

## Casos de borda

**Cliente não responde o endereço** (10 min sem mensagem):

> Ficou faltando o endereço, {{nome}}. Quando puder, é só mandar por aqui. 🙂

Direciona para atendente mesmo assim — a fórmula está retida e alguém precisa
saber disso.

**Cliente manda áudio, foto ou localização** em vez de texto: não tentar
interpretar. Direciona direto para o atendente com o anexo.

**Fora do horário de atendimento:** mesma resposta do Passo 2, acrescentando:

> Nosso atendimento volta amanhã às 8h.

---

## O que a atendente faz depois

1. Atualiza o endereço no SmartPharmacy.
2. Libera a fórmula.
3. Reabre a receita no notificador e envia o aviso de novo — a mensagem é
   remontada na hora e já sai com o endereço novo.
