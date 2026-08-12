#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["mlx-lm"]
# ///
"""O cérebro offline em MLX, falando OLLAMA NATIVO.

    ./cerebro.py                       # http://127.0.0.1:11500
    OLLAMA_URL=http://127.0.0.1:11500 ./serve.py

## Por que ele existe

Um modelo MLX **não carrega no Ollama** — o Ollama serve GGUF, e o `mlx_lm.server` fala
OpenAI (`/v1/chat/completions`). Esta base fala Ollama NATIVO em quatro rotas:
`/api/tags` e `/api/generate` (`server/llm.py`), `/api/chat` e `/api/embeddings`
(`scripts/conceitos.mjs`). Nenhuma delas é compatível, então ou o repo inteiro muda de
dialeto, ou alguém traduz. Este arquivo traduz.

## O que ele NÃO faz, e é decisão

⚠️ **Ele serve o cérebro, e passa o resto adiante.** `/api/generate` do modelo MLX é dele;
tudo mais — `/api/chat`, `/api/embeddings` e qualquer rota futura — é ENCAMINHADO ao Ollama
de verdade. Dois motivos: um modelo de chat não gera embedding, e a extração de conceitos é
lote de centenas de chamadas curtas, onde um 27B custa horas para fazer o trabalho de um 8B.

☠️ **`/api/tags` devolve a UNIÃO** — o modelo MLX mais os do Ollama. Sem isso, apontar
`OLLAMA_URL` para cá faria `conceitos.mjs` não achar `qwen3:8b` e recusar rodar: ele confere
o modelo contra a lista antes de extrair.

## As duas armadilhas medidas

☠️ **O raciocínio VAZA para dentro da resposta.** Sem `enable_thinking=False` no template, a
resposta começa com *"We need to answer in Portuguese: …"* — o pensamento do modelo servido
como texto. É a mesma armadilha que `scripts/conceitos.mjs` já nomeia para o qwen3, onde ela
quebra o JSON; aqui ela apenas entrega lixo ao operador, que é pior porque parece resposta.

⚠️ **A geração é SERIALIZADA por um lock.** O MLX não é seguro para chamadas concorrentes, e
o servidor é `ThreadingHTTPServer`: sem o lock, duas perguntas simultâneas corrompem o estado
do decodificador em vez de enfileirar.

⭑ **Ele mora na RAIZ, ao lado de `serve.py`, e não em `scripts/`** — `leis.mjs` roda TUDO que
está lá, e um servidor no portão o penduraria para sempre.
"""
import json
import os
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODELO = os.environ.get("CEREBRO_MLX_MODEL", "prism-ml/Ternary-Bonsai-27B-mlx-2bit")
UPSTREAM = os.environ.get("CEREBRO_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
HOST = os.environ.get("CEREBRO_HOST", "127.0.0.1")
PORTA = int(os.environ.get("CEREBRO_PORT", "11500"))

_lock = threading.Lock()
_modelo = None
_tok = None


def carregar():
    """Carrega sob demanda e mantém em memória — a primeira chamada paga ~2 min de disco."""
    global _modelo, _tok
    if _modelo is None:
        from mlx_lm import load

        print(f"carregando {MODELO} …", flush=True)
        _modelo, _tok = load(MODELO)
        print("pronto", flush=True)
    return _modelo, _tok


def upstream_json(rota: str, timeout: float = 4.0):
    with urllib.request.urlopen(f"{UPSTREAM}{rota}", timeout=timeout) as r:
        return json.loads(r.read())


def modelos_do_ollama() -> list[dict]:
    """Os modelos do Ollama de verdade. Ollama fora do ar não derruba o cérebro."""
    try:
        return upstream_json("/api/tags").get("models", [])
    except (urllib.error.URLError, OSError, ValueError):
        return []


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        """O log padrão escreve uma linha por requisição no stderr — ruído puro aqui."""

    # ─────────────────────────────────────────────────────────── saídas

    def _json(self, code: int, corpo: dict):
        dados = json.dumps(corpo).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def _encaminhar(self, corpo: bytes | None):
        """Repassa a requisição ao Ollama tal como veio. `/api/embeddings` vive aqui."""
        pedido = urllib.request.Request(
            f"{UPSTREAM}{self.path}",
            data=corpo,
            method=self.command,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(pedido, timeout=600) as r:
                dados = r.read()
                self.send_response(r.status)
                self.send_header("Content-Type", r.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)
        except urllib.error.HTTPError as e:
            dados = e.read()
            self.send_response(e.code)
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)
        except (urllib.error.URLError, OSError) as e:
            self._json(502, {"error": f"ollama em {UPSTREAM} não respondeu: {e}"})

    # ─────────────────────────────────────────────────────────── rotas

    def do_GET(self):
        if self.path.startswith("/api/tags"):
            modelos = [{"name": MODELO, "model": MODELO}] + modelos_do_ollama()
            return self._json(200, {"models": modelos})
        return self._encaminhar(None)

    def do_POST(self):
        tamanho = int(self.headers.get("Content-Length") or 0)
        corpo = self.rfile.read(tamanho) if tamanho else b""
        try:
            pedido = json.loads(corpo or b"{}")
        except ValueError:
            return self._json(400, {"error": "corpo não é JSON"})

        # ☠️ **`/api/chat` do NOSSO modelo é NOSSO — encaminhá-lo é um 404 garantido.** O Ollama
        # de cima não tem o modelo MLX, então repassar `/api/chat` com ele devolve
        # `model '<mlx>' not found`: um erro que culpa o modelo em vez de dizer que a rota não foi
        # servida aqui. Quem pergunta por `/api/chat` — e o `conceitos.mjs` pergunta — recebia isso
        # e desistia do arquivo em silêncio, com o campo `done_reason` intacto.
        # ⚠️ `/api/embeddings` continua subindo: aquilo é outro modelo, e não é este cérebro.
        nosso = pedido.get("model") == MODELO and (
            self.path.startswith("/api/generate") or self.path.startswith("/api/chat")
        )
        if not nosso:
            return self._encaminhar(corpo)

        return self._gerar(pedido, chat=self.path.startswith("/api/chat"))

    def _gerar(self, pedido: dict, chat: bool = False):
        from mlx_lm import stream_generate
        from mlx_lm.sample_utils import make_sampler

        opcoes = pedido.get("options") or {}
        if chat:
            # No dialeto de chat as mensagens JÁ vêm montadas — remontá-las a partir de `prompt`
            # perderia os papéis, e é deles que o template do modelo depende.
            mensagens = list(pedido.get("messages") or [])
        else:
            mensagens = []
            if pedido.get("system"):
                mensagens.append({"role": "system", "content": pedido["system"]})
            mensagens.append({"role": "user", "content": pedido.get("prompt", "")})

        # ☠️ **`stream` default é TRUE no Ollama, e quem pede `false` espera UM objeto JSON.**
        # Responder NDJSON a esse cliente faz o `.json()` dele estourar na segunda linha — um erro
        # de parse que não menciona streaming e manda procurar defeito no prompt.
        fluir = pedido.get("stream", True)
        pedacos: list = []

        def corpo_de(texto: str, fim: bool) -> dict:
            # A forma da resposta é do DIALETO, não do modelo: `/api/chat` devolve `message`,
            # `/api/generate` devolve `response`. Um cliente lê só a sua.
            base = {"model": MODELO, "done": fim}
            if chat:
                base["message"] = {"role": "assistant", "content": texto}
            else:
                base["response"] = texto
            return base

        if fluir:
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()

        def quadro(obj: dict):
            if not fluir:
                # Sem stream nada vai pelo fio agora: o texto é acumulado e sai inteiro no fim.
                if not obj.get("done"):
                    pedacos.append((obj.get("message") or {}).get("content") if chat else obj.get("response"))
                return
            linha = (json.dumps(obj) + "\n").encode()
            self.wfile.write(f"{len(linha):X}\r\n".encode() + linha + b"\r\n")
            self.wfile.flush()

        try:
            modelo, tok = carregar()
            # ☠️ Sem isto o raciocínio do modelo sai como resposta. Ver o cabeçalho.
            prompt = tok.apply_chat_template(
                mensagens, add_generation_prompt=True, enable_thinking=False
            )
            sampler = make_sampler(temp=float(opcoes.get("temperature", 0.3)))
            limite = int(opcoes.get("num_predict", 420))
            # ⚠️ Serializado: o MLX não é seguro sob concorrência.
            with _lock:
                for passo in stream_generate(
                    modelo, tok, prompt=prompt, max_tokens=limite, sampler=sampler
                ):
                    if passo.text:
                        quadro(corpo_de(passo.text, False))
            quadro(corpo_de("", True))
        except Exception as e:  # noqa: BLE001 — o cliente precisa saber, não o traceback
            quadro(corpo_de(f"\n[cérebro falhou: {e}]", True))
        finally:
            if fluir:
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
            else:
                self._json(200, corpo_de("".join(x for x in pedacos if x), True))


def main():
    print(f"cérebro MLX em http://{HOST}:{PORTA}  ·  modelo {MODELO}")
    print(f"  encaminhando o resto para {UPSTREAM}")
    print(f"  aponte o SpatIA com:  OLLAMA_URL=http://{HOST}:{PORTA} OLLAMA_MODEL={MODELO}")
    ThreadingHTTPServer((HOST, PORTA), Handler).serve_forever()


if __name__ == "__main__":
    main()
