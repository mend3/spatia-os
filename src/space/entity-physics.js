/**
 * ENTITY PHYSICS — o vetor que decide o que uma entidade é, antes de qualquer forma.
 *
 * Ele existe para impedir a recaída que o `docs/replanejamento-celeste.md` §10 nomeia:
 *
 *     if (kind === 'folder') galaxy()
 *     if (kind === 'script') comet()
 *
 * A ordem passa a ser `entidade → física → classificação → família → morfologia`, e o filesystem
 * vira **fonte de observação** em vez de taxonomia do universo.
 *
 * ⚠️ **Módulo PURO: não importa `three`, não desenha, não conhece cena.** É o que permite ao censo
 * (`scripts/censo-ontologia.mjs`) lê-lo direto no Node — e é o que garante que a medida e o céu
 * usem a MESMA derivação, em vez de duas cópias que divergem na primeira edição.
 *
 * ⚠️ **Quatro das onze dimensões propostas não têm fato**, e isso está declarado em vez de
 * fingido — ver `AUSENTES`. Declarar uma invariante não a implementa: esta base já pagou cinco
 * vezes por campo sem leitor.
 */

// ─────────────────────────────────────────────────────────── constantes calibradas

/**
 * Degraus da escada de massa, em chunks. **Calibradas contra o corpus de 2026-08-07 — expiram.**
 *
 * Distribuição medida: P50 5 · P75 13 · P90 25 · máx 289, em 1 636 arquivos.
 *
 * `ESTRELA` em 20 fica entre P75 e P90 e põe ~13% dos arquivos acima — perto dos 221 sistemas que a
 * contenção produz, que é a âncora. `LUA` e `PLANETA` saem dos quartis, e não de gosto.
 *
 * ⚠️ Quem reindexar um corpus muito maior refaz a conta: os degraus são percentis CONGELADOS em
 * número absoluto, porque percentil vivo reclassifica um corpo quando OUTRO muda — refutado com
 * número em `docs/medicoes-2026-08-07.md` §3.1 (74,6% dos nós trocariam de classe).
 */
export const ESCADA = Object.freeze({
  ASTEROIDE: 0,
  LUA: 3,
  PLANETA: 8,
  ESTRELA: 20,
});

/** Toques na janela recente para a atividade saturar. Mesmo espírito do piso de supernova. */
const ATIVIDADE_CHEIA = 12;

/** Massa acima da qual um corpo parado vira remanescente. Ver `server/recency.py`. */
const MASSA_REMANESCENTE = 13;

/**
 * As dimensões propostas que **não têm fato hoje**, com o dono de cada uma.
 *
 * Elas valem `null`, nunca `0`: `0` afirma "medi e é zero", `null` afirma "não medi". Colapsar os
 * dois faria o céu declarar periferia sobre 1 636 corpos por causa de um serviço fora do ar.
 */
export const AUSENTES = Object.freeze({
  density: 'bytes por chunk — o indexador não emite. Conserta-se no indexador, não no grafo',
  centrality: 'RESOLVIDA — snapshot de scripts/centralidade.mjs. `null` quando não materializada',
  connectivity: 'Neo4j (arestas laterais). Hoje o grafo é 100% contenção',
  importance: 'RECUSADA como dimensão: é juízo, não fato. Derivá-la reconstrói o score composto',
});

// ─────────────────────────────────────────────────────────── derivação

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Em que degrau da escada esta massa cai. É a ÚNICA coisa que decide corpo. */
export function degrau(chunks) {
  if (chunks >= ESCADA.ESTRELA) return 'estrela';
  if (chunks >= ESCADA.PLANETA) return 'planeta';
  if (chunks >= ESCADA.LUA) return 'lua';
  return 'asteroide';
}

/**
 * O vetor físico de uma entidade.
 *
 * `contexto` traz o que só se sabe olhando os vizinhos — hoje apenas se este arquivo é o mais
 * massivo do sistema dele. Ele é opcional: sem contexto a física continua válida, só não sabe
 * responder "é a estrela DESTE sistema?".
 */
export function entityPhysics(node, contexto = {}) {
  const massa = Math.max(node.chunks || 0, 0);
  const churn = Math.max(node.churn || 0, 0);

  return Object.freeze({
    /** Massa bruta — a grandeza que governa ESCALA e gravidade. */
    mass: massa,
    /** O degrau da escada. Deriva só da massa, e é isso que corrige a inversão nº 1. */
    scale: degrau(massa),
    /** Energia: quanto o corpo está sendo trabalhado agora. Governa BRILHO, nunca tamanho. */
    activity: clamp01(churn / ATIVIDADE_CHEIA),
    /** Idade como posição no ranking — uniforme por construção, e por isso estacionária. */
    age: typeof node.recency === 'number' ? node.recency : 0.5,
    /**
     * Ritmo de edição, entre irregular (0) e metronômico (1). É o que a classe pulsar lê.
     *
     * ⚠️ Não é variância de TAMANHO, e o nome engana: `regularity` mede o compasso dos commits.
     * Fica registrado para ninguém derivar volatilidade de conteúdo daqui.
     */
    volatility: clamp01(node.regularity || 0),
    /** Composição: o tipo declarado. Pobre por construção — o índice não ingere código. */
    composition: node.kind || 'other',
    /** Janelas de dormência. É o que separa "parou" de "foi abandonado". */
    dormant: node.dormant || 0,

    /** Sem fato hoje. Ver `AUSENTES`. NUNCA zero. */
    density: null,
    connectivity: null,
    /**
     * INFLUÊNCIA, do snapshot materializado — governa BRILHO, jamais escala ou classe.
     *
     * ⚠️ `null` quando o snapshot não existe, e isso é diferente de `0`. Um corpo sem o campo é um
     * corpo que ninguém mediu; um corpo com `0` é o mais periférico do céu. Confundi-los faria uma
     * materialização atrasada declarar periferia sobre 1 636 corpos.
     */
    centrality: typeof node.centrality === 'number' ? node.centrality : null,

    /** Contexto: este arquivo é o corpo mais massivo do sistema dele? */
    dominante: contexto.dominante === true,
    sistema: contexto.sistema ?? null,
  });
}

