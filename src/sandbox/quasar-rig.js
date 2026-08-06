/**
 * QUASAR na bancada — o espécime existe porque este objeto é caro de alcançar na cena.
 *
 * Na cena ele só aparece se: o corpus tiver um hub com massa de bojo acima do limiar, o servidor
 * estiver de pé, o índice montado, e a câmera travada nesse hub — quatro condições para revisar um
 * efeito que tem uma variável interessante. Aqui a galáxia é FALSA e a inclinação é um slider.
 *
 * ⚠️ O módulo importado é o da CENA (`space/quasar.js`). Nada aqui reimplementa shader ou
 * geometria: uma bancada que copia o objeto passa a mentir na primeira divergência, e a primeira
 * divergência é exatamente quando ela seria útil.
 */
import * as THREE from 'three';
import { createQuasars, quasarParams, bulgeMassOf, QUASAR_BULGE_FLOOR } from '../space/quasar.js';
import { diskPx, LOD_ARM_PX, LOD_FULL_PX } from '../space/galaxy.js';

/** A galáxia hospedeira mínima — só os campos que `quasarParams` lê. */
function hubFalso(values) {
  return {
    path: `bancada/quasar/${values.seed.toFixed(3)}`,
    mass: values.bojo / Math.max(values.conc, 0.01),
    concentration: values.conc,
    base: new THREE.Color(0.92, 0.68, 0.42),
  };
}

