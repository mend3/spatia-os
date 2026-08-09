# `docs/` — quem responde o quê

Cada arquivo aqui responde **uma** pergunta. Se duas respostas divergirem, o **código está certo** e
o doc está velho. Como manter isto assim está em [`../CLAUDE.md`](../CLAUDE.md), na seção *Manter a
documentação* — leia-a antes de acrescentar arquivo ou parágrafo.

## O que está aberto, e para onde vamos

| arquivo | responde |
|---|---|
| [`roadmap.md`](roadmap.md) | os objetivos, as tarefas com status, e **o que cada peça destrava** |
| [`HANDOFF.md`](HANDOFF.md) | o que está aberto AGORA, e **as armadilhas que mentem** ao medir |

⭑ **Os dois mudam JUNTOS** — são a mesma verdade por dois lados.

## Normativo — o que decide, e não se reabre sem medida nova

| arquivo | responde |
|---|---|
| [`identidade.md`](identidade.md) | o nome, a grafia e as frases de marca. ⚠️ **Normativo**, não sugestão de tom — e traz a tabela do que NÃO se renomeia |
| [`catalogo-celeste.md`](catalogo-celeste.md) | o que o céu desenha, e o que foi **refutado** |
| [`modelo-de-renderizacao.md`](modelo-de-renderizacao.md) | por que cada corpo é desenhado como é |
| [`replanejamento-celeste.md`](replanejamento-celeste.md) | a ontologia da cena UNIVERSO — a spec que **10 módulos citam pelo número** |
| [`integracao-neo4j.md`](integracao-neo4j.md) | as duas leis do grafo: muda o BRILHO nunca a CLASSE, e nunca está no caminho do quadro |
| [`OS-SCREENS.md`](OS-SCREENS.md) | as telas de sistema — **construído**; o que resta é o vocabulário (§0) e as **recusas** (§1.1) |

## Contratos — quebrar um destes quebra alguém

| arquivo | responde |
|---|---|
| [`EVENTS.md`](EVENTS.md) | o contrato do barramento. **Leia antes de mexer em qualquer camada** |
| [`METRICS.md`](METRICS.md) | o catálogo do que se mede, e por quê |

## Medições — números, com o método para refazê-los

| arquivo | responde |
|---|---|
| [`medicoes-2026-08-07.md`](medicoes-2026-08-07.md) | a rodada que decidiu a escala e as constantes calibradas. ⚠️ **Não é um plano** |
| [`distancia-e-forma.md`](distancia-e-forma.md) | quantos pixels um corpo tem a cada distância, e o que isso proíbe |
| [`cobertura.md`](cobertura.md) | o que cada corpus PROVA, e o que ele não prova |

⚠️ **Todo número aqui é de um corpus e de uma data.** A FORMA da conclusão sobrevive à reindexação;
a magnitude, não. Cada um traz o comando que o refaz.

## [`briefings/`](briefings/) — andaime, não doc

Um briefing existe para ser **dissolvido**: quando o conteúdo estiver nos docs permanentes, o
arquivo é apagado. O razão de cada um, com a condição de morte, está no
[`roadmap.md`](roadmap.md#os-briefings--o-razão-e-quando-cada-um-morre).

☠️ **A triagem, e ela vale para todos:** os briefings **acertam a ESTRUTURA e erram as FOLHAS**.
Onde nomeiam uma RELAÇÃO, acertam — e às vezes descrevem algo que já existe com outro nome. Onde
nomeiam um FATO DE MUNDO, descrevem um corpus que não existe.
