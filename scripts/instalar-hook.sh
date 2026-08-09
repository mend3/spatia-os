#!/bin/sh
# Instala o portão das leis como `pre-commit`.
#
# ⚠️ `.git/hooks/` NÃO é versionado: um clone novo nasce SEM guarda nenhum, e o defeito volta
# calado. Rode isto depois de clonar — é a única linha que separa "temos 22 guardas" de "os 22
# guardas rodam".
raiz="$(git rev-parse --show-toplevel)"
printf '#!/bin/sh\nexec node "%s/scripts/leis.mjs"\n' "$raiz" > "$raiz/.git/hooks/pre-commit"
chmod +x "$raiz/.git/hooks/pre-commit"
echo "pre-commit instalado: node scripts/leis.mjs"
