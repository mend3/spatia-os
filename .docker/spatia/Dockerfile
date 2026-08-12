# O SpatIA — backend e frontend no mesmo processo (`serve.py` serve a API e os estáticos).
#
# ☠️ **A LISTA DE DEPENDÊNCIAS TEM UM DONO SÓ: o bloco PEP 723 de `serve.py`.** Esta imagem NÃO
# repete `fastembed` num `pip install` — ela copia o `serve.py` e deixa o `uv` resolver a partir
# dele. Repetir a lista aqui criaria duas fontes para a mesma verdade, e a que diverge primeiro é
# sempre a que ninguém está olhando.
#
# ⚠️ O `uv sync --script` no build é o que evita resolver na SUBIDA: sem ele o primeiro `up` sai
# para a rede antes de o servidor existir, e um clone sem internet nasce sem sintoma além de um
# contêiner que não responde.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# `git` porque a recência, o churn e o anel de sujos saem de `git log`/`git status` do corpus —
# sem ele a árvore inteira nasce sem essas quatro dimensões, e o sintoma é um céu sem raio orbital.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Só o `serve.py` entra na camada de dependência: o resto do repo chega por bind-mount, então
# copiá-lo aqui só invalidaria o cache a cada edição de shader.
COPY serve.py ./serve.py
RUN uv sync --script serve.py

# ⚠️ O corpus é de OUTRO dono, e o `git` recusa ler um repositório que não é seu. Sem isto,
# `git status` devolve "dubious ownership" e a varredura de sujos volta VAZIA — árvore limpa em
# verde, sem erro, que é o modo de falha que este repositório passa o tempo desfazendo.
RUN git config --system --add safe.directory '*'

# ☠️ **O EXCLUDES PESSOAL DO OPERADOR DECIDE O ANEL.** O git honra `~/.config/git/ignore` (o
# padrão XDG) fora do repo, e ele não existe numa imagem: sem isto o contêiner conta como
# `untracked` o que a máquina do operador ignora, e a cena desenha ANEL onde a nativa não desenha
# — a mesma pergunta com duas respostas, sem erro em lugar nenhum. Medido: `.claude/
# settings.local.json` limpo no host e `??` aqui dentro.
#
# O compose monta o arquivo do operador neste caminho; sem `SPATIA_GIT_EXCLUDES` ele monta
# `/dev/null`, que é uma lista VAZIA legítima — nunca um caminho inexistente, que faria o Docker
# criar um diretório no lugar.
RUN git config --system core.excludesFile /etc/gitignore-global

# O modelo ONNX (~120 MB) é baixado no primeiro embedding. Sem um volume neste caminho ele é
# rebaixado a cada recriação do contêiner.
ENV FASTEMBED_CACHE_PATH=/models

# ☠️ `0.0.0.0` aqui é o ÚNICO valor que funciona: o loopback do contêiner não é alcançável pelo
# mapeamento de porta. Quem faz a barreira é o lado ESQUERDO do `ports:` no compose, que publica
# em `127.0.0.1` — o servidor continua inalcançável da rede.
ENV ESPATIAL_HOST=0.0.0.0

EXPOSE 8787
CMD ["uv", "run", "--quiet", "--script", "./serve.py"]
