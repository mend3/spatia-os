# Relatório do corpus — o retrato de HOJE

> ☠️ **ARQUIVO GERADO. Não edite à mão.** Ele é reescrito inteiro por `make relatorio`, e uma
> edição manual some na próxima corrida sem deixar rastro.
>
> ⭑ **A RAZÃO de cada constante não está aqui** — ela não sai de medição nenhuma e mora em
> [`calibracao.md`](./calibracao.md), endereçada por cláusula, que é o que o código cita.
> Aqui fica só o que uma corrida produz.

| | |
|---|---|
| corpus | `spatia_workspace_c13486e9` |
| raiz | `/Users/victor/workspace` |
| prefixo podado | (vazio) |
| gerado em | 2026-08-12 03:34 UTC |
| por | `make relatorio` |

⚠️ **Estes números descrevem UM corpus, numa máquina, num instante.** Eles não são propriedade
deste projeto: mudam de ambiente para ambiente e de operador para operador. Rode o comando de novo
em vez de citar este parágrafo.

## O retrato, em uma linha

| grandeza | valor |
|---|---|
| corpos no céu | 1205 |
| arquivos | 1085 |
| chunks | 14735 |
| agregados (hubs) | 120 |
| repositórios | 7 |

| subsistema | estado |
|---|---|
| Qdrant | no ar · 14735 pontos |
| Neo4j | no ar · 1085 corpos |
| cérebro offline | no ar |
| voz | no ar |
| CLI `claude` | no PATH |

## Forma do corpus, e a saúde das constantes

*o corpus É o quê, e alguma constante calibrada ficou sem população?* — `node scripts/censo-corpus.mjs`

```
1. FORMA DO CORPUS
  nós 1205  ·  7 repo · 113 dir · 1085 file
  arestas 1198 — laterais (não-contenção): 0
  agregados, chunks:  min 2 · P25 21 · MED 53 · P75 146 · P90 350 · máx 5094
  agregados, filhos:  min 2 · MED 4 · P75 10 · P90 18 · máx 172
  com <= 2 filhos: 31 (25.8%)   com UM kind só: 78 (65.0%)
  sistemas: 113 pastas — 90 só com arquivos · 23 com subpasta · 0 SEM planeta
  planetas por estrela: min 2 · P25 2 · MED 4 · P75 8 · P90 16 · máx 72
  arquivos sob uma pasta: 804 · ÓRFÃOS (direto no repo): 281 (25.9%)
  razão planeta/estrela: 7.12  ·  contando os repos como estrela: 9.04
  extensões no índice: 3 distintas · dominante .md 93.5%
  ⚠️  ZERO arquivos de código no índice — o indexador não ingere .ts/.py
2. SAÚDE DAS CONSTANTES CALIBRADAS
  K_RAIO 0.70 → a_corte 60.4 (raio máx 62)  4% dos elegíveis
  K_RAIO 0.50 → a_corte 43.1 (raio máx 62)  52% dos elegíveis
  SPAN 2.8 → cobertura de tinta 88%  (referência: 49% com 71 hubs)
  SPAN 1.5 → cobertura de tinta 25%  (referência: 49% com 71 hubs)
3. CLASSES COM POPULAÇÃO ZERO
  PULSAR   regularidade>0: 42  ·  >= 0,50: 3
  LUA      arquivos com >= 5 partes: 755  (a geometria corta depois — ver spatia.moons())
  SERVIÇOS 0 em 0 arquivos compose
4. SINAL DAS CANDIDATAS (o modelo declarado)
  anã branca                 1    0.1%   massa>=P75, sem atividade, recência<=P25
  cometa-extinto            89    8.2%   JÁ no catálogo — régua de comparação
  supernova                 51    4.7%   JÁ no catálogo — régua
  sem NENHUMA feição        15    1.4%   o buraco: nada os distingue
  protoestrela · exoplaneta → 0 por construção: o NÓ não existe
  binária · entrelaçamento → 0 por construção: a ARESTA não existe
5. ESTABILIDADE — percentil vs. limiar absoluto
  por CONTENÇÃO (limiar absoluto, 0% de reclassificação espúria): {"galáxia":12,"sistema":30,"aglomerado":18,"hub raso":60}
  hoje, TODO agregado é galáxia: 120
  percentil sobre score composto: 74,6% dos nós trocam de classe ao indexar um vault de
  notas curtas — medido em 2026-08-07, ver docs/calibracao.md §3.1
```

