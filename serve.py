#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["fastembed"]
# ///
"""Entrypoint do SpatIA.

    ./serve.py            # http://127.0.0.1:8787

`fastembed` é a única dependência: vetoriza a pergunta em ONNX na CPU, sem chave e sem
rede. Qdrant, Ollama, provedores de busca e o CLI `claude` são falados por HTTP ou
subprocesso — nada disso entra como pacote.
"""
from server.app import serve

if __name__ == "__main__":
    serve()
