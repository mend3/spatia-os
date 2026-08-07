/**
 * PULSAR na bancada — e a ausência dele era o defeito mais caro deste objeto.
 *
 * ⚠️ Até 2026-08-06 o pulsar NÃO TINHA espécime. Três módulos, 972 linhas, cinco itens do brief
 * ainda abertos, e o único lugar onde ele desenhava era a cena viva — atrás de um voo de foco que
 * precisa de quadros. É literalmente o modo de falha que a REGRA DA INSPEÇÃO nomeia como tendo
 * custado meses no anel: *"o caminho onde o defeito morava não era desenhável ali. Não foi falta
 * de olhar — era invisível por construção."*
 *
 * ⚠️ O módulo importado é o da CENA (`space/pulsar.js`). Nada aqui reimplementa shader, geometria
 * ou parâmetro: uma bancada que copia o objeto passa a mentir na primeira divergência, e a
 * primeira divergência é exatamente quando ela seria útil.
 *
 * ## O contrato que a cena usa, reproduzido aqui em vez de aproximado
 *
 * `scene.js:1405-1415` faz duas coisas com a pele: escala o grupo por `pouso.radius` (mundo) e
 * passa `pouso.px` (o MESMO raio, projetado). Aqui é igual, e o `px` é DERIVADO do raio pela mesma
 * `diskPx` que a galáxia exporta — as duas não têm como discordar sobre a projeção. Comandar o
 * `px` por slider seria mais fácil e deixaria o nível de detalhe afirmar um tamanho que o olho não
 * vê, que é a classe de mentira que esta bancada existe para não cometer.
 */
import * as THREE from 'three';
import { createPulsar, pulsarParams, LOD_FAR_PX, LOD_NEAR_PX } from '../space/pulsar.js';
import { diskPx } from '../space/galaxy.js';

/** O nó mínimo — só os campos que `pulsarParams` lê. `massRank` entra direto, sem passar por chunks. */
function noFalso(values) {
  return {
    source: `bancada/pulsar/${values.seed.toFixed(3)}`,
    massRank: values.massa,
  };
}

/*
 * ITENS DO BRIEF AINDA ABERTOS neste objeto. Ficam aqui, e não no `watch`, porque `watch` é o que
 * se OLHA agora — uma lista de trabalho pendente rolando no painel esconde a que se usa.
 *
 * - #3 CAMPO TURBULENTO — o campo magnético é liso demais; o real é sujo.
 * - #4 FEIXES COMO VOLUME — hoje são geometria. ⚠️ Conte `fatias × amostras` antes de empilhar.
 * - #5 VENTO DIFUSO NO LUGAR DA AGULHA — o jato está calibrado para QUASAR.
 * - #9 HALO EM QUATRO CAMADAS no shader.
 * - #10 LENTE GRAVITACIONAL — `lensing.js` já existe e o buraco negro está travado nele.
 */
