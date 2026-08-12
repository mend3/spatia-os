#!/usr/bin/env bash
# Detecta a plataforma e sobe o perfil de infra adequado a ela. Chamado por `make serve`.
#
# ⭑ **A pergunta que ele responde é "o que esta máquina consegue rodar", não "o que está escrito".**
# É a diferença entre um `up` que funciona no laptop de quem escreveu e um que funciona no clone.
#
# ☠️ **Ele NUNCA sobe o perfil `app`.** `make serve` roda o servidor NATIVO na mesma porta que o
# contêiner do `app` publicaria — subir os dois é uma porta com dois donos, e o que perde a corrida
# morre sem dizer que existe outro SpatIA de pé.
#
# ☠️ **E no macOS ele PREFERE o cérebro nativo, por medida:** `qwen3:8b` faz 16,2 tok/s com Metal e
# 1,25 tok/s no contêiner CPU — 13× mais lento. Subir `ollama-cpu` numa máquina que tem Ollama
# nativo seria trocar o cérebro rápido pelo lento sem ninguém pedir.
#
# ⚠️ Ele é IDEMPOTENTE: rodar de novo com tudo de pé não recria nada.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# A URL do cérebro sai do `.env`, que é o dono dela — nunca de um default daqui, que seria a
# segunda fonte. Sem `.env`, cai no default do próprio Ollama.
url_ollama="$(sed -n 's|^[[:space:]]*OLLAMA_URL[[:space:]]*=[[:space:]]*\(.*[^[:space:]]\)[[:space:]]*$|\1|p' .env 2>/dev/null | tail -1)"
url_ollama="${url_ollama:-http://127.0.0.1:11434}"

so="$(uname -s)"
perfis=()
motivo_cerebro=""

# ── 1. o cérebro: só entra em contêiner se NADA responder no endereço que o `.env` declara
if curl -sf --max-time 2 "${url_ollama%/}/api/tags" >/dev/null 2>&1; then
  motivo_cerebro="já responde em ${url_ollama} — nativo, e é o mais rápido"
elif [ "$so" = "Darwin" ]; then
  # ⚠️ Sem GPU no Docker do macOS. O contêiner é a degradação, não a escolha — então ele sobe,
  # para o sistema funcionar, mas dizendo o preço e o caminho de volta.
  perfis+=(--profile ollama-cpu)
  motivo_cerebro="nada responde em ${url_ollama} → ollama-cpu (☠️ ~13× mais lento que o nativo;
                  \`brew services start ollama\` + \`make cerebro\` devolvem a GPU)"
elif command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
  perfis+=(--profile ollama-gpu)
  motivo_cerebro="NVIDIA detectada → ollama-gpu"
else
  perfis+=(--profile ollama-cpu)
  motivo_cerebro="sem GPU detectada → ollama-cpu"
fi

# ── 2. a voz: opt-in e pesada (~2 GB). Ela entra só se o volume dela JÁ existe, isto é, se este
# operador já disse `make speech` alguma vez. ⚠️ Baixar 2 GB dentro de um `make serve` seria uma
# decisão de rede tomada por um comando que ninguém associa a download.
if docker volume inspect spatia_tts-models >/dev/null 2>&1; then
  perfis+=(--profile speech)
  voz="já instalada → sobe junto"
else
  voz="ausente → \`make speech\` quando quiser (~2 GB)"
fi

echo "==> ambiente: ${so}"
echo "    cérebro : ${motivo_cerebro}"
echo "    voz     : ${voz}"

docker compose "${perfis[@]}" up -d
