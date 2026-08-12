#!/usr/bin/env bash
# Deriva `.docker/spatia.env` do `.env` do repo, trocando SÓ os endereços de serviço.
#
# ☠️ **Existe porque o `.env` VENCE o bloco `environment:` do compose.** `config._load_env_file`
# escreve `os.environ[chave]` incondicionalmente, então o arquivo montado com o repo sobrepõe
# qualquer variável que o Docker injete: o contêiner herdaria `QDRANT_URL=http://localhost:6333` e
# falaria consigo mesmo. O compose monta ESTE arquivo por cima de `/app/.env`, e é ele que o
# servidor lê lá dentro.
#
# ⭑ **O dono da verdade continua sendo o `.env`.** Este arquivo é DERIVADO — nada se edita aqui, e
# regerar é apagar e rodar de novo. Editá-lo à mão cria a segunda fonte que o `.env` já é.
#
# ⚠️ **A troca é por NOME DE SERVIÇO, que é como o compose resolve entre contêineres.**
#
# ☠️ **O Ollama é o caso que NÃO se resolve por default, e a razão é o Linux.** Uma porta publicada
# em `127.0.0.1` não é alcançável por outro contêiner através de `host.docker.internal`: ali o nome
# resolve para o gateway do host, e o gateway não alcança o loopback dele. Então o endereço depende
# de ONDE o Ollama roda, e isso é pergunta para quem opera, não palpite deste script:
#
#     SPATIA_OLLAMA=native    (default) — Ollama ou `cerebro.py` fora do compose  → host.docker.internal
#     SPATIA_OLLAMA=compose             — `make ollama-cpu` / `make ollama-gpu`   → http://ollama:11434
#
# ⚠️ Num Mac com modelo MLX o valor é `native` mesmo com o Ollama em contêiner: quem responde é o
# `cerebro.py`, que é nativo por obrigação (Metal não alcança contêiner) e faz a ponte para o acervo.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

origem=.env
alvo=.docker/spatia.env

if [ ! -f "$origem" ]; then
  echo "==> sem \`$origem\` — copie o \`.env.example\` primeiro" >&2
  exit 1
fi

# ⚠️ **Só o HOST é trocado; a PORTA é preservada.** Reescrever a linha inteira apagaria a escolha
# de quem roda o cérebro MLX em `11500` (`make cerebro`), e o sintoma seria um contêiner falando
# com um Ollama que não está naquela porta — "cérebro offline" sem dizer por quê.
porta_ollama="$(sed -n 's|^[[:space:]]*OLLAMA_URL[[:space:]]*=.*:\([0-9][0-9]*\)/*[[:space:]]*$|\1|p' "$origem" | tail -1)"
porta_ollama="${porta_ollama:-11434}"

# ☠️ **A exigência do mount mora AQUI, não no compose.** Lá um `:?` derruba `docker compose up`
# inteiro — inclusive quem não sobe o servidor —, porque a interpolação acontece antes do perfil.
# Aqui ela atinge só quem pediu `make app`, e é isso que a torna uma guarda em vez de um bloqueio.
if ! grep -qE '^[[:space:]]*SPATIA_CORPUS_MOUNT[[:space:]]*=[[:space:]]*[^[:space:]]' "$origem"; then
  echo "==> falta \`SPATIA_CORPUS_MOUNT\` no \`$origem\`." >&2
  echo "    É o caminho do HOST que o contêiner enxerga, montado no MESMO caminho lá dentro." >&2
  echo "    A raiz que você escolher em #/storage tem de estar DENTRO dele. Ex.:" >&2
  echo "      SPATIA_CORPUS_MOUNT=$HOME/workspace" >&2
  exit 1
fi

echo "==> derivando $alvo de $origem  (Ollama nativo na porta $porta_ollama)"
{
  echo "# GERADO por \`make docker-env\` a partir do \`.env\`. NÃO EDITE — edite o \`.env\`."
  echo "# Só os endereços de serviço mudam: dentro da rede do compose eles são NOMES, não loopback."
  echo
  # `ESPATIAL_HOST` sai: dentro do contêiner ele é `0.0.0.0` (ver o Dockerfile), e uma linha
  # `127.0.0.1` aqui venceria o `ENV` da imagem e deixaria o servidor inalcançável pela porta.
  grep -v -E '^\s*(ESPATIAL_HOST|QDRANT_URL|NEO4J_HTTP|SEARXNG_URL|TTS_URL|OLLAMA_URL)\s*=' "$origem" || true
  echo
  echo "# ── endereços reescritos para a rede do compose ──"
  echo "QDRANT_URL=http://qdrant:6333"
  echo "NEO4J_HTTP=http://neo4j:7474"
  echo "SEARXNG_URL=http://searxng:8080"
  echo "TTS_URL=http://tts:8880"
  if [ "${SPATIA_OLLAMA:-native}" = "compose" ]; then
    # Nome de serviço: os dois perfis (`ollama-cpu`/`ollama-gpu`) respondem por `ollama` na rede.
    echo "OLLAMA_URL=http://ollama:11434"
  else
    echo "OLLAMA_URL=http://host.docker.internal:${porta_ollama}"
  fi
} > "$alvo"

echo "==> pronto — o contêiner lê este arquivo como \`/app/.env\`"
