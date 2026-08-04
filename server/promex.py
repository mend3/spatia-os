"""Primitivas de exposição Prometheus em stdlib — sem `prometheus_client`.

Este módulo não sabe nada do espatial-os: ele sabe Counter, Gauge, Histogram e o formato
de texto 0.0.4. O catálogo (o que medir) mora em `metrics.py`.

Duas decisões que evitam o problema clássico de instrumentação caseira:

1. **Cardinalidade é declarada, não descoberta.** Cada métrica lista os valores aceitos por
   label; valor fora da lista cai em `other` em vez de criar série nova. Nome de servidor
   MCP, id de tool_use e texto de pergunta nunca viram label — é assim que um registry
   caseiro explode em produção.
2. **Scrape não faz trabalho.** Toda escrita acontece no evento; `render()` só formata o
   que já está em memória. Nenhuma métrica chama upstream durante o scrape, então Qdrant
   fora do ar não transforma `/metrics` em timeout.
"""
import math
import threading
from typing import Iterable, Optional, Sequence

_ESCAPES = str.maketrans({"\\": "\\\\", "\n": "\\n", '"': '\\"'})


def _escape(value: str) -> str:
    return str(value).translate(_ESCAPES)


def _format_float(value: float) -> str:
    if value == math.inf:
        return "+Inf"
    if value == -math.inf:
        return "-Inf"
    if value != value:  # NaN
        return "NaN"
    if float(value).is_integer() and abs(value) < 1e15:
        return str(int(value))
    return repr(float(value))


class _Metric:
    kind = "untyped"

    def __init__(self, name: str, help_text: str, labels: Optional[dict[str, Sequence[str]]] = None):
        self.name = name
        self.help_text = help_text
        # {label: valores aceitos}. `None` como conjunto = label livre (usar só onde o
        # domínio já é fechado por construção, como `le`).
        self.labels = labels or {}
        self._lock = threading.Lock()

    def _key(self, values: dict) -> tuple:
        key = []
        for label, allowed in self.labels.items():
            value = str(values.get(label, ""))
            if allowed is not None and value not in allowed:
                value = "other"
            key.append(value)
        return tuple(key)

    def _labels_text(self, key: tuple, extra: Optional[tuple[str, str]] = None) -> str:
        pairs = [f'{name}="{_escape(value)}"' for name, value in zip(self.labels, key)]
        if extra:
            pairs.append(f'{extra[0]}="{_escape(extra[1])}"')
        return "{" + ",".join(pairs) + "}" if pairs else ""

    def render(self) -> Iterable[str]:
        raise NotImplementedError

    def _header(self) -> list[str]:
        return [f"# HELP {self.name} {self.help_text}", f"# TYPE {self.name} {self.kind}"]


class Counter(_Metric):
    kind = "counter"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._values: dict[tuple, float] = {}

    def inc(self, amount: float = 1.0, **labels) -> None:
        if amount < 0:
            raise ValueError(f"{self.name}: counter não decrementa")
        key = self._key(labels)
        with self._lock:
            self._values[key] = self._values.get(key, 0.0) + amount

    def render(self) -> Iterable[str]:
        with self._lock:
            snapshot = dict(self._values)
        if not snapshot:
            return []
        lines = self._header()
        for key, value in sorted(snapshot.items()):
            lines.append(f"{self.name}{self._labels_text(key)} {_format_float(value)}")
        return lines


class Gauge(_Metric):
    kind = "gauge"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._values: dict[tuple, float] = {}

    def set(self, value: float, **labels) -> None:
        key = self._key(labels)
        with self._lock:
            self._values[key] = float(value)

    def inc(self, amount: float = 1.0, **labels) -> None:
        key = self._key(labels)
        with self._lock:
            self._values[key] = self._values.get(key, 0.0) + amount

    def dec(self, amount: float = 1.0, **labels) -> None:
        self.inc(-amount, **labels)

    def render(self) -> Iterable[str]:
        with self._lock:
            snapshot = dict(self._values)
        if not snapshot:
            return []
        lines = self._header()
        for key, value in sorted(snapshot.items()):
            lines.append(f"{self.name}{self._labels_text(key)} {_format_float(value)}")
        return lines


class Histogram(_Metric):
    kind = "histogram"

    def __init__(self, name: str, help_text: str, buckets: Sequence[float], labels=None):
        super().__init__(name, help_text, labels)
        self.buckets = tuple(sorted(buckets)) + (math.inf,)
        self._counts: dict[tuple, list[int]] = {}
        self._sums: dict[tuple, float] = {}

    def observe(self, value: float, **labels) -> None:
        key = self._key(labels)
        with self._lock:
            counts = self._counts.get(key)
            if counts is None:
                counts = [0] * len(self.buckets)
                self._counts[key] = counts
                self._sums[key] = 0.0
            self._sums[key] += value
            for index, edge in enumerate(self.buckets):
                if value <= edge:
                    counts[index] += 1

    def render(self) -> Iterable[str]:
        with self._lock:
            counts = {key: list(value) for key, value in self._counts.items()}
            sums = dict(self._sums)
        if not counts:
            return []
        lines = self._header()
        for key in sorted(counts):
            # `observe` já incrementa todo bucket cujo limite cobre o valor, então a
            # contagem armazenada é a cumulativa que o formato exige.
            for edge, count in zip(self.buckets, counts[key]):
                lines.append(
                    f"{self.name}_bucket{self._labels_text(key, ('le', _format_float(edge)))} {count}"
                )
            total = counts[key][-1]
            lines.append(f"{self.name}_sum{self._labels_text(key)} {_format_float(sums[key])}")
            lines.append(f"{self.name}_count{self._labels_text(key)} {total}")
        return lines


class Registry:
    def __init__(self):
        self._metrics: list[_Metric] = []
        self._names: set[str] = set()

    def register(self, metric: _Metric) -> _Metric:
        if metric.name in self._names:
            raise ValueError(f"métrica duplicada: {metric.name}")
        self._names.add(metric.name)
        self._metrics.append(metric)
        return metric

    def counter(self, name, help_text, labels=None) -> Counter:
        return self.register(Counter(name, help_text, labels))

    def gauge(self, name, help_text, labels=None) -> Gauge:
        return self.register(Gauge(name, help_text, labels))

    def histogram(self, name, help_text, buckets, labels=None) -> Histogram:
        return self.register(Histogram(name, help_text, buckets, labels))

    def render(self) -> str:
        blocks = []
        for metric in self._metrics:
            lines = list(metric.render())
            if lines:
                blocks.append("\n".join(lines))
        return "\n".join(blocks) + "\n"