// ─────────────────────────────────────────────────────────── ontologia

/** As três famílias. Elas nunca disputam o mesmo campo — ver §10.1 do replanejamento. */
export const FAMILIA = Object.freeze({
  ESTRUTURA: 'structure',
  CORPO: 'body',
  FENOMENO: 'phenomenon',
});

/**
 * Classifica uma entidade nas três famílias.
 *
 * A regra que separa estrutura de corpo é dura e não depende de massa: **estrutura é contêiner**
 * (repo, diretório) e **corpo é folha** (arquivo). Foi a acumulação das duas no mesmo campo que
 * inflou a galáxia até 228 de 228 agregados.
 *
 * ⚠️ **A estrela é o arquivo mais massivo do sistema, não a pasta.** A decisão original dizia "a
 * pasta vira estrela"; a ontologia não deixa, porque pasta é ESTRUTURA e estrela é CORPO. O
 * briefing já apontava a saída ao listar "documento raiz" entre os candidatos a estrela: o sistema
 * é a pasta, a estrela é a entidade raiz dentro dela. Uma pasta com 4 arquivos vira um sistema com
 * uma estrela e três planetas — e o número de estrelas continua sendo o de pastas.
 *
 * Fenômeno não é classificado aqui: ele ACONTECE a um corpo, e quem o lista é `fenomenos()`.
 */
export function classificar(fisica, node) {
  if (node.type !== 'file') {
    return { familia: FAMILIA.ESTRUTURA, tipo: 'sistema', motivo: 'contêiner: tem filhos, não tem corpo' };
  }

  /*
   * ⚠️ **DOMINÂNCIA decide papel; MASSA decide porte.** Foi preciso medir para descobrir.
   *
   * A primeira versão usava o limiar global de massa para decidir quem é estrela, e o corpus
   * respondeu: **80 estrelas dominantes, 148 sistemas SEM estrela nenhuma e 174 "companheiras"** —
   * arquivos acima do limiar que não são o corpo principal de lugar nenhum. 174 binárias não é um
   * céu, é um limiar aplicado na pergunta errada.
   *
   * A estrela é a entidade DOMINANTE do sistema, e o briefing já dizia isso: *"ela é quem possui
   * massa suficiente para manter tudo organizado"*. Papel é relação, não valor absoluto.
   *
   * E isto é seguro por CONSTRUÇÃO, não por sorte: a dominante é a mais massiva do sistema, então
   * nenhum planeta pode ser maior que a sua estrela. A inversão nº 1 fica impossível em vez de
   * proibida — que é a diferença entre invariante implementada e invariante declarada.
   */
  if (fisica.dominante) {
    return { familia: FAMILIA.CORPO, tipo: 'estrela', porte: porteEstelar(fisica.mass), motivo: 'entidade dominante do sistema' };
  }

  // Corpo não dominante nunca é estrela — o teto é planeta, e ele não pode passar a dominante.
  const escalado = fisica.scale === 'estrela' ? 'planeta' : fisica.scale;
  return { familia: FAMILIA.CORPO, tipo: escalado, motivo: 'degrau de massa, com teto em planeta' };
}

/**
 * O PORTE da estrela, já que o papel dela não vem mais da massa.
 *
 * A massa não decide mais SE é estrela, mas continua decidindo que estrela é — que é o que a lei de
 * duas curvas (`system-rig.js`) desenha. Sem isto a massa sairia da estrela por completo, e a
 * escada perderia justamente o corpo em que ela mais importa.
 */
export function porteEstelar(chunks) {
  if (chunks >= ESCADA.ESTRELA * 4) return 'gigante';
  if (chunks >= ESCADA.ESTRELA) return 'normal';
  return 'anã';
}

/**
 * Os fenômenos ATIVOS num corpo. Vários podem ser verdade ao mesmo tempo.
 *
 * ⚠️ Nenhum deles troca a classe do corpo — é a lição da supernova, que reprovou como classe
 * porque excluía as outras e tirava a superfície de 27 corpos.
 */
export function fenomenos(fisica, node) {
  const lista = [];
  if ((node.supernova || 0) > 0.001) {
    lista.push({ tipo: 'supernova', motivo: 'surto de churn acima do piso' });
  }
  if (fisica.activity > 0.08 && fisica.dormant === 0) {
    lista.push({ tipo: 'atividade-de-cometa', motivo: 'trabalho recente: coma e cauda' });
  }
  if (node.dwarf === 1 || (fisica.mass >= MASSA_REMANESCENTE && fisica.activity === 0 && fisica.dormant === 0 && fisica.age <= 0.25)) {
    lista.push({ tipo: 'ana-branca', motivo: 'massa que sobrou depois que a atividade acabou' });
  }
  if (fisica.dormant >= 2 && fisica.activity === 0) {
    lista.push({ tipo: 'extinto', motivo: 'duas janelas sem toque: abandonado' });
  }
  return lista;
}
