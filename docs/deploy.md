# Deploy do notificador

Servidor baremetal Linux, Node 20+, pm2, código atualizado por `git pull`.

O sistema substitui a versão antiga **no mesmo servidor, no mesmo banco**. O
histórico de envios é preservado: a coleção continua sendo a mesma.

---

## 1. Primeira subida (uma vez só)

### 1.1 O que precisa existir no servidor

| | Confere com |
|---|---|
| Node 20+ | `node -v` |
| pm2 | `pm2 -v` |
| git | `git --version` |
| mongodb-database-tools | `mongodump --version` (opcional, mas o deploy faz backup com ele) |
| Acesso ao Firebird do ERP | porta 3050 |
| Acesso ao Mongo | `192.168.0.249:27017` |
| Saída para a internet | `api2.multiatendweb.com.br` |

### 1.2 Clonar

```bash
cd /opt          # ou onde o sistema antigo já mora
git clone https://github.com/arthur208/notificador-de-formulas.git
cd notificador-de-formulas
```

Se o repositório já está no servidor, só garanta que não há alteração local
solta — o deploy recusa subir com o diretório sujo:

```bash
git status --short
```

### 1.3 Criar o `.env`

O `.env` **não vem no git**. Crie a partir do exemplo:

```bash
cp .env.example .env
```

Preencha com os valores de produção. Os três que mudam em relação ao dev:

```ini
# Banco de PRODUÇÃO — é onde estão os 8.5 mil envios já feitos.
MONGO_DB_NAME=notificador_logs
MONGO_COLLECTION_LOGS=notificador_logs

# Firebird de produção
FB_HOST=<ip do ERP>
```

> **O driver do Mongo ignora o nome do banco que estiver no caminho da URI.**
> Quem manda é `MONGO_DB_NAME`. Apontar errado aqui faz o sistema gravar num
> banco vazio e perder o histórico de vista. O arranque imprime o destino —
> confira no `pm2 logs`.

Gere uma chave de cifragem **nova e exclusiva da produção**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Coloque em `APP_CRYPTO_KEY`. Ela cifra as credenciais da API de envio.
Trocá-la depois torna o que está gravado ilegível — se isso acontecer, rode
`scripts/semear-canal.js` de novo.

`API_URL` é do webhook antigo e não é mais usada. Pode ficar vazia.

### 1.4 Instalar e construir

```bash
npm ci --omit=dev
npm --prefix web ci
npm run build
```

O `public/` é saída de build e não é versionado. Sem este passo o servidor
entrega o front antigo.

### 1.5 Semear o que o sistema precisa para funcionar

```bash
node scripts/semear-templates.js   # os 5 textos padrão
node scripts/semear-canal.js       # credenciais da API de envio
node scripts/criar-usuario.js      # primeiro admin
```

**Use credenciais novas no `semear-canal.js`.** As que circularam durante o
desenvolvimento devem ser rotacionadas no painel da MultiAtend antes disso.

Cidades e convênios se cadastram pela tela, depois de entrar no sistema.
Enquanto nenhuma cidade estiver cadastrada, toda entrega sai sem prazo — o que
é seguro, mas vale cadastrar as principais no primeiro dia. As mais usadas nos
últimos 12 meses: Santa Cruz do Monte Castelo, Porto Rico, São Pedro do Paraná,
Santa Isabel do Ivaí, Santa Mônica. E **Loanda marcada como entrega local**.

### 1.6 Conferir antes de deixar no ar

```bash
node scripts/verificar-ambiente.js
```

Toca em tudo: configuração, Mongo, Firebird, autenticação na API de envio,
semeaduras e front construído. Sai com erro se algo estiver bloqueando.

### 1.7 Pôr no pm2

Se já existe um processo do sistema antigo, pare e remova:

```bash
pm2 list
pm2 delete <nome-antigo>
```

Suba o novo:

```bash
pm2 start index.js --name notificador --time
pm2 save
pm2 startup     # só uma vez, para subir sozinho no boot
```

---

## 2. Deploys seguintes

```bash
cd /opt/notificador-de-formulas
./scripts/deploy.sh          # sobe a main
./scripts/deploy.sh v1.2     # ou uma tag/branch específica
```

O script, em ordem: guarda o commit atual, faz backup do banco, atualiza o
código, instala, constrói o front, roda os testes, confere o ambiente,
reinicia no pm2 e verifica se o sistema respondeu.

**Falhando em qualquer etapa, ele volta sozinho para o commit anterior e sobe
de novo.** A farmácia não fica sem sistema por deploy quebrado.

---

## 3. Voltar atrás

O próprio deploy imprime o comando no fim. Manualmente:

```bash
git log --oneline -5
./scripts/deploy.sh <hash-do-commit-bom>
```

Se o problema for de dados e não de código, os backups ficam em
`/var/backups/notificador/<data>`:

```bash
mongorestore --uri="$MONGO_URI" --drop /var/backups/notificador/20260819-143000/notificador_logs
```

---

## 4. No dia da troca

- [ ] Rotacionar as credenciais da MultiAtend no painel deles
- [ ] Trocar as senhas dos usuários de teste, se algum foi criado
- [ ] Avisar a farmácia que **na primeira abertura pode ser preciso recarregar
      a página uma vez** — o app guarda a versão anterior em cache
- [ ] Cadastrar as cidades principais e marcar Loanda como entrega local
- [ ] Conferir no `pm2 logs notificador` que o destino impresso no arranque é
      o banco de produção
- [ ] Fazer um envio de teste para um número da própria farmácia antes de
      liberar para as atendentes

---

## 5. O que mudou em relação ao sistema antigo

| Antes | Agora |
|---|---|
| Front em Materialize + JS puro, servido de `public/` versionado | Vue construído em `public/` por `npm run build` |
| Envio por webhook (`API_URL` no `.env`) | API v1 da MultiAtend, credenciais cifradas no Mongo |
| Sem login | Login com sessão, três papéis |
| Mensagem chumbada no código | Templates editáveis por tela |
| Atendente digitava o número da receita | Lista do dia, leitura de código de barras e busca |

O histórico de envios continua na mesma coleção — a tela de Histórico mostra
tudo que já foi enviado, inclusive pelo sistema antigo.

---

## 6. Coisas para saber quando algo der errado

**"Cannot GET /alguma-rota"** — o Express tem fallback de SPA desde 19/08/2026.
Se voltar a aparecer, o deploy subiu uma versão anterior a isso.

**Envio responde sucesso e não chega** — o número precisa ser o que a API
devolve em `/contacts/validate-number`, não o que a regra do 9º dígito monta.
O log guarda `telefoneDigitado`, `telefoneEnviado` e `idMensagem`.

**Botões param de funcionar** — a API do provedor já ficou fora do ar. O envio
cai para texto sozinho e marca `botoesRecusados` no log. Para desligar de vez,
`BOTOES_DISPONIVEIS = false` em `services/templateService.js`.

**Firebird recusa conexão de vez em quando** — falha intermitente conhecida,
sem causa identificada, que se recupera sozinha. Se persistir, é o ERP.
