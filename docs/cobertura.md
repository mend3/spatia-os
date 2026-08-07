# Cobertura — o que cada conjunto de dados prova, e o que ele NÃO prova

Escrito em 2026-08-07, depois de um censo que mostrou o fixture cobrindo **todos os tipos** de
corpo e **quase nenhuma variação** deles. A distinção existe porque um erro de leitura sai caro nos
dois sentidos: olhar um cometa apagado no fixture e concluir "o shader é fraco" (quando ele nunca
saiu do valor mínimo), ou olhar o corpus real e concluir "a cena está completa" (quando o anel e o
pulsar não aparecem lá por construção).

## Os três conjuntos

| conjunto | responde | critério de sucesso |
|---|---|---|
| **Fixture** (`.cache/fixture.py`) | *o código desenha este tipo?* | todo corpo e todo modificador renderiza sem erro, e todo estado do git tem representante |
| **Fixture paramétrico** | *o shader aguenta a faixa inteira?* | cada parâmetro relevante aparece em mínimo, mediano e máximo pelo menos uma vez |
| **Corpus real** | *o universo parece vivo?* | a diversidade emerge da distribuição do conhecimento, sem ninguém plantar |
| **Bancada** (`sandbox.html`) | *este parâmetro faz o que diz?* | cada eixo tem slider, e o `watch` do espécime nomeia o defeito que ele pega |

O fixture mede **cobertura**, não qualidade. Qualidade se julga na bancada (um eixo por vez, tempo
congelado) ou no corpus real (distribuição de verdade). Confundir os dois é a armadilha.

## O que o censo mediu em 2026-08-07

**Cobertura de TIPO: completa.** Fixture com 73 nós: planeta 40 · galáxia 16 · fotosfera 7 ·
estação 4 · cometa 2 · pulsar 2 · nebulosa 2, mais anel 7 (saturno 4 · júpiter 2 · urano 1) e disco
de detritos 4. Todos os quatro estados do git presentes.

**Cobertura de PARÂMETRO: baixa, e em dois modos opostos.**

| pele | parâmetro | medido | faixa do código |
|---|---|---|---|
| cometa | coma · cauda | **0,90 · 1,98** (piso nos dois) | 0,9–2,4 · 1,98–9,0 |
| estação | farol | **0,00 nas quatro** | 0–1 |
| fotosfera | manchas | **0,00 na mediana** | 0–1 |
| nebulosa | cavidade | **0,46 nas duas** (teto) | 0,14–0,46 |
| pulsar | obliquidade | 30°–41° | 18°–78° |
| estação | módulos · painéis | 5–7 · 4–5 | 2–7 · 2–6 |

E **quatro sistemas inteiros nunca entram em cena**: a atividade do cometa (logo, cauda dupla,
curvatura e comprimento), o farol da estação, o envoltório filamentar da supernova e o sistema de
luas Roche→Hill — este último provavelmente a maior peça de física do motor.

## A causa é comum, e por isso o conserto é barato

Rastreado até o fato de nó que cada parâmetro lê:

| parâmetro parado | fato | de onde o fato vem | knob do fixture |
|---|---|---|---|
| cometa: coma, cauda, curvatura | `node.churn` | commits na janela recente (`server/recency.py`) | nº de commits por arquivo |
| estação: farol | `node.churn` | idem | idem |
| fotosfera: manchas | `node.churn` | idem | idem |
| envoltório (supernova) | `node.supernova` | churn na janela, acima do piso | idem |
| nebulosa: cavidade | `node.sections` | títulos no corpo do arquivo (`server/graph.py`) | nº de títulos escritos |
| estação: módulos, painéis | `node.sections` + `chunks` | idem | idem |
| luas: quantas e onde | `node.sections` + raio orbital | títulos + recência | idem + data do commit |
| pulsar: período, núcleo | `node.massRank` | posição no ranking de massa | distribuição de `chunks` |

**Dois knobs — número de commits e número de títulos — destravam os quatro sistemas mortos.** O
fixture hoje escreve corpo fixo e um commit por arquivo, então `churn ≈ 0` em todo o corpus e
`sections` é 0 ou já saturado.

## O que falta para o fixture paramétrico existir

Não é aumentar a quantidade de corpos: é varrer os extremos. O alvo mínimo, um exemplar de cada:

- **cometa** — atividade nula, média e alta (a alta é a que mostra cauda dupla e curvatura);
- **fotosfera** — sem manchas, moderada, intensa;
- **estação** — farol apagado, lento, intenso;
- **nebulosa** — cavidade pequena, média e no teto;
- **pulsar** — período lento e rápido, obliquidade perto dos dois limites (18° e 78°);
- **supernova** — pelo menos um envoltório, que hoje é zero;
- **luas** — Roche dominante, Hill dominante, múltiplas luas, e um corpo sem nenhuma;
- **combinações** que interagem no mesmo pixel: atividade × orientação da cauda, temperatura ×
  manchas × limbo.

⚠️ **E o critério tem de ser MEDIDO, não declarado.** Esta base já pagou cinco vezes por invariante
escrita sem leitor (ver a REGRA DO CATÁLOGO); um documento afirmando cobertura sem ninguém conferir
seria a sexta. O censo que produziu os números acima está em `scripts/censo-morfologias.mjs`
(tipos e modificadores, roda em Node contra o servidor no ar); a metade paramétrica precisa das
funções `*Params` de cada pele, que importam `three` e por isso só rodam **no browser** — o
procedimento está no cabeçalho do censo.

## Onde isto NÃO se aplica

O corpus real não deve ser consertado para cobrir extremos: ele é a medida de como o conhecimento
realmente se distribui, e plantar corpos ali destruiria a única leitura honesta que ele oferece.
Se o real tem 665 fotosferas e nenhum pulsar, isso É a resposta — e foi assim que se descobriu que
o piso de `regularity` não encontra nenhum arquivo neste workspace.
