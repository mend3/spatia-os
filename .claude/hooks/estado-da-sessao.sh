#!/bin/sh
# SessionStart — injeta o que o CLAUDE.md NÃO pode saber: o estado VIVO desta árvore.
#
# ☠️ **Ele não repete doutrina, e isso é a decisão de projeto deste arquivo.** Duplicar aqui as
# leis, as armadilhas ou os números é exatamente o defeito que custou uma sessão para desfazer no
# `HANDOFF.md` — e a cópia envelhece enquanto a fonte anda. Só entra o que muda de um dia para o
# outro e decide o próximo passo; o resto é ponteiro.
raiz=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$raiz" || exit 0

branch=$(git branch --show-current)
sujos=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$(git config core.hooksPath)" = ".githooks" ]; then
  portao="pre-commit ARMADO (.githooks, versionado)"
else
  portao="☠️ SEM HOOK — o pre-commit NÃO roda neste clone. Rode: make hooks"
fi
jq -n --arg b "$branch" --arg s "$sujos" --arg p "$portao" \
  '{hookSpecificOutput:{hookEventName:"SessionStart",
    additionalContext:("Estado vivo desta árvore: branch `" + $b + "`, " + $s + " arquivo(s) modificado(s), " + $p + ". O tooling é `make` — rode `make` para ver os alvos, e o portão é `make leis`. Doutrina, armadilhas e números já medidos vivem no CLAUDE.md e em docs/armadilhas.md · docs/medidas.md · docs/roadmap.md; não os repita nem os transcreva.")}}'
