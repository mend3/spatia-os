/**
 * OS SISTEMAS — quem mora com quem, quem domina, e a IDENTIDADE que sai disso. Um dono só.
 *
 * ## Por que este módulo existe
 *
 * `entity-physics.js` responde *o que um corpo é sozinho* e `superficies.js` responde *que pele
 * isso desenha*. Nenhum dos dois sabe o que só se vê olhando os VIZINHOS: quem é o corpo mais
 * massivo do sistema. E `dominante` é a única entrada de contexto de `entityPhysics()` — ela decide
 * se um corpo alcança `case 'estrela'` ou tem teto em planeta, e daí saem porte, pele, luz e
 * envelope. Errá-la troca a identidade de um corpo, não um detalhe dele.
 *
 * ☠️ **Esse contexto tinha TRÊS derivações vivas, e a fonte era uma CENA.** `universe.load()`
 * agrupava pelas arestas de contenção; `hud/favoritos-ui.js` declarava-se *"uma TRANSCRIÇÃO do
 * agrupamento de `universe.load()`"*; `scripts/lei-cena.mjs` reconstruía por `dir` mais a lista de
 * `dir` EMITIDOS. Três cópias de uma regra que decide identidade, e a fonte morando dentro de uma
 * das duas cenas — de onde a outra cena não podia lê-la sem inverter a dependência.
 *
 * ⭑ **As três concordavam quando isto foi escrito**, e a medida é o que autoriza a fusão: no
 * `espatial_fixture` de 2026-08-09, arestas e por-`dir` davam **21 sistemas · 21 dominantes ·
 * 72/72 corpos cobertos**, com interseção total (`0` dominantes exclusivos de cada lado). Fundir
 * cópias que discordam é escolher um vencedor em silêncio; fundir cópias medidas como idênticas é
 * tirar duas fontes livres para divergir amanhã.
 *
 * ## O agrupamento é por CONTENÇÃO SERVIDA, e não por caminho
 *
 * As arestas de `/api/graph` são a hierarquia que o SERVIDOR promoveu (`graph._hierarchy`), e é ela
 * que manda. Reconstruir o sistema a partir de `node.dir` obriga a repetir a regra do servidor —
 * *"só é sistema a pasta com mais de um arquivo"* — e quem esquecê-la dá sistema próprio ao arquivo
 * solitário, que então vira dominante e portanto ESTRELA **por causa do layout do disco**.
 *
 * ## Módulo PURO
 *
 * ⚠️ Sem `three`, sem DOM, sem cena — como `entity-physics.js` e `superficies.js`. É o que permite
 * ao oráculo e ao censo lerem a MESMA derivação que o céu, em vez de transcrevê-la. `scripts/
 * lei-cena.mjs` §3 reprova se um `import` de cena entrar aqui.
 */

import { entityPhysics, classificar, fenomenos, dominanteDe } from './entity-physics.js';
import { superficieDe } from './superficies.js';

/** O índice vazio — o que se responde antes de qualquer topologia chegar. */
function vazio() {
  return Object.freeze({
    corpus: null,
    sistemas: Object.freeze([]),
    nos: 0,
    cobertos: 0,
    semContexto: 0,
    ehDominante: () => false,
    sistemaDe: () => null,
    identidadeDe: () => null,
    identidadeDaFonte: () => null,
    // ⚠️ O índice vazio responde a MESMA forma do cheio: um chamador que precise testar qual dos
    // dois tem na mão acabaria testando a presença do método, que é contrato por acidente.
    todas: () => new Map(),
  });
}

/**
 * Indexa uma topologia: os sistemas, quem domina cada um, e a identidade de cada nó.
 *
 * ⚠️ **A identidade é derivada UMA VEZ, na carga, e guardada** — ela não depende de cena, de pose
 * nem de quadro. O que depende de cena é o que se ACENDE e de onde se OLHA; se a identidade
 * dependesse, a cena estaria decidindo o que um corpo É, que é o que `lei-cena.mjs` existe para
 * proibir.
 *
 * @param {object} payload  o corpo de `/api/graph` — o MESMO que as duas cenas recebem
 */
