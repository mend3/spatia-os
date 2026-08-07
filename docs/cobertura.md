# Cobertura — o que cada conjunto de dados prova, e o que ele NÃO prova

Escrito em 2026-08-07, depois de um censo que mostrou o fixture cobrindo **todos os tipos** de
corpo e **quase nenhuma variação** deles. A distinção existe porque um erro de leitura sai caro nos
dois sentidos: olhar um cometa apagado no fixture e concluir "o shader é fraco" (quando ele nunca
saiu do valor mínimo), ou olhar o corpus real e concluir "a cena está completa" (quando o anel e o
pulsar não aparecem lá por construção).

## Os três conjuntos

| conjunto | responde | critério de sucesso |
|---|---|---|
| **Fixture** (`scripts/fixture.py`) | *o código desenha este tipo?* | todo corpo e todo modificador renderiza sem erro, e todo estado do git tem representante |
| **Fixture paramétrico** | *o shader aguenta a faixa inteira?* | cada parâmetro relevante aparece em mínimo, mediano e máximo pelo menos uma vez |
| **Corpus real** | *o universo parece vivo?* | a diversidade emerge da distribuição do conhecimento, sem ninguém plantar |
| **Bancada** (`sandbox.html`) | *este parâmetro faz o que diz?* | cada eixo tem slider, e o `watch` do espécime nomeia o defeito que ele pega |

Todo objeto do `space/` tem espécime na bancada, e cada um declara os próprios controles na spec
(`src/sandbox/specs.js` e os `*-rig.js`/`*-rigs.js` que ela agrega). A cena da bancada tem os seus
em `src/sandbox/globals.js` — velocidade, grade, esfera de raio 1 e fundo. Único fora: `backdrop.js`
(quad em espaço de recorte), cujos controles vivem no app SISTEMA, seção `fundo`.

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

E **três sistemas inteiros nunca entravam em cena**: a atividade do cometa (logo, cauda dupla,
curvatura e comprimento), o farol da estação e o envoltório filamentar da supernova.

⚠️ O critério da bancada é do PARÂMETRO, não do objeto: *desenhar o objeto não basta se o número
que o caracteriza não tem régua*. Os três eixos acima têm slider próprio em `COMETA`, `NEBULOSA` e
`ESTAÇÃO` — `churn` e `sections` entram como fato do nó e `*Params` deriva o resto.

⚠️ **Um quarto foi acusado por engano, e o erro era do censo.** O sistema de luas Roche→Hill
parecia morto (zero luas) porque a medição chamava `moonsOf` no nó CRU do servidor — e ele precisa
do RAIO ORBITAL, que nasce em `graph.js:load` a partir da recência e não existe no payload. A cena
tinha 197 luas em órbita o tempo todo. A sonda `window.espatial.moons()` foi criada para que a
pergunta tenha uma resposta que não dependa de reimplementar a lei fora do dono dela.

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

## O fixture paramétrico entrou em 2026-08-07 — o que ele varre agora

`VARREDURA`, em `scripts/fixture.py`: 14 arquivos que existem só para levar cada eixo aos extremos.
O knob novo é `commits` (commits dentro da janela de 30 dias, que é o que vira `node.churn`).

| eixo | antes | agora | faixa do código |
|---|---|---|---|
| cometa: atividade | 0,00 fixo | **0,00 … 1,00** | 0–1 |
| cometa: cauda | 1,98 fixo | **1,98 … 9,00** | 1,98–9,0 |
| estação: farol | 0,00 nas quatro | **0,00 … 1,00** | 0–1 |
| fotosfera: manchas | 0,00 na mediana | **0,00 … 1,03** | 0–1+ |
| nebulosa: cavidade | 0,46 nas duas (teto) | **0,23 … 0,46** | 0,14–0,46 |
| pulsar: período | 1,73 … 1,86 s | **1,55 … 3,58 s** | inverso da massa |
| supernova: envoltório | **0 corpos** | **3 corpos** | — |
| luas | (medido errado) | **197 em órbita · 315 cortadas** | — |

⚠️ **Uma armadilha que a varredura quase caiu:** commits igualmente espaçados dão CV 0, que é
regularidade ~1,00 — e a classe PULSAR tem prioridade 20. O "cometa de atividade máxima" nasceria
PULSAR e a varredura estaria medindo outra coisa. Os 27 commits dele saem com gaps irregulares de
propósito (1 a 5 dias), que é churn alto com ritmo humano. Conferido: `quente.sh` resolve como
`comet`, churn 27, atividade 1,00, cauda 9,0.

**O que ainda NÃO está coberto:** a obliquidade do pulsar varre 28°–45° de uma faixa de 18°–78°,
porque ela sai do HASH do caminho — cobrir os extremos significa procurar nomes de arquivo que
caiam neles, e isso não foi feito. Ficam também sem varredura as combinações (atividade ×
orientação da cauda, temperatura × manchas × limbo).

### O alvo original, para conferência

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
