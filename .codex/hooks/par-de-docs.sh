#!/bin/sh
# PostToolUse/Edit|Write — HANDOFF.md e roadmap.md são a MESMA verdade por dois lados.
#
# ⭑ Ele não lembra "não esqueça de": ele MEDE. Só fala quando um dos dois foi tocado e o outro
# continua idêntico ao HEAD — que é exatamente o estado em que os dois divergem. Aviso que sai
# sempre é aviso que ninguém lê, e é a razão pela qual `ambient.py` recusa heartbeat por escrito.
f=$(jq -r '.tool_input.file_path // .tool_response.filePath // ""')
case "$f" in
  */docs/HANDOFF.md) par="docs/roadmap.md"; este="HANDOFF.md" ;;
  */docs/roadmap.md) par="docs/HANDOFF.md"; este="roadmap.md" ;;
  *) exit 0 ;;
esac
raiz=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$raiz" || exit 0
# O par também mudou no working tree: não há nada a dizer.
git diff --quiet HEAD -- "$par" 2>/dev/null || exit 0
jq -n --arg e "$este" --arg p "$par" '{hookSpecificOutput:{hookEventName:"PostToolUse",
  additionalContext:("⚠️ " + $e + " mudou e " + $p + " continua idêntico ao HEAD. Os dois são a MESMA verdade por dois lados: fechar um item num obriga a fechar a tarefa no outro, e abrir num obriga a abrir no outro. Divergiram, os DOIS estão errados — e o sintoma é alguém ler um e decidir contra o que o outro já mediu. Se esta edição de fato não tem par, siga: o ponto é DECIDIR, não lembrar.")}}'