export function indexar(payload) {
  const nodes = payload?.nodes || [];
  const identidades = new Map();
  const dominantes = new Set();
  const sistemaDeFonte = new Map();
  const porFonte = new Map();
  const sistemas = [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const filhos = new Map();
  for (const [filho, pai] of payload?.edges || []) {
    if (!filhos.has(pai)) filhos.set(pai, []);
    filhos.get(pai).push(byId.get(filho));
  }

  const derivar = (node, dominante, sistema) => {
    const fisica = entityPhysics(node, { dominante, sistema });
    const classe = classificar(fisica, node);
    const ativos = fenomenos(fisica, node).map((f) => f.tipo);
    return Object.freeze({
      node,
      fisica,
      classe,
      ativos,
      pele: superficieDe(classe, fisica, ativos),
    });
  };

  /*
   * O AGREGADO não depende de agrupamento: `classificar()` o resolve como ESTRUTURA pelo tipo, e é
   * dele que sai o motivo *"agregado não tem corpo"*. Ele entra no índice para que quem perguntar
   * por uma pasta receba a resposta certa em vez de um buraco que o chamador tenha de interpretar.
   */
  const aggs = nodes.filter((n) => n.type !== 'file');
  for (const agg of aggs) identidades.set(agg.id, derivar(agg, false, null));

  for (const agg of aggs) {
    const meus = (filhos.get(agg.id) || []).filter((c) => c?.type === 'file');
    if (!meus.length) continue;
    const dono = dominanteDe(meus);
    sistemas.push({ agg, estrela: dono, planetas: meus.filter((f) => f.id !== dono.id) });
    for (const f of meus) {
      if (f.id === dono.id) dominantes.add(f.source);
      sistemaDeFonte.set(f.source, agg.id);
      const identidade = derivar(f, f.id === dono.id, agg.id);
      identidades.set(f.id, identidade);
      porFonte.set(f.source, identidade);
    }
  }

  return Object.freeze({
    /* ⚠️ O carimbo vem do SERVIDOR, que é quem lê o `.env`. Um default aqui afirmaria um céu que
     * ninguém está vendo — a mesma recusa que `graphdb._recusa_de_corpus` faz do lado de lá. */
    corpus: payload?.corpus?.collection ?? null,
    sistemas: Object.freeze(sistemas),
    nos: nodes.length,
    cobertos: identidades.size,
    /* Nó que o agrupamento não alcança fica FORA, e o número sai publicado: assumir
     * `dominante: false` daria contexto de planeta a uma estrela, com toda a cara de medida. */
    semContexto: nodes.length - identidades.size,
    ehDominante: (source) => dominantes.has(source),
    sistemaDe: (source) => sistemaDeFonte.get(source) ?? null,
    /**
     * A identidade de um nó — física, classe, fenômenos e PELE, derivadas de uma vez só.
     *
     * ⚠️ **`null` significa "o agrupamento não alcança este nó", e o chamador tem de dizê-lo.**
     * O caso vivo é a LUA da cena AGENTE: ela é uma SEÇÃO sintetizada em `graph.load` a partir de
     * `orbital-zones.moonsOf`, não vem do payload, e portanto não está aqui. Devolver uma
     * identidade plausível para ela seria afirmar sobre um corpo que o corpus não contém.
     * ⭑ Medido no `espatial_fixture` de 2026-08-09: **0 luas sintetizadas em 72 arquivos** — o
     * caminho existe no código e hoje não tem população, então não há o que medir nele.
     */
    identidadeDe: (node) => (node?.id ? identidades.get(node.id) ?? null : null),
    /**
     * A identidade por FONTE — o endereço com que a cena e a HUD falam de um corpo.
     *
     * ⚠️ Ela é um índice PRÓPRIO, e não `identidadeDe({ id: source })`. Hoje `id` e `source` são
     * iguais para arquivo neste corpus, e apoiar-se nessa coincidência é como se compra um defeito
     * silencioso: no dia em que o indexador der `id` sintético, o rótulo do painel some sem erro.
     */
    identidadeDaFonte: (source) => (source ? porFonte.get(source) ?? null : null),
    /**
     * Todas as identidades, por `id`. Quem precisa do CONJUNTO — a sonda dos favoritos, um censo —
     * lê daqui em vez de refazer a varredura, senão volta a existir uma segunda derivação.
     */
    todas: () => new Map(identidades),
  });
}

/*
 * O ÍNDICE EM VIGOR — e ele é estado, com um dono só e uma porta só de escrita.
 *
 * ⚠️ Guardar aqui em vez de enfiar o índice por parâmetro nas duas cenas e na HUD é o que impede a
 * quarta cópia: quem precisar do contexto chama `indice()`, e não há como um chamador construir o
 * seu. `carregar()` é chamada por `scene.loadGraph`, junto de `graph.load` e `universe.load`, para
 * as três leituras do mesmo payload nascerem no mesmo instante.
 */
let atual = vazio();

/** Reindexa a topologia servida. Idempotente: recarregar refaz tudo. */
export function carregar(payload) {
  atual = indexar(payload);
  return atual;
}

/** O índice em vigor. Antes de qualquer carga ele responde vazio, nunca `undefined`. */
export function indice() {
  return atual;
}
