#!/usr/bin/env bash
# Garante credencial do Neo4j no `.env`, gerando uma senha nova quando não existe.
#
# ☠️ **Sem isto um checkout limpo NÃO SOBE.** O `compose.yml` exige `NEO4J_USER`/`NEO4J_PASSWORD`
# com `:?` — e está certo: um default aqui viraria a senha real de todo clone que não a trocou, e
# ela é a única barreira do banco. Mas o `.env.example` não pode trazê-la escrita pelo mesmo motivo,
# então o clone nascia entre duas recusas legítimas, com uma mensagem que fala de interpolação de
# variável para quem só queria rodar o projeto.
#
# ⭑ **Gerar é o que fecha o buraco sem afrouxar nada** — é o mesmo desenho do
# `setup-searxng-settings.sh`: segredo forte, criado na máquina de quem roda, nunca versionado.
#
# ☠️ **IDEMPOTENTE, e isso é obrigatório, não elegância.** A senha do Neo4j é gravada NO VOLUME no
# primeiro boot. Regerá-la depois deixa `.env` e banco discordando, e o sintoma é `Neo4j offline`
# com o serviço de pé e saudável — autenticação recusada, não serviço ausente.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

alvo=.env
[ -f "$alvo" ] || cp .env.example "$alvo"

# A régua é "declarada com valor não-vazio": para o `:?` do compose, declarado vazio é AUSENTE.
tem() { grep -qE "^[[:space:]]*$1[[:space:]]*=[[:space:]]*[^[:space:]]" "$alvo"; }

if tem NEO4J_USER && tem NEO4J_PASSWORD; then
  exit 0
fi

# `openssl` é o mesmo gerador que o searxng-settings usa; `head -c` do /dev/urandom é o reserva
# para quem não o tenha.
senha="$(openssl rand -hex 24 2>/dev/null || LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 48)"

# ⚠️ Só a chave FALTANTE é acrescentada: sobrescrever uma senha já escrita quebraria o banco que
# já a gravou no volume.
tem NEO4J_USER || printf '\n# Gerado por `make neo4j-auth` no primeiro boot — nunca versionado.\nNEO4J_USER=neo4j\n' >> "$alvo"
tem NEO4J_PASSWORD || printf 'NEO4J_PASSWORD=%s\n' "$senha" >> "$alvo"

echo "==> credencial do Neo4j criada em $alvo (usuário neo4j, senha nova)"
echo "    ela vira a senha do banco no primeiro boot — trocá-la depois exige recriar o volume."
