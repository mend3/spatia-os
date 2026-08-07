"""Teto de custo diário e limite de concorrência.

É a única coisa entre um loop de tool call e a fatura. Não é métrica nem aviso: é RECUSA — a
execução que cruzaria o teto não começa, pelo mesmo princípio do teto de disco do diário
(§2.4 de OS-SCREENS). Avisar depois do gasto seria o relatório de um acidente.

O gasto do dia sai do DIÁRIO, em disco, e não de um contador em memória. Um contador zera no
restart, e um teto que se apaga sozinho a cada reinício não é teto — bastaria reiniciar. Custa
uma leitura do arquivo do dia por pergunta, contra um arquivo que tem uma linha por execução.

A concorrência é contada pelo REGISTRO de execuções vivas (`running`), não por um contador próprio
nem pelo `metrics.ask_active`: aquele é observação e este é decisão, e dois contadores da mesma
coisa acabam discordando — normalmente no caminho de exceção, que é justamente quando o teto
importa.
"""
import logging
import threading
from typing import Optional

from . import config, journal
from .running import count as running_count

logger = logging.getLogger("espatial.budget")

_lock = threading.Lock()
# Encerrando: recusa execução NOVA e deixa a em curso terminar. Um servidor que morre no meio de
# uma resposta paga o custo e não entrega nada — e o diário registra `aborted` sem que ninguém
# tenha abortado.
_draining = False


def drain() -> None:
    global _draining
    _draining = True


def running() -> int:
    return running_count()


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
        "running": running_count(),
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
    vivas = running_count()
    if limite and vivas >= limite:
        return f"{vivas} execuções em curso, o limite é {limite} — a execução não começou"
    return None
