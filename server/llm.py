"""Geração via Ollama local — streaming token a token, porque a UI desenha o token viajando.

O prompt é montado com os trechos recuperados e com uma regra dura: citar `[n]` ou dizer
que não encontrou. A UI mostra as fontes ao lado da resposta; resposta sem citação
verificável é pior que resposta ausente, porque parece igualmente convincente na tela.
"""
import logging
from typing import Iterator, Optional

from . import config, net

logger = logging.getLogger("espatial.llm")

SYSTEM = (
    "Você é o núcleo cognitivo do espatial-os, um sistema operacional espacial de "
    "conhecimento. Responda em português do Brasil, direto, técnico, sem preâmbulo.\n"
    "Use APENAS o contexto fornecido. Cite as fontes como [1], [2] no meio do texto.\n"
    "Se o contexto não responder, diga exatamente o que falta em uma frase — não invente.\n"
    "Máximo 6 frases."
)

CONTEXT_CHARS = 1200


def available() -> Optional[list[str]]:
    """Modelos instalados, ou None se o Ollama não responder."""
    try:
        data = net.get_json("ollama", f"{config.get('OLLAMA_URL').rstrip('/')}/api/tags", timeout=4)
        return [model["name"] for model in data.get("models", [])]
    except net.UpstreamError:
        return None


def build_prompt(question: str, memory_hits: list[dict], web_hits: list[dict]) -> str:
    blocks = []
    index = 1
    for hit in memory_hits:
        label = hit["source"] + (f" § {hit['section']}" if hit.get("section") else "")
        blocks.append(f"[{index}] MEMÓRIA · {label}\n{hit.get('text', '')[:CONTEXT_CHARS]}")
        index += 1
    for hit in web_hits:
        blocks.append(f"[{index}] WEB · {hit['title']} ({hit['url']})\n{hit.get('snippet', '')}")
        index += 1

    context = "\n\n".join(blocks) if blocks else "(nenhum contexto recuperado)"
    return f"CONTEXTO:\n{context}\n\nPERGUNTA: {question}\n\nRESPOSTA:"


def stream(question: str, memory_hits: list[dict], web_hits: list[dict]) -> Iterator[str]:
    payload = {
        "model": config.get("OLLAMA_MODEL"),
        "prompt": build_prompt(question, memory_hits, web_hits),
        "system": SYSTEM,
        "stream": True,
        "options": {"temperature": 0.3, "num_predict": 420},
    }
    url = f"{config.get('OLLAMA_URL').rstrip('/')}/api/generate"
    for frame in net.stream_ndjson("ollama", url, payload):
        chunk = frame.get("response")
        if chunk:
            yield chunk
        if frame.get("done"):
            return
