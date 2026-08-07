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
    { key: 'filamento', label: 'FILAMENTO DO PULSO', type: 'range', min: 0, max: 1, step: 0.01, value: 0 },
    { key: 'reduzido', label: 'MOVIMENTO REDUZIDO', type: 'bool', value: false },
  ],
  watch: [
    '⚠️ UM BATIMENTO SÓ, e este é o espécime que finalmente permite conferir. Rode o tempo e olhe o readout `batimento`: brilho do núcleo, calota polar, halo e vento têm de subir e descer JUNTOS com ele. Se alguma camada tiver ritmo próprio, o objeto tem várias animações em vez de uma pulsação — e essa é a afirmação central da arquitetura em camadas. ⚠️ Screenshot NÃO julga isto: várias animações e uma pulsação única produzem imagens parecidas em qualquer instante e só divergem ao longo do tempo.',
    'MOVIMENTO REDUZIDO: o batimento tem de CONGELAR em 0,50 e a fervura do núcleo parar. Um campo parado é uma afirmação honesta; um campo animado devagar não é redução de movimento, é movimento mais lento.',
    'RAIO DA ÂNCORA de 2,0 até 0,05: o corpo tem de DESAPARECER suavemente ao cruzar LOD_FAR_PX (26 px de âncora), não sumir de uma vez. O readout `px` e `nível` dizem onde você está na escada.',
    '⚠️ FILAMENTO DO PULSO em 0 (o padrão, e o que a cena faz): a casca do pulso tem de continuar existindo, LISA. Se o pulso SUMIR junto, o portão está multiplicando em vez de misturar com 1 — e aí "sem filamento" virou "sem pulso", que são coisas diferentes.',
    '⚠️ FILAMENTO em 1 mostra o DEFEITO, não uma alternativa: ~16 cristas radiais em volta de um ponto brilhante, que leem como ESTRELA DE PONTAS. É por isso que ele entra em 0. Duas tentativas de consertar foram REFUTADAS e estão registradas em `pulsar-pulse.js` — subir o raio do círculo de amostragem só multiplica as pontas, e as facetas do cone não têm nada a ver. Quem for consertar de verdade tem de mexer na RAZÃO entre a taxa angular e a radial do ruído.',
    '⚠️ CABE NO ENQUADRAMENTO, e isto é o item #5 fechado. As três feições medem, em raios de âncora: lobo 0,41–0,76 · jato 0,86–1,61 · vento 1,23–2,28, e `SKIN_EXTENT.pulsar` é 2,6. Antes eram 3,5 / 16,1 / 35,5 — o vento estendia 13,7x ALÉM do que o foco enquadra, e a câmera em foco ficava dentro da nuvem. Se alguma feição voltar a sair do quadro, a calibração de QUASAR voltou.',
    '⚠️ A ORDEM das três é a afirmação do objeto: VENTO > JATO > LOBO. Num pulsar quem domina é o vento — o Caranguejo é um toro com dois jatos modestos. Se o jato voltar a dominar, o corpo virou um núcleo ativo com nome de pulsar, que era exatamente o defeito.',
    '⚠️ O VENTO É UM TORO, não um ouriço. Olhe de vários ângulos: tem de haver CINTURA (concentração equatorial) e rarefação nos polos. Se ele for uma bola isotrópica de raias radiais, ou a amostragem por sin²θ voltou a ser uniforme, ou a espiral sumiu — e eram esses dois defeitos juntos que faziam o corpo ler como fogo de artifício.',
    '⚠️ E as raias radiais não podem voltar. Cada partícula percorria uma RETA a partir do centro, e com 900 direções fixas havia 900 raias simultâneas. Agora a trajetória é uma espiral de Arquimedes cujo ângulo sai do RAIO, nunca do relógio — se ele vier do tempo, o padrão enrola sem fim (Lin-Shu, cinco mortes neste projeto).',
    '⚠️ E confira que ele DESENHA em algum lugar da escada. `SKIN_EXTENT.pulsar = 4` uma vez travou o chão do zoom em px = 26,4, o valor EXATO de LOD_FAR_PX — o corpo não era desenhável em distância nenhuma, e ninguém percebeu porque não havia bancada. É a regra "enquadra-se a FIGURA, não a extensão".',
    'MASSA 0 → 1: o período tem de AUMENTAR (o readout diz em segundos) e o corpo crescer pouco. É o inverso do resto do céu, e é a física: o pulsar de milissegundo é o velho reciclado por acreção, não o jovem.',
    'ORBITE: o `alinhamento` no readout é |eixo magnético · linha de visada|, e é ele que governa o beaming (0,35 + 2,4·cos³). Com o feixe apontando para você o brilho tem de subir MUITO — potência 3 é quase um interruptor, e é o que faz um pulsar ser um farol e não uma lâmpada.',
    'a OBLIQUIDADE (ângulo entre o eixo magnético e o de rotação) não pode ser 0 nem 90°: alinhado, o feixe aponta sempre para o mesmo lugar e o corpo vira uma lâmpada acesa; a 90° os dois feixes passam juntos e o ritmo dobra sem querer. A faixa é 18°–78° e o readout mostra o valor.',
    '',
    '⚠️ ITENS DO BRIEF QUE CONTINUAM ABERTOS — este espécime existe para que eles possam ser julgados:',
    '#3 CAMPO TURBULENTO: o campo magnético é liso demais. O real é sujo, e a gaiola de alças que foi escrita e DELETADA não é o caminho — ela desenhava o diagrama didático, e referência não é fenômeno.',
    '#4 FEIXES COMO VOLUME: hoje são geometria. ⚠️ Antes de empilhar fatias, conte `fatias × amostras` por fragmento — foi assim que a espessura do disco do buraco negro matou a aba na primeira tentativa, e a lição é que volume NÃO é mais cópias do mesmo detalhe: o que dá espessura a olho é a LUZ fora do eixo.',
    '#5 VENTO DIFUSO NO LUGAR DA AGULHA: o jato atual está calibrado para QUASAR, e o usuário apontou. Um pulsar não tem jato colimado de AGN — tem vento relativístico difuso e uma nebulosa de vento (a Nebulosa do Caranguejo é a referência, não Cygnus A). É o único destes cinco que é DEFEITO reportado, não desejo.',
    '#9 HALO EM QUATRO CAMADAS no shader.',
    '#10 LENTE GRAVITACIONAL: ⚠️ existe `lensing.js` no repo, e o buraco negro está TRAVADO. Olhe antes de escrever, e não toque no integrador.',
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

        pulsar.tune({ filamento: values.filamento });
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
          filamento: values.filamento === 0 ? 'desligado (como a cena)' : values.filamento.toFixed(2),
        });
      },
      dispose: () => pulsar.dispose(),
    };
  },
};
