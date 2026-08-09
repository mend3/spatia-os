/**
 * A ASTROFÍSICA — o único lugar desta base onde a matemática precisa ser física.
 *
 * ## Por que ele existe separado de `entity-physics.js`
 *
 * `EntityPhysics` parece física e não é: `chunks` é contagem de conhecimento, `scale` é degrau de
 * escada, `activity` é toque em 30 dias. São **metáforas físicas de propriedades do conhecimento**,
 * e é isso que faz esta cena significar alguma coisa. O que não pode é uma delas atravessar para
 * onde a luz é calculada — porque o caminho é curto e calado:
 *
 *     chunks → "massa" → gravidade → órbita → lente
 *
 * e no fim ninguém sabe onde terminou a metáfora e começou a relatividade. A lei está no §11.2 do
 * `replanejamento-celeste.md`: **nenhuma grandeza física é derivada de uma variável cognitiva sem
 * uma unidade e uma constante física explicitamente definidas.**
 *
 * ## A saída: RAZÃO, não massa
 *
 * A tentação é dar quilogramas a um arquivo para poder calcular `R_s = 2GM/c²`. Isso exigiria uma
 * constante de conversão `chunks → kg`, e essa constante seria LIVRE: escolhida para ficar bonita,
 * ou seja, curva artística vestida de física — o que a REGRA DA FÍSICA proíbe pelo nome.
 *
 * ⚠️ **Nada disso é necessário.** A deflexão no limbo depende só de `R_s / R`, que é
 * **adimensional**:
 *
 *     alfa(limbo) = 2 · (R_s / R)
 *
 * Uma razão atravessa qualquer escala sem `G`, sem `c` e sem quilograma. Ela é propriedade da
 * CLASSE do corpo — fato astronômico —, e é aplicada ao raio DESENHADO, seja ele qual for. Foi o que
 * o `corpoDaLente` do pulsar já fazia com um literal `0.4`; aqui esse número ganha nome e fonte.
 *
 * ## O que este módulo NÃO faz
 *
 * Não decide classe, não desenha e não conhece `three`. É **puro**, como `entity-physics.js` e
 * `superficies.js` — e é isso que deixa o oráculo `scripts/lente-estelar.mjs` importá-lo em `node`
 * em vez de transcrevê-lo. Uma transcrição a menos é uma obrigação de sincronia a menos.
 */

/**
 * `R_s / R` por classe de corpo — **adimensional**, e cada uma com a conta que a sustenta.
 *
 * `R_s = 2GM/c²` = 2,953 km por massa solar. As chaves são os VALORES de `SUPERFICIE`
 * (`superficies.js`) — o vocabulário único de pele —, mais os cadáveres estelares, que são fenômeno
 * e não pele. Quem lê isto é o renderer, e um literal solto do outro lado seria uma segunda fonte
 * da verdade livre para divergir em silêncio.
 */
export const RS_POR_RAIO = Object.freeze({
  /** `R_s` É o raio, por definição do horizonte. */
  'buraco-negro': 1,
  /** Estrela de nêutrons: ~4,1 km de `R_s` (1,4 M☉) contra ~10,5 km de raio. */
  pulsar: 0.4,
  /** 0,6 M☉ → `R_s` 1,77 km contra ~6.000 km de raio (Sirius B). */
  'ana-branca': 2.95e-4,
  /** Estrela tipo Sol: `R_s` 2,95 km contra 696.000 km de raio. Dá 1,75″ — Eddington, 1919. */
  photosphere: 4.24e-6,
  /** Terra: `R_s` 8,9 mm contra 6.371 km de raio. */
  planet: 1.39e-9,
});

/**
 * A deflexão de campo fraco. **Transcrita** de `blackhole-geodesic.js` (`2.0 * uRs / impacto`).
 *
 * ⚠️ A fonte é o GLSL; isto é cópia, com a mesma obrigação dos oráculos do buraco negro. Quem trava
 * a sincronia é `scripts/lente-estelar.mjs`, que aborta se a expressão sumir de lá.
 *
 * @param {number} rs  raio de Schwarzschild, na unidade que o chamador estiver usando
 * @param {number} b   parâmetro de impacto, na MESMA unidade
 * @returns {number} deflexão em radianos
 */
export const deflexao = (rs, b) => (2 * rs) / Math.max(b, 1e-9);

/**
 * Um corpo desta classe vale pelo menos um pixel de deflexão nesta tela?
 *
 * ⚠️ **É a pergunta certa, e ela não é "o corpo é massivo?".** Abaixo de um pixel o fenômeno não é
 * sutil — ele é ausente, e desenhá-lo seria afirmar algo que a tela não pode mostrar. Medido em
 * 2026-08-08: uma estrela tipo Sol deflete **0,0075 px** no limbo, 133× abaixo do corte.
 *
 * @param {string} classe  chave de `RS_POR_RAIO`
 * @param {number} pxPorRad  `altura_fb / (2·tan(fov/2))` — a MESMA constante de projeção da cena
 * @param {number} pisoPx  quantos pixels o fenômeno precisa valer para existir
 */
export function valeUmPixel(classe, pxPorRad, pisoPx = 1) {
  const razao = RS_POR_RAIO[classe];
  if (!Number.isFinite(razao)) return false;
  return deflexao(razao, 1) * pxPorRad >= pisoPx;
}

/**
 * A que distância — em RAIOS do próprio corpo — o anel de Einstein sai de dentro dele.
 *
 * Abaixo disso a luz que formaria o anel está atrás da fotosfera, e não há o que desenhar. Sai de
 * `theta_E > R / D_L`, que com a fonte muito atrás resolve para `D_L / R > 1 / (2 · R_s/R)`.
 *
 * Para o Sol dá 1,18 × 10⁵ raios — as 548 UA da distância focal da lente gravitacional solar. É por
 * isso que microlente estelar se detecta como BRILHO e nunca como arco resolvido.
 */
export const raiosParaAnelVisivel = (classe) => {
  const razao = RS_POR_RAIO[classe];
  return Number.isFinite(razao) ? 1 / (2 * razao) : Infinity;
};
