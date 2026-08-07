"""Teto de custo diário e limite de concorrência.

É a única coisa entre um loop de tool call e a fatura. Não é métrica nem aviso: é RECUSA — a
execução que cruzaria o teto não começa, pelo mesmo princípio do teto de disco do diário
(§2.4 de OS-SCREENS). Avisar depois do gasto seria o relatório de um acidente.

O gasto do dia sai do DIÁRIO, em disco, e não de um contador em memória. Um contador zera no
restart, e um teto que se apaga sozinho a cada reinício não é teto — bastaria reiniciar. Custa
uma leitura do arquivo do dia por pergunta, contra um arquivo que tem uma linha por execução.

A concorrência é contada aqui e não no `metrics.ask_active` porque aquele é observação e este é
decisão: um gauge que alguém pudesse zerar para consertar um painel abriria a porta.
"""
import logging
import threading
from typing import Optional

from . import config, journal

logger = logging.getLogger("espatial.budget")

_lock = threading.Lock()
_running = 0
# Encerrando: recusa execução NOVA e deixa a em curso terminar. Um servidor que morre no meio de
# uma resposta paga o custo e não entrega nada — e o diário registra `aborted` sem que ninguém
# tenha abortado.
_draining = False


def drain() -> None:
    global _draining
    _draining = True


def running() -> int:
    return _running


def max_daily_usd() -> float:
    return float(config.get("AGENT_MAX_DAILY_USD") or 0)


def max_concurrent() -> int:
    return int(config.get("AGENT_MAX_CONCURRENT") or 0)


def spent_today() -> float:
    """O que já se gastou hoje, lido do diário."""
    import datetime

    today = datetime.datetime.now().strftime("%Y-%m-%d")
    return round(sum(float(entry.get("cost_usd") or 0) for entry in journal.read(today)), 6)


def status() -> dict:
    """O que a tela mostra. Teto 0 = sem teto, e a tela precisa poder DIZER isso: um limite
    ausente e um limite folgado parecem iguais num número solto."""
    daily = max_daily_usd()
    spent = spent_today()
    return {
        "spent_today": spent,
        "max_daily_usd": daily,
        "remaining_usd": round(daily - spent, 6) if daily else None,
        "running": _running,
        "max_concurrent": max_concurrent(),
    }


def refusal() -> Optional[str]:
    """O motivo para recusar a próxima execução, ou `None`.

    Devolve a frase pronta porque quem recusa tem de dizer O QUÊ e QUANTO — "limite atingido"
    manda o operador adivinhar qual dos dois limites e a que distância ele estava.
    """
    if _draining:
        return "o servidor está encerrando — a execução não começou"

    daily = max_daily_usd()
    if daily:
        spent = spent_today()
        if spent >= daily:
            return f"teto diário atingido: ${spent:.4f} de ${daily:.2f} — a execução não começou"

    limite = max_concurrent()
    if limite and _running >= limite:
        return f"{_running} execuções em curso, o limite é {limite} — a execução não começou"
    return None


class Slot:
    """Ocupa uma vaga de concorrência enquanto a execução dura.

    Context manager porque a vaga TEM de voltar no caminho de erro: um `finally` esquecido aqui
    trava o sistema em "cheio" para sempre, e o sintoma seria o servidor recusando tudo sem nada
    rodando — a mesma classe de vazamento que o `ask_active` já teve.
    """

    def __enter__(self) -> "Slot":
        global _running
        with _lock:
            _running += 1
        return self

    def __exit__(self, *_) -> None:
        global _running
        with _lock:
            _running = max(0, _running - 1)
