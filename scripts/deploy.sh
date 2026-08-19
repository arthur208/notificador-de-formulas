#!/usr/bin/env bash
# Deploy do notificador. Roda NO SERVIDOR, dentro do diretório do projeto.
#
#   ./scripts/deploy.sh            sobe a branch main
#   ./scripts/deploy.sh minha-br   sobe outra branch ou tag
#
# O que ele faz, nesta ordem: guarda para onde voltar, atualiza o código,
# instala, constrói o front, confere o ambiente, reinicia e checa se o
# sistema respondeu. Falhando em qualquer etapa, volta para o commit
# anterior e sobe de novo — a farmácia não fica sem sistema.

set -Eeuo pipefail

REF="${1:-main}"
APP="${APP_PM2_NOME:-notificador}"
PORTA="${PORT:-3008}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

VERDE=$'\033[32m'; VERMELHO=$'\033[31m'; AMARELO=$'\033[33m'; FIM=$'\033[0m'
passo() { echo -e "\n${VERDE}==>${FIM} $*"; }
erro()  { echo -e "${VERMELHO}ERRO:${FIM} $*" >&2; }
nota()  { echo -e "${AMARELO}    $*${FIM}"; }

ANTERIOR="$(git rev-parse HEAD)"
REVERTIDO=0

reverter() {
    [ "$REVERTIDO" = "1" ] && return
    REVERTIDO=1
    erro "deploy falhou — voltando para $ANTERIOR"
    git checkout --quiet --force "$ANTERIOR" || true
    npm ci --omit=dev --silent || npm install --omit=dev --silent || true
    npm --prefix web ci --silent >/dev/null 2>&1 || true
    npm run build >/dev/null 2>&1 || true
    pm2 restart "$APP" --update-env >/dev/null 2>&1 || true
    erro "versão anterior restaurada. NADA foi publicado."
}
trap reverter ERR

# ---------------------------------------------------------------- 0. checagens
passo "Conferindo o terreno"
command -v node >/dev/null || { erro "node não encontrado"; exit 1; }
command -v pm2  >/dev/null || { erro "pm2 não encontrado"; exit 1; }
[ -f .env ] || { erro ".env não existe. Copie .env.example e preencha."; exit 1; }

MAIOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$MAIOR" -ge 18 ] || { erro "Node $MAIOR é antigo demais; precisa de 18+"; exit 1; }
echo "    node $(node -v) · pm2 $(pm2 -v) · commit atual ${ANTERIOR:0:8}"

if ! git diff --quiet || ! git diff --cached --quiet; then
    erro "há alteração não commitada no servidor. Resolva antes de subir."
    git status --short
    exit 1
fi

# --------------------------------------------------------------- 1. backup
passo "Guardando cópia do banco antes de mexer"
if command -v mongodump >/dev/null; then
    DESTINO="/var/backups/notificador/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$DESTINO"
    # Só o banco do notificador; o servidor Mongo hospeda outros sistemas.
    URI="$(node -e 'require("dotenv").config();console.log(process.env.MONGO_URI)')"
    BANCO="$(node -e 'require("dotenv").config();console.log(process.env.MONGO_DB_NAME)')"
    mongodump --uri="$URI" --db="$BANCO" --out="$DESTINO" --quiet
    echo "    em $DESTINO"
else
    nota "mongodump não instalado — seguindo SEM backup do banco."
    nota "instale mongodb-database-tools quando puder."
fi

# --------------------------------------------------------------- 2. código
passo "Atualizando código para '$REF'"
git fetch --prune origin
git checkout --quiet --force "$REF"
git reset --quiet --hard "origin/$REF" 2>/dev/null || true
echo "    agora em $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# --------------------------------------------------------------- 3. instalar
passo "Instalando dependências"
npm ci --omit=dev --silent
npm --prefix web ci --silent

# --------------------------------------------------------------- 4. front
# O public/ não é versionado: sem este passo o servidor entrega o front
# antigo, ou nada.
passo "Construindo o front"
npm run build

# --------------------------------------------------------------- 5. testes
passo "Rodando os testes"
npm test 2>&1 | tail -8

# --------------------------------------------------------------- 6. ambiente
passo "Conferindo ambiente (bancos, credenciais, semeaduras)"
node scripts/verificar-ambiente.js

# --------------------------------------------------------------- 7. subir
passo "Reiniciando o serviço"
if pm2 describe "$APP" >/dev/null 2>&1; then
    pm2 restart "$APP" --update-env
else
    nota "processo '$APP' não existia no pm2 — criando"
    pm2 start index.js --name "$APP" --time
fi
pm2 save >/dev/null

# --------------------------------------------------------------- 8. smoke
passo "Verificando se respondeu"
PRONTO=0
for i in $(seq 1 20); do
    sleep 1
    CODIGO="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORTA}/" || true)"
    # 200 = página; 403 = whitelist de IP barrou, mas o servidor está de pé.
    if [ "$CODIGO" = "200" ] || [ "$CODIGO" = "403" ]; then
        echo "    respondeu $CODIGO em ${i}s"
        PRONTO=1
        break
    fi
done
[ "$PRONTO" = "1" ] || { erro "não respondeu em 20s"; exit 1; }

# A API viva importa mais que a página: é ela que a atendente usa.
API="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORTA}/api/conferidas" || true)"
case "$API" in
    401|403) echo "    /api/conferidas exigiu sessão ($API) — como esperado" ;;
    200)     echo "    /api/conferidas respondeu 200" ;;
    *)       erro "/api/conferidas devolveu $API"; exit 1 ;;
esac

trap - ERR
passo "Pronto"
echo "    versão $(git rev-parse --short HEAD) no ar"
echo "    voltar:  git checkout ${ANTERIOR:0:8} && ./scripts/deploy.sh ${ANTERIOR:0:8}"
echo
nota "Avise a farmácia: na primeira abertura pode ser preciso recarregar"
nota "a página uma vez, porque o app guarda a versão anterior em cache."
