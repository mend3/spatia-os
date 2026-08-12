#!/usr/bin/env bash
# Confere que o Docker existe e responde ANTES de qualquer `docker compose`.
#
# ☠️ **Existe porque o erro do Docker não menciona o SpatIA.** Sem daemon, `docker compose up`
# devolve `Cannot connect to the Docker daemon at unix:///var/run/docker.sock` no meio de um
# `make serve` — uma frase sobre socket para quem só queria abrir o projeto. Quem chega não deduz
# dali que precisa abrir um aplicativo; deduz que o projeto está quebrado.
#
# ⭑ **Ele NÃO abre o Docker sozinho, e isso é escolha.** Subir o Docker Desktop leva dezenas de
# segundos e pode falhar de várias formas; um `make serve` que trava sem dizer o que está esperando
# é pior que um que recusa dizendo o comando exato. A instrução sai por PLATAFORMA, porque
# `systemctl` não existe no macOS e "abra o Docker Desktop" não ajuda num servidor Linux.
#
# ⚠️ São TRÊS perguntas, e elas falham diferente: binário ausente, daemon parado, e Compose v1.
# Tratá-las como uma só devolve a instrução errada em dois dos três casos.
set -euo pipefail

so="$(uname -s)"

instalar() {
  case "$so" in
    Darwin) echo "    brew install --cask docker    (ou baixe o Docker Desktop)" ;;
    Linux)  echo "    https://docs.docker.com/engine/install/  — e depois: sudo usermod -aG docker \$USER" ;;
    *)      echo "    instale o Docker Desktop: https://docs.docker.com/desktop/" ;;
  esac
}

ligar() {
  case "$so" in
    Darwin) echo "    open -a Docker        e espere o ícone parar de animar" ;;
    Linux)  echo "    sudo systemctl start docker" ;;
    *)      echo "    abra o Docker Desktop e espere ele terminar de subir" ;;
  esac
}

if ! command -v docker >/dev/null 2>&1; then
  echo "==> o Docker não está instalado." >&2
  echo "    O SpatIA guarda o corpus no Qdrant e as relações no Neo4j; os dois sobem por contêiner." >&2
  instalar >&2
  exit 1
fi

# ⚠️ A régua é falar com o DAEMON, não achar o binário: o cliente `docker` existe e responde a
# `--version` com o daemon parado, então checar o binário aprova justamente o caso que morde.
if ! docker info >/dev/null 2>&1; then
  echo "==> o Docker está instalado, mas o daemon não está respondendo." >&2
  ligar >&2
  echo "    depois: make serve" >&2
  exit 1
fi

# ☠️ Compose V1 (`docker-compose`, com hífen) não entende `profiles:` nem o `name:` de topo — ele
# subiria um subconjunto silencioso deste arquivo. Todo o tooling assume o plugin V2.
if ! docker compose version >/dev/null 2>&1; then
  echo "==> falta o plugin Compose V2 (\`docker compose\`, sem hífen)." >&2
  echo "    O \`docker-compose\` antigo ignora \`profiles:\` e subiria só parte deste compose." >&2
  instalar >&2
  exit 1
fi