export const PULSAR_SPEC = {
  id: 'pulsar',
  name: 'PULSAR',
  /*
   * 6, e o número passou por 6 → 13 → 6 de novo — a viagem toda vale registrar.
   *
   * Eu abri com 6, calculado do raio de ÂNCORA (1), e a câmera nasceu DENTRO do objeto: o corpo
   * não tem 1 raio. Corrigi para 13, que enquadrava o feixe de então. E foi ao medir POR QUE 13
   * era necessário que o item #5 apareceu com número — o vento chegava a 35 raios contra os 2,6
   * do enquadramento da cena, 13,7x além.
   *
   * Com as proporções consertadas (`BEAM_LENGTH` 6,5 → 1,3) o objeto inteiro cabe em 2,28 raios, e
   * 6 volta a ser o valor certo: `k·2,28/6` com k ≈ 951 dá ~360 px de meia-altura, dentro dos
   * ~600 da janela, e a âncora abre em ~158 px, acima de `LOD_NEAR_PX` — o espécime nasce no
   * detalhe PLENO, que é o que ele precisa fazer.
   *
   * ⚠️ A lição não é sobre o número: **a bancada errada apontou para o objeto errado.** Eu quase
   * ajustei a distância uma segunda vez em vez de perguntar por que ela precisava ser tão grande.
   */
  distance: 6,
  controls: [
    /*
     * MASSA governa três coisas de uma vez, e é isso que a torna o botão interessante: o tamanho
     * do corpo (0,10→0,16), o período (INVERSO — pulsar jovem e massivo é lento, o de
     * milissegundo é o velho reciclado) e nada mais. A obliquidade sai da semente.
     */
    { key: 'massa', label: 'MASSA (rank)', type: 'range', min: 0, max: 1, step: 0.01, value: 0.5 },
    { key: 'seed', label: 'SEED (caminho)', type: 'range', min: 0, max: 1, step: 0.001, value: 0.42 },
    /*
     * RAIO DA ÂNCORA em unidades de mundo — o mesmo número que `scene.js` usa como escala do
     * grupo. Ele varre a escada de LOD inteira: em 0,13 o corpo cai abaixo de `LOD_FAR_PX` e some,
     * em 1,0 ele está no detalhe pleno.
     */
    { key: 'raio', label: 'RAIO DA ÂNCORA', type: 'range', min: 0.05, max: 2, step: 0.01, value: 1 },
    /*
     * FILAMENTO do pulso. Entra em 0 porque é assim que a CENA está — o usuário pediu para tirar
     * os espinhos, e o espécime tem de abrir mostrando o que a cena mostra, não uma versão
     * embelezada dela. Subir para 1 mostra o DEFEITO, que é o que torna o controle útil: ele deixa
     * a decisão de religar ser tomada VENDO, e deixa quem for consertar o campo ter um antes.
     */
    { key: 'filamento', label: 'FILAMENTO DO PULSO', type: 'range', min: 0, max: 1, step: 0.01, value: 1 },
    /*
     * DECAIMENTO — o que salvou o filamento. Ele alisa a estrutura ao longo do ciclo do pulso, de
     * 1 a 0, então as cristas só existem no instante em que a casca nasce. Em 0 elas voltam a ser
     * permanentes, que é a ESTRELA DE PONTAS: é esse o par que este controle serve para comparar.
     */
    { key: 'decaimento', label: 'DECAIMENTO DO FILAMENTO', type: 'range', min: 0, max: 1, step: 0.01, value: 1 },
    /*
     * NEBULOSA — a camada mais externa, a 7 raios de âncora. O controle existe porque ela é tênue
     * de propósito: com ela ligada, um defeito NELA lê como fundo sujo, e a única forma de saber
     * de quem é a sujeira é apagá-la. Foi assim que os três erros dela apareceram.
     */
    { key: 'nebulosa', label: 'NEBULOSA DE VENTO', type: 'range', min: 0, max: 2, step: 0.05, value: 1 },
    { key: 'reduzido', label: 'MOVIMENTO REDUZIDO', type: 'bool', value: false },
  ],
  watch: [
    '⚠️ UM BATIMENTO SÓ: `batimento` no readout governa halo, núcleo e feixes juntos',
    'MOVIMENTO REDUZIDO congela o batimento em 0,50 e para a fervura do núcleo',
    'RAIO DA ÂNCORA até 0,05: o corpo desaparece suavemente ao cruzar LOD_FAR_PX (26 px)',
    '⚠️ a NEBULOSA é a única camada que NÃO respira com o batimento',
    '⚠️ FILAMENTO em 1 e DECAIMENTO de 1 a 0: as cristas MIGRAM, não aparecem e somem no lugar',
    '⚠️ a ordem das três é a afirmação do objeto: VENTO > JATO > LOBO',
    '⚠️ o vento é um TORO, não um ouriço: orbite e procure a CINTURA equatorial',
    'OBLIQUIDADE não pode ser 0 nem 90° — nos dois o beaming deixa de existir',
  ],
  build(ctx) {
    const grupo = new THREE.Group();
    const pulsar = createPulsar();
    grupo.add(pulsar.object);

    return {
      object: grupo,
      update(values, camera, clock) {
        const params = pulsarParams(noFalso(values), 0xbcd4ff);

        // O contrato da cena, reproduzido: escala pelo raio, e o px sai do MESMO raio.
        pulsar.object.scale.setScalar(values.raio);
        pulsar.object.position.set(0, 0, 0);

        /*
         * ⚠️ Altura de FRAMEBUFFER, não CSS. A escada de LOD do módulo é escrita em pixel de
         * framebuffer, que é o que a cena passa (`canvas.height`). Passar `innerHeight` cru
         * dividiria por dois todo número em tela retina — a armadilha que já escondeu um DPR
         * inteiro da bancada do anel.
         */
        const alturaFb = document.querySelector('canvas')?.height ?? window.innerHeight;
        const px = diskPx(values.raio, camera.position.length(), alturaFb, camera.fov);

        pulsar.tune({ filamento: values.filamento, decaimento: values.decaimento, nebulosa: values.nebulosa });
        const nivel = pulsar.update(params, px, clock.elapsed, values.reduzido, camera);
        // LIDO do módulo, não recalculado aqui. Uma segunda cópia da fórmula do batimento seria a
        // primeira coisa a divergir — e justamente quando a leitura fosse útil.
        const ultimo = pulsar.beat();

        ctx.report({
          px: `${px.toFixed(0)} fb · ${(px / (window.devicePixelRatio || 1)).toFixed(0)} na tela`,
          nível: `${nivel.toFixed(3)}  (${px < LOD_FAR_PX ? 'abaixo do piso' : px > LOD_NEAR_PX ? 'pleno' : 'na rampa'})`,
          escada: `${LOD_FAR_PX} → ${LOD_NEAR_PX} px`,
          batimento: ultimo.batimento.toFixed(3) + (values.reduzido ? '  (congelado)' : ''),
          alinhamento: ultimo.alinhamento.toFixed(3),
          período: `${params.period.toFixed(2)} s`,
          obliquidade: `${((params.obliquity * 180) / Math.PI).toFixed(0)}°`,
          'núcleo (raios)': params.core.toFixed(3),
          feixe: params.beam.toFixed(2),
          filamento: values.filamento === 0 ? 'desligado' : `${values.filamento.toFixed(2)} · decai ${values.decaimento.toFixed(2)}`,
          nebulosa: values.nebulosa === 0 ? 'desligada' : `${values.nebulosa.toFixed(2)} · 7,0 R âncora`,
        });
      },
      dispose: () => pulsar.dispose(),
    };
  },
};
