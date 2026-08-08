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

/**
 * Execuções distintas que tocam um corpo para o USO saturar. O P5 de `integracao-neo4j.md`.
 *
 * ⚠️ **Saturação declarada, e não normalização por posto — a diferença é honestidade.** O
 * `centralidade.mjs` normaliza influência pelo POSTO porque lá o substrato é denso (8 130 arestas)
 * e o que importa é a ordem. Aqui o substrato é RALO: com o diário de 2026-08-08 o grau máximo é 2,
 * e normalizar por posto daria `usage = 1.0` — "o corpo mais usado do céu" — a um arquivo que duas
 * execuções abriram. O número seria verdadeiro na ordem e falso na afirmação.
 *
 * Com saturação declarada, 2 toques valem 2/12 = 0,17 e o céu diz "quase não usado", que é o fato.
 * E o valor **sobe sozinho** conforme o diário cresce, sem reescalar nada: é o que permite a
 * evidência crescer organicamente sem migração de ontologia.
 */
const USO_CHEIO = 12;

/**
 * O piso a partir do qual o USO pode exercer influência — e nunca classificação.
 *
 * Os dois números saem de medidas desta base, não de gosto:
 *
 * - `grauMax` **5**: com máximo 2, "usado por muitos agentes" é um empate, não uma afirmação.
 * - `cobertura` **0,072**: é exatamente a do `CO_EDITED`, que a própria spec já declarou
 *   insuficiente para carregar dimensão (§3.2.1). O uso tem de passar do piso que já reprovou.
 *
 * ⚠️ Isto separa **"a dimensão existe"** de **"a dimensão tem poder estatístico"**. As duas coisas
 * são diferentes e esta base confundiu-as antes: dimensão ausente vale `null`, dimensão presente e
 * fraca vale um número pequeno com a evidência declarada ao lado.
 */
export const EVIDENCIA_USO_MINIMA = Object.freeze({ grauMax: 5, cobertura: 0.072 });

/**
 * A evidência de uso é forte o bastante para influenciar? Recebe os metadados do snapshot.
 *
 * Devolve sempre os três campos, e `disponivel: false` é diferente de `suficiente: false` —
 * o primeiro é "não materializei", o segundo é "materializei e é rala".
 */
export function evidenciaDeUso(meta) {
  if (!meta || typeof meta.grau_max !== 'number') {
    return { disponivel: false, suficiente: false, motivo: 'sem snapshot de uso' };
  }
  const { grauMax, cobertura } = EVIDENCIA_USO_MINIMA;
  if (meta.grau_max < grauMax) {
    return { disponivel: true, suficiente: false, motivo: `grau máximo ${meta.grau_max} < ${grauMax}` };
  }
  if ((meta.cobertura || 0) <= cobertura) {
    return { disponivel: true, suficiente: false, motivo: `cobertura ${((meta.cobertura || 0) * 100).toFixed(1)}% ≤ ${(cobertura * 100).toFixed(1)}%` };
  }
  return { disponivel: true, suficiente: true, motivo: 'grau e cobertura acima do piso' };
}

export { USO_CHEIO };

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
  usage: 'RESOLVIDA — snapshot de scripts/uso.mjs (P5). Dimensão DISPONÍVEL, evidência hoje esparsa: ver evidenciaDeUso()',
  connectivity: 'RESOLVIDA — snapshot de scripts/conectividade.mjs, e NÃO como a spec pedia: o grau '
    + 'repete a centralidade (ρ 0,821). O que ficou é o ALCANCE, ρ −0,083 com ela',
  importance: 'RECUSADA como dimensão: é juízo, não fato. Derivá-la reconstrói o score composto',
});

/** Massa em que um corpo passa a fundir. Ver `raioPorMassa`. */
export const MASSA_FUSAO = ESCADA.ESTRELA;
/** Raio no limiar: é onde as DUAS curvas se encontram. */
export const RAIO_FUSAO = 0.2;

/**
 * Massa → raio com DUAS curvas, porque a natureza tem duas.
 *
 * Derivada e validada na bancada (`sandbox/system-rig.js`) em 2026-08-07. A lei única `log2`
 * comprimia a faixa inteira do corpus em 3,6× e deixava a estrela 1,6× maior que o maior planeta,
 * contra ~10× de Sol para Júpiter — o erro não era o expoente, era supor UMA curva.
 *
 * - planeta (`c ≤ MASSA_FUSAO`): `R ∝ M^(1/3)`, a contribuição clássica dos íons. Acima de Júpiter
 *   a degenerescência achata a curva (`R ∝ M^-1/8`);
 * - estrela (`c > MASSA_FUSAO`): `R ∝ M^0.8`, sequência principal.
 *
 * ⚠️ As curvas SE TOCAM no limiar, e isso é fato: objetos perto do limite de queima de hidrogênio
 * têm raio de Júpiter. A dominância nasce da massa ACIMA do limiar, não de um degrau pintado.
 *
 * Medido: faixa do corpus 3,6× → 23×; estrela de 289 contra planeta no limiar 8,5×.
 *
 * > Fontes: ESA · Stars · Giant Planets (arXiv:1405.3752).
 */
