# Decisões abertas

Sucessor de `proximos-passos.md`, apagado em 2026-08-07 porque a lista dele acabou: os vinte itens
do [`OS-SCREENS.md`](OS-SCREENS.md) §4 fecharam, o §3 (dado que chegava ao browser e morria) fechou,
e a taxonomia, o planeta procedural e o fixture paramétrico entraram no céu. O que sobrou não é
tarefa — é **escolha**, e nenhuma delas se resolve escrevendo código antes de alguém olhar.

Cada uma abaixo tem o número que a torna decidível. O resto da história vive no `git log`, que nesta
base carrega a medida que decidiu cada valor.

---

## 1. A granulação do anel

O anel funciona e continua **visualmente ruim**, por um motivo que não é o `OPTICAL_DEPTH`: ele é
uma faixa lisa com perfil de densidade, sem granulação. Quatro candidatas estão prontas na bancada,
em `src/sandbox/ring-variants.js` — `GRAIN`, `SWARM`, `BOULDER` e `SLAB` —, com a pesquisa e a
recomendação em [`catalogo-celeste.md`](catalogo-celeste.md).

**Falta escolher, e falta o número:** a comparação a 25 px foi feita a olho, sem timer de GPU. As
quatro custam coisas diferentes e nenhuma foi medida com `spatia.renderCost()`.

⚠️ O anel **não aparece no corpus real** — a varredura de sujos é enraizada no `AGENT_CWD` e os
arquivos que o `git status` acusa lá não estão indexados. Anel só se julga no fixture
(`scripts/fixture.py`) ou na bancada.

## 2. i18n — não recomendado agora, e o motivo não é esforço

Só o passo que não se desfaz foi dado: `plural()` em `hud/dom.js`, nos dois pontos que concatenavam
`(s)`.

São ~210 literais no cliente, mais servidor e docs — e isso é a parte fácil. O problema real é que
os rótulos são curtos e caixa-alta porque a HUD é hairline, e as réguas da systray, do `.config-key`
(68 px para a tecla) e do `.headstat` foram dimensionadas para o português. **Alemão e francês
estouram 30–40% em largura.** i18n aqui é redesenhar largura, não trocar string.

Se um dia for feito, o que falta além do catálogo: as datas (`toLocaleString('pt-BR')`, espalhado) e
as mensagens que o servidor manda prontas no stream de eventos.

## 3. As zonas por razão de massa — declaradas, não implementadas

O `status` de cada entrada em `src/space/catalog.js` é a fonte da verdade sobre o que está no céu, e
as zonas por razão de massa continuam **só declaradas**. A fronteira delas já trabalha: `μ ≥ 5` é o
corte que separa lua de sistema duplo.

Implementar é decidir o que a zona muda na imagem — se não mudar nada, ela é invariante sem leitor,
que é o defeito que a REGRA DO CATÁLOGO existe para impedir.

---

## Onde está o resto

| pergunta | dono |
|---|---|
| o que o céu desenha, e o que foi refutado | [`catalogo-celeste.md`](catalogo-celeste.md) |
| o que cada conjunto de dados prova, e o que NÃO prova | [`cobertura.md`](cobertura.md) |
| as constantes calibradas e quando elas expiram | [`medicoes-2026-08-07.md`](medicoes-2026-08-07.md) |
| os vinte mecanismos de sistema, item a item | [`OS-SCREENS.md`](OS-SCREENS.md) §4 |
| por que cada número é o que é | `git log` e o comentário de quem o implementa |

⚠️ **Não acrescente aqui item que já fechou.** O documento anterior morreu de dez seções riscadas em
volta de três que importavam — quem chegava tinha de ler tudo para descobrir o que ainda valia.