export const QUASAR_SPEC = {
  id: 'quasar',
  name: 'QUASAR',
  /*
   * 10, e o número sai de uma conta, não do olho: enquadramento e nível de detalhe são o MESMO
   * botão aqui, porque os dois dependem só de `raio/distância`.
   *
   * A 26 (a primeira tentativa) o disco abria com 72 px de escada — `smoothstep(72; 26, 200)` dá
   * 0,19, ou seja, o espécime nascia quase apagado e quem revisasse concluiria que o objeto está
   * fraco quando o que estava fraco era a bancada. A 10 ele abre em ~190 px, perto do topo da
   * escada, e o jato passa ~25% além da meia-altura. Sair do quadro é o comportamento certo dele
   * — o módulo declara que a agulha PODE sair; quem tem de caber é o núcleo com o toro.
   */
  distance: 10,
  controls: [
    /*
     * A INCLINAÇÃO é o controle principal desta bancada, e ele move CINCO coisas de uma vez.
     *
     * 1 é de frente (disco circular, jato curto e para você), 0 é de perfil (disco vira risco, jato
     * atravessa a tela, o toro esconde o núcleo). Revisar o quasar é varrer isto e ver as cinco se
     * moverem juntas — se uma ficar parada, ela deixou de sair do `cosView` e virou constante.
     */
    /*
     * ⚠️ Abre em 0,80 e NÃO no meio da faixa: `TORUS_COS` é 0,574 com rampa de ±0,16, então
     * qualquer valor abaixo de 0,73 esconde o núcleo atrás do toro — que é o modelo de unificação
     * funcionando, e era o que fazia a bancada abrir com a tela vazia e `núcleo visível 0,00`.
     * O espécime tem de abrir MOSTRANDO o objeto; esconder é o que o slider serve para provar.
     */
    { key: 'view', label: 'INCLINAÇÃO (cosView)', type: 'range', min: 0, max: 1, step: 0.01, value: 0.8 },
    // O tamanho na tela varre a escada de LOD inteira num gesto só, como no espécime da galáxia.
    { key: 'radius', label: 'RAIO DA ÂNCORA', type: 'range', min: 0.05, max: 2.5, step: 0.01, value: 1 },
    /*
     * O bojo decide se ele acende. Abaixo do limiar `quasarParams` devolve `null` e a bancada tem
     * de ficar VAZIA — é o caso negativo, e ele importa tanto quanto o positivo: um espécime que
     * desenha sempre não prova que o portão existe.
     */
    { key: 'bojo', label: 'MASSA DE BOJO', type: 'range', min: 0, max: 300, step: 1, value: 120 },
    { key: 'conc', label: 'CONCENTRAÇÃO', type: 'range', min: 0.05, max: 0.95, step: 0.01, value: 0.5 },
    // O portão de animação, que na cena vem do perfil de qualidade. 0 congela sem apagar nada.
    { key: 'flow', label: 'FLUXO (perfil) ×', type: 'range', min: 0, max: 2, step: 0.01, value: 1 },
    { key: 'gain', label: 'GANHO ×', type: 'range', min: 0, max: 3, step: 0.01, value: 1 },
    { key: 'seed', label: 'SEMENTE (caminho)', type: 'range', min: 0, max: 1, step: 0.001, value: 0.42 },
  ],
  watch: [
    'AS BANDAS DO DISCO CISALHAM: com INCLINAÇÃO ~0,7 e FLUXO 1, o interior tem de girar visivelmente mais rápido que a borda. Se o padrão inteiro gira como um bloco, a lei de Kepler (omega ∝ r^-1.5) saiu da fase e virou rotação rígida — e um disco rígido é um anel pintado.',
    'NENHUMA COSTURA RADIAL. Gire e varra a SEMENTE olhando para o eixo maior: uma cicatriz reta saindo do centro significa que o ruído das bandas voltou a ser amostrado no ângulo cru (`atan` salta de +pi para -pi) em vez de num círculo.',
    'O BEAMING É ASSIMÉTRICO E COLORIDO: com INCLINAÇÃO baixa (de perfil), um lado do disco tem de ficar mais claro E MAIS AZUL que o outro. Só mais claro significa que o Doppler entrou no brilho e não na temperatura — é assim que luz refletida se comporta, não gás em órbita.',
    'INCLINAÇÃO = 1 (de frente) MATA a assimetria. A velocidade fica transversal à linha de visada, então o beaming tem de sumir por completo. Assimetria sobrando de frente é o fator ancorado numa direção de tela em vez de na geometria.',
    'O TORO NÃO ACHATA COM O DISCO. Leve a INCLINAÇÃO a 0: o disco vira um risco e o toro TEM de continuar uma faixa grossa. Os dois virando linha juntos significa que o piso de razão de aspecto (h/r ~ 0,5) sumiu — e sem espessura o toro não tem como esconder o núcleo, que é a razão de ele existir.',
    'BORDA NENHUMA, EM CANTO NENHUM. Nem faixa reta (a caixa do jato cortando o lóbulo), nem círculo (a caixa do núcleo cortando o toro). Este arquivo já pagou as duas: cada corte usa a cauda da PRÓPRIA gaussiana que ele corta, e a caixa segue a feição mais externa.',
    'MASSA DE BOJO abaixo de 50: a bancada fica VAZIA e o relatório diz `apagado`. O portão não é decoração — 35 dos 213 hubs do corpus real dependem dele.',
    'FLUXO = 0 CONGELA SEM APAGAR: os nós do jato e as faixas do toro continuam desenhados, só param de andar. Se alguma feição SOME ao congelar, ela estava sendo gerada pelo relógio em vez de ser atravessada por ele — e o perfil mínimo passaria a esconder informação em vez de só economizar.',
    'RAIO DA ÂNCORA no menor valor: o núcleo continua um borrão liso, sem cintilar. É o piso de pixel, e é ele que impede o quasar de serrilhar quando a galáxia é um ponto no céu.',
  ],
  build(ctx) {
    const group = new THREE.Group();
    const quasars = createQuasars(1);
    group.add(quasars.object);

    return {
      object: group,
      update(values, camera, clock) {
        const hub = hubFalso(values);
        const params = quasarParams(hub, values.view);
        quasars.tune({ gain: values.gain, flow: values.flow });

        if (!params) {
          quasars.update([], camera, 1, clock.elapsed, diskPx, { far: LOD_ARM_PX, near: LOD_FULL_PX });
          ctx.report({
            estado: 'apagado',
            'massa de bojo': `${bulgeMassOf(hub).toFixed(0)} < ${QUASAR_BULGE_FLOOR}`,
          });
          return;
        }

        /*
         * ⚠️ Altura de FRAMEBUFFER, não CSS.
         *
         * A escada de LOD do módulo é escrita em pixel de framebuffer, e é isso que a cena passa
         * (`canvas.height`). Passar `innerHeight` cru dividiria por dois todo número que o shader
         * vê em tela retina — a armadilha que já escondeu um DPR inteiro da bancada do anel.
         */
        const alturaFb = window.innerHeight * (window.devicePixelRatio || 1);
        const entrada = { params, position: new THREE.Vector3(0, 0, 0), radius: values.radius };
        const acesos = quasars.update(
          [entrada], camera, alturaFb, clock.elapsed, diskPx, { far: LOD_ARM_PX, near: LOD_FULL_PX }
        );

        const px = diskPx(values.radius, camera.position.length(), alturaFb, camera.fov);
        ctx.report({
          estado: acesos ? 'aceso' : 'abaixo do piso de LOD',
          'massa de bojo': bulgeMassOf(hub).toFixed(0),
          'cosView': values.view.toFixed(2),
          'inclinação': `${((Math.acos(Math.min(values.view, 1)) * 180) / Math.PI).toFixed(0)}°`,
          'disco na tela': `${px.toFixed(0)} px`,
          // O que o toro faz com a inclinação — o número que a linha nova governa.
          'achatamento do disco': Math.max(values.view, 0.07).toFixed(2),
          'achatamento do toro': Math.max(Math.max(values.view, 0.07), 0.5).toFixed(2),
          'jato (raios)': params.jet.toFixed(2),
          'núcleo visível': params.nucleus.toFixed(2),
        });
      },
      dispose: () => quasars.dispose(),
    };
  },
};