export function raioPorMassa(chunks) {
  const c = Math.max(chunks, 0.001);
  const razao = c / MASSA_FUSAO;
  return RAIO_FUSAO * Math.pow(razao, c <= MASSA_FUSAO ? 1 / 3 : 0.8);
}

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

    /**
     * ALCANCE: que fração dos vínculos laterais deste corpo tem destino FORA do sistema dele.
     *
     * ⚠️ **Não é o "grau ponderado" que a spec pedia, e a troca foi obrigada por medida.** O grau
     * repete a centralidade (ρ **0,821**), a massa (0,688) e a atividade (0,714): seria uma quarta
     * dimensão que é a soma de três, que é o score composto já refutado nesta base.
     *
     * O alcance mede a parte da relação que a POSIÇÃO não comunica. A cena diz por contenção quem
     * mora junto; nada dizia se o vizinho semântico está dentro ou fora da pasta — e é justamente
     * esse cruzamento que a rede na seleção desenha. Medido: ρ **−0,083** com a centralidade,
     * **0,040** com a massa, **0,130** com a atividade. Praticamente ortogonal ao que o céu já tem.
     *
     * ⚠️ O confesso, publicado no snapshot: ρ **−0,623** com o TAMANHO do sistema — filho único de
     * pasta tem alcance 1,0 por construção (7 corpos, 3,7% do céu).
     *
     * ⚠️ Governa BRILHO ou destaque, jamais classe — `scripts/lei-neo4j.mjs` já perturbava este
     * campo antes de ele ter valor, e continua exigindo classe idêntica. `null` é "não
     * materializei"; `0` é "medi, e todos os vínculos dele ficam em casa".
     */
    connectivity: typeof node.connectivity === 'number' ? node.connectivity : null,
    /**
     * INFLUÊNCIA, do snapshot materializado — governa BRILHO, jamais escala ou classe.
     *
     * ⚠️ `null` quando o snapshot não existe, e isso é diferente de `0`. Um corpo sem o campo é um
     * corpo que ninguém mediu; um corpo com `0` é o mais periférico do céu. Confundi-los faria uma
     * materialização atrasada declarar periferia sobre 1 636 corpos.
     */
    centrality: typeof node.centrality === 'number' ? node.centrality : null,

    /**
     * USO: quantas execuções distintas de agente tocaram este corpo, saturado em `USO_CHEIO`.
     *
     * É a quinta grandeza do §11.1 do replanejamento — *atividade ≠ massa* — pelo caminho que só
     * o diário conhece: **influência por USO, não por semelhança**. `centrality` responde "quantos
     * se parecem comigo"; `usage` responde "quantos me abriram".
     *
     * ⚠️ Governa BRILHO, como toda grandeza vinda do Neo4j. `classificar()` não lê este campo, e
     * `scripts/lei-neo4j.mjs` prova isso perturbando o valor e exigindo classe idêntica — porque
     * declarar a lei não a implementa, e esta base já pagou cinco vezes por isso.
     *
     * ⚠️ `null` é "não materializei". `0` seria "medi e ninguém tocou" — e são fatos diferentes:
     * um corpus nunca lido e um corpo ignorado não são a mesma afirmação.
     */
    usage: typeof node.usage === 'number' ? node.usage : null,

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
  /*
   * ⚠️ **A guarda era `dormant === 0`, e ela lia `dormant` com o significado errado.**
   *
   * `dormant` não é "abandonado": é **toques na janela ANTIGA** (entre 30 e 180 dias, ver
   * `server/recency.py`). Um arquivo criado há seis meses e reescrito 27 vezes ESTE MÊS tem
   * `dormant ≥ 1` e `activity = 1,00` — é o corpo mais quente do repositório, e a guarda o
   * excluía do fenômeno que existe justamente para descrevê-lo.
   *
   * O efeito só aparece comparando dois corpora, e é grotesco:
   *
   * | corpus | o que acontecia |
   * |---|---|
   * | `espatial_vivo` (repo novo, nenhum commit velho) | `dormant = 0` em todos → **188 de 188** exercem o fenômeno |
   * | `espatial_fixture` (história sintética de meses) | `dormant ≥ 1` nos três saturados → **ZERO** |
   *
   * O mesmo `if` devolvendo 100% e 0% por causa da IDADE DO REPOSITÓRIO, não da atividade. Foi o
   * stress test do fixture que expôs isso — que é exatamente para o que ele existe
   * (`docs/cobertura.md`: fixture é CAPACIDADE, corpus real é COMPORTAMENTO).
   *
   * O caso abandonado já tem fenômeno PRÓPRIO logo abaixo (`extinto`, que exige `activity === 0`),
   * então excluí-lo aqui era redundância que custava o caso principal.
   */
  if (fisica.activity > 0.08) {
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
