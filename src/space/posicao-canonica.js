/**
 * A POSIÇÃO CANÔNICA — onde um corpo ESTÁ, e a única grandeza da cena que nenhum fato do grafo
 * pode tocar.
 *
 * ⚠️ **Módulo PURO: não importa `three`, não desenha, não conhece cena.** É o que permite ao
 * oráculo (`scripts/lei-neo4j.mjs` §2) perturbar a derivação direto no Node em vez de ler o código
 * à procura de um nome — e a lei que ele guarda é a que tem a pior consequência silenciosa desta
 * base depois da classe: um corpo que se move deixa de ser endereço.
 *
 * ## Por que ela é um módulo, e não quinze linhas dentro do `makeOrbit`
 *
 * A garantia do `README.md` é *"o mesmo conhecimento cai sempre no mesmo lugar"*, e ela é mais
 * forte que determinismo no tempo: um corpo errante é sempre calculável e **nunca está no mesmo
 * lugar**, então achar um arquivo onde você o deixou deixa de valer.
 *
 * Derivação dentro de uma closure é legível e não é PROVÁVEL — nenhum oráculo a alcança. Exposta
 * aqui, ela é perturbável, e declarar a invariante passa a implementá-la.
 *
 * ## O que entra aqui, e o que é recusa por construção
 *
 * Três fatos, e nenhum deles vem do grafo:
 *
 * | grandeza | de onde sai | o que ela significa |
 * |---|---|---|
 * | raio | `recency` — posto da data do último commit | ⚠️ **o raio É o eixo do tempo**: recente junto ao fogo, antigo à deriva |
 * | ângulo · inclinação · fase | `hash(id)` | estável entre sessões e entre máquinas |
 * | movimento médio | `meanMotion(raio)` | Kepler sobre o raio — `f(t)`, sem integrador |
 *
 * ☠️ **`centrality`, `usage` e `connectivity` não aparecem aqui, e a ausência é a lei.** O Neo4j
 * muda o BRILHO (`universe.js:brilhoDe`), nunca a classe e nunca a coordenada. Influência que
 * deslocasse a órbita faria o mesmo arquivo estar em X às 10h e em Y às 15h — e a cena deixaria de
 * ser um mapa para virar uma animação.
 *
 * ⭑ **`hash` entra por PARÂMETRO**, como em `moonsOf`. É o que mantém o módulo fora do alcance do
 * `three`: o hash real vive em `graph.js` porque a semente de toda feição por nó tem de sair do
 * mesmo lugar, e duas implementações dariam ao mesmo arquivo uma órbita e um planeta que não
 * conversam.
 */
import { meanMotion } from './motion-catalog.js';

/**
 * As CASCAS de cada tipo de nó, em unidades de cena — o intervalo de raio que ele pode ocupar.
 *
 * ⚠️ Elas não se sobrepõem por acidente: o raio é o eixo do tempo DENTRO de uma casca, e um corpo
 * nunca troca de casca. É esse invariante que a elipse do céu ainda não pôde abrir (a da LUA não o
 * toca — lá o raio é distância ao pai, não idade). Ver `docs/modelo-de-renderizacao.md`.
 */
export const CASCAS = Object.freeze({ repo: [11, 17], dir: [19, 33], file: [26, 62] });

/**
 * Onde este corpo mora, para sempre. Devolve só as grandezas de POSIÇÃO — quem monta o nó é a cena.
 *
 * @param {{id: string, type?: string, recency?: number}} node
 * @param {(text: string, salt?: number) => number} hash  determinístico; `graph.js:hash01`
 * @returns {{recency: number, radius: number, inclination: number, phase: number, speed: number, wobble: number}}
 */
export function posicaoCanonica(node, hash) {
  const [min, max] = CASCAS[node?.type] || CASCAS.file;

  /*
   * O RAIO É A RECÊNCIA. Recente perto do núcleo, antigo na periferia.
   *
   * Era hash do id: estável, e arbitrário — a geometria não dizia nada. O servidor manda `recency`
   * (posição no ranking da data do último commit) e a distância ao centro passa a informar quanto
   * conhecimento é mais novo que aquele.
   *
   * A direção não é escolha estética: memória nova CAI em direção ao buraco negro.
   *
   * ⚠️ A recência RESOLVIDA volta junto (com o fallback já aplicado), e é ela que alimenta o
   * atributo do shader. Recalcular o fallback num segundo lugar é como raio e janela passariam a
   * discordar sem que nada acusasse.
   */
  const recency = typeof node?.recency === 'number' ? node.recency : 0.5;
  const radius = min + (1 - recency) * (max - min);

  return {
    recency,
    radius,
    // Inclinação enviesada para o plano do disco: céu esférico perfeito perde a leitura de
    // "galáxia", que é o que a referência mostra.
    inclination: (hash(node.id, 2) - 0.5) * Math.PI * 0.55,
    phase: hash(node.id, 3) * Math.PI * 2,
    // `sqrt(GM/r³)` — a mesma função que dá o movimento médio das luas, com o mesmo `GM`. Era
    // `(r/26)^-1.5 · 0.16` aqui e `0.16² · 26³` lá, duas escritas da mesma constante.
    speed: meanMotion(radius),
    wobble: hash(node.id, 4),
  };
}
