#!/usr/bin/env bash
# Gera `.docker/searxng/settings.yml` a partir do `.example`, com um `secret_key` novo.
#
# ☠️ **Sem este arquivo o `up` do searxng falha de um jeito que não aponta para a causa.** O
# serviço faz bind-mount dele; quando o caminho não existe, o Docker cria um *DIRETÓRIO* no lugar e
# o searxng não sobe. Por isso o alvo `up` do Makefile depende deste script.
#
# ⚠️ O settings é gitignored porque carrega segredo — então todo clone novo nasce sem ele.
# Idempotente: arquivo existente é deixado em paz. Para regerar, apague antes.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

alvo=.docker/searxng/settings.yml
[ -f "$alvo" ] && exit 0

echo "==> gerando $alvo com um secret novo"
cp "$alvo.example" "$alvo"
segredo="$(openssl rand -hex 32)"
# `sed -i.bak` + remoção: a sintaxe de `-i` difere entre GNU e BSD, e esta forma vale nos dois.
sed -i.bak "s/GENERATE_ME/${segredo}/" "$alvo"
rm -f "$alvo.bak"