## O que o céu DESENHA

*classe, pele e morfologia — a distribuição que o operador vê* — `node scripts/censo-morfologias.mjs`

```
corpus: 1205 nós · 1085 arquivos · 14735 chunks
sujos no git (raiz /Users/victor/workspace): 28
CLASSE — o que o corpo É (catalog.classify)
  estrela            993   82.4%  █████████████████████████████████
  galaxia            120   10.0%  ████
  cometa-extinto      89    7.4%  ███
  pulsar               3    0.2%
PELE — o que ele desenha de perto (sistemas.identidadeDe)
  planet             760   63.1%  █████████████████████████
  asteroid           194   16.1%  ██████
  none               120   10.0%  ████
  photosphere        120   10.0%  ████
  comet               11    0.9%
MORFOLOGIA POR KIND — a declaração por tipo de arquivo
  doc → planeta      573   47.6%  ███████████████████
  agent → estação    434   36.0%  ██████████████
  other → estrela     65    5.4%  ██
  decision → planeta    12    1.0%
  memory → planeta     1    0.1%
MODIFICADORES — anexáveis a qualquer corpo
  envelope            51    4.2%  ██
RECUSAS do solver — o que foi pedido e negado
corpos com pele desenhável: 1085 de 1205
```

## A ontologia

*família, tipo, porte e fenômeno* — `node scripts/censo-ontologia.mjs`

```
1. SISTEMAS — quem é a estrela de cada um
  agregados 120 · arquivos 1085
  sistemas com pelo menos um arquivo: 120
  ÓRFÃOS (sem sistema): 0 (0.0%)
2. FÍSICA — as dimensões, e as que não têm fato
  chunks       min       1 · MED       9 · P90      31 · máx      95
  activity     min    0.00 · MED    0.08 · P90    0.25 · máx    1.00
  age          min    0.00 · MED    0.50 · P90    0.90 · máx    1.00
  volatility   min    0.00 · MED    0.00 · P90    0.00 · máx    0.68
  sem fato (null, nunca zero):
    density       bytes por chunk — o indexador não emite. Conserta-se no indexador, não no grafo
    centrality    RESOLVIDA — snapshot de scripts/centralidade.mjs. `null` quando não materializada
    usage         RESOLVIDA — snapshot de scripts/uso.mjs (P5). Dimensão DISPONÍVEL, evidência hoje esparsa: ver evidenciaDeUso()
    connectivity  RESOLVIDA — snapshot de scripts/conectividade.mjs, e NÃO como a spec pedia: o grau repete a centralidade (ρ 0,821). O que ficou é o ALCANCE, ρ −0,083 com ela
    importance    RECUSADA como dimensão: é juízo, não fato. Derivá-la reconstrói o score composto
3. CLASSIFICAÇÃO — as três famílias
  structure    120
  body        1085
  corpos por degrau:
    estrela      120   11.1%
    planeta      514   47.4%
    lua          257   23.7%
    asteroide    194   17.9%
  porte das estrelas: normal 56 · gigante 6 · anã 58
  limiares (chunks): lua ≥ 3 · planeta ≥ 8 · estrela ≥ 20
4. FENÔMENOS — o que ACONTECE, sem trocar a classe
  atividade-de-cometa    575   53.0%
  extinto                 89    8.2%
  supernova               51    4.7%
  ana-branca               5    0.5%
  corpos com ao menos um: 669 (61.7%)
5. A MÉTRICA — quantos ainda recebem classe grande sem merecer
  ANTES   ████████████████████████████████████████  120 galáxias  (100% dos agregados)
  DEPOIS  ██  7 galáxias (repo)
          ██████████████████████████████████████  113 sistemas (diretório)
  classe grande indevida: 120 → 7  (−94.2%)
6. O QUE AINDA NÃO FECHA
  (nada — mas as quatro dimensões sem fato continuam sem fato)
  ⚠️ RESOLVIDA — snapshot de scripts/centralidade — a Fase A não fecha sem decisão sobre isto.
```

---

⚠️ **Classe sem população é o sinal que este relatório existe para dar.** Uma constante calibrada
contra um corpus continua valendo depois que ele muda de tamanho, e o sintoma não é erro: é uma
classe que some do céu. O `censo-corpus` acima acusa em vermelho quem ficou vazio — e a derivação
de cada uma está em [`calibracao.md`](./calibracao.md) §2.
