# Respostas do chatbot para os botões do notificador

Referência para configurar no MultiAtendWeb. O notificador **não lê respostas** —
ele só envia. Todo o fluxo abaixo roda do lado de lá.

Data: 2026-08-19

---

## O que o bot recebe

Os botões são do tipo `reply`. Ao clicar, o cliente envia uma mensagem cujo
identificador é o `id` configurado no template:

| Modalidade | Botões |
|---|---|
| Retirada na loja | `confirmar` |
| Entrega com prazo | `confirmar` · `endereco_errado` |
| Entrega sem prazo | `confirmar` · `endereco_errado` |
| Entrega local | `confirmar` · `endereco_errado` |
| Convênio | `confirmar` · `endereco_errado` |

### Limitação a resolver antes de montar o fluxo

O id é **o mesmo para toda receita e toda modalidade**. O bot recebe
`confirmar` e não sabe:

- de qual receita o cliente está falando (se ele recebeu duas na semana);
- se "confirmar" significa *vou buscar na loja*, *pode entregar nesse endereço*
  ou *vou retirar no convênio* — respostas bem diferentes.

Duas saídas:

1. **Ler a mensagem citada.** O WhatsApp manda a resposta como reply da mensagem
   original, que contém `Nº 441695`. Se o MultiAtendWeb expõe a mensagem citada
   ao bot, dá para extrair o número por regex. Verificar se expõe.
2. **Colocar o dado no id** (mudança no notificador, ~1 linha): passar a gerar
   `confirmar_entrega_441695` em vez de `confirmar`. O bot corta por `_` e tem
   ação, modalidade e receita sem depender de mensagem citada.

A opção 2 é mais confiável. Sem uma das duas, o fluxo abaixo funciona, mas o
atendente precisa procurar a receita manualmente em parte dos casos.

---

## Botão: Confirmar

### Retirada na loja

> Perfeito, {{nome}}! ✅
> Sua fórmula fica separada aqui no balcão te esperando.
>
> 🕗 Seg a Sex, 8h às 18h · Sáb, 8h às 12h
> 📍 [endereço da farmácia]
>
> Se precisar que outra pessoa retire, é só avisar o nome dela por aqui.

*Fluxo:* encerra. Sem atendente.

### Entrega com prazo / Entrega sem prazo

> Combinado, {{nome}}! ✅
> Vamos enviar para o endereço que está no seu cadastro.
>
> Assim que sair para entrega a gente te avisa por aqui. 🚚

*Fluxo:* encerra. Sem atendente.

### Entrega local (mesmo dia)

> Combinado, {{nome}}! ✅
> Sua fórmula sai hoje para entrega.
>
> Se não tiver ninguém no endereço, me avisa por aqui que a gente combina
> outro horário.

*Fluxo:* encerra. Sem atendente.

### Convênio

> Perfeito, {{nome}}! ✅
> Sua fórmula segue para o local combinado e você recebe o aviso quando ela
> chegar lá.

*Fluxo:* encerra. Sem atendente.

**Observação:** o botão *Endereço Errado* não faz sentido no convênio — não há
endereço de entrega, o cliente retira no parceiro. Vale tirar esse botão da
modalidade Convênio em Configurações → Mensagens → Convênio.

---

## Botão: Endereço Errado

Aqui o bot **não pode resolver sozinho**: o endereço vive no ERP e só uma pessoa
atualiza. O papel do bot é coletar e entregar pronto para o atendente.

### Passo 1 — reconhecer e pedir

> Obrigado por avisar, {{nome}}! 🙏
> Antes que a fórmula saia, me manda o endereço correto assim:
>
> Rua e número
> Bairro
> Cidade
> Ponto de referência (se tiver)
>
> Pode mandar tudo em uma mensagem só.

### Passo 2 — receber o texto livre e confirmar

> Anotei assim:
>
> _[texto que o cliente mandou]_
>
> Está certo?  [ Sim, está certo ]  [ Corrigir ]

### Passo 3a — cliente confirma

> Show! ✅ Já passei para nossa equipe atualizar seu cadastro.
> Sua fórmula só sai depois que o endereço estiver corrigido — a gente te avisa.

*Fluxo:* **abre atendimento na fila da farmácia**, com etiqueta `endereço` e o
texto do novo endereço no corpo. Prioridade alta se a modalidade for
*Entrega local*, porque essa sai no mesmo dia.

### Passo 3b — cliente quer corrigir

Volta ao Passo 1.

### Passo 4 — o que a atendente faz

1. Atualiza o endereço no SmartPharmacy.
2. Segura a fórmula até a atualização.
3. Reabre a receita no notificador e envia o aviso de novo — a mensagem é
   remontada na hora e já sai com o endereço novo.

---

## Casos que o fluxo precisa cobrir

### Cliente responde em texto livre, sem clicar

Se a resposta contiver "endereço", "endereco", "mudei", "mudança", "não moro
mais", "outro endereço" → entra no fluxo de Endereço Errado (Passo 1).

Qualquer outra coisa → fila de atendimento humano. Não tente adivinhar.

### Cliente clica fora do horário

> Recebi, {{nome}}! ✅
> Nosso atendimento volta amanhã às 8h e já cuidamos disso.

Se for *Entrega local*, avisar que a entrega passa para o próximo dia útil.

### Cliente clica duas vezes no mesmo botão

Não repetir a mensagem inteira. Só:

> Já está anotado aqui, pode ficar tranquilo! 😉

### Cliente responde dias depois

Se o clique chegar mais de 48h depois do envio, não assumir nada — mandar para
atendimento humano, porque a fórmula provavelmente já foi retirada ou entregue.

---

## O que o notificador não faz e não vai fazer sozinho

- Não lê nem processa resposta nenhuma (decisão D8).
- Não escreve no ERP: endereço corrigido é sempre trabalho de pessoa.
- Não sabe que o cliente confirmou. Se isso precisar aparecer na lista de
  Conferidas, o MultiAtendWeb teria que chamar um endpoint nosso — não existe
  hoje, e seria trabalho novo.
