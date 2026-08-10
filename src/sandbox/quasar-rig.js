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
    /*
     * ⚠️ A ACREÇÃO É O SEGUNDO PORTÃO, e a falta dela aqui APAGOU o espécime.
     *
     * Quando `isActive` passou a exigir gás caindo agora, este hub falso continuou só com massa —
     * e `quasarParams` passou a devolver `null` para qualquer ajuste dos sliders. A bancada ficou
     * vazia e a causa não estava em lugar nenhum da tela.
     *
     * É a lição do espécime que falta, outra vez: fato novo no portão precisa de controle novo na
     * bancada NO MESMO passo, senão o caminho onde a decisão mora deixa de ser desenhável.
     */
    accretion: values.acrecao,
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
     * ⚠️ Este slider MUDOU DE SIGNIFICADO quando o eixo virou de mundo, e a mudança é a lição.
     *
     * Antes ele era `cosView` — a inclinação aparente. Com eixo de mundo isso deixou de ser um
     * parâmetro do objeto e virou uma RELAÇÃO: `cosView` é o ângulo entre o eixo e a câmera, e
     * quem o move é a órbita. O que a bancada ainda escolhe é para onde o eixo APONTA no mundo
     * (1 = eixo alinhado com o polo, 0,5 = deitado no plano, 0 = polo oposto).
     *
     * ⚠️ **A INSPEÇÃO AGORA É GIRAR A CÂMERA.** É esse o ganho da troca: as cinco feições
     * (achatamento, comprimento do jato, beaming, o toro cobrir o núcleo, a espessura dele) passam
     * a responder ao arrasto do mouse, juntas. Uma que fique parada ao orbitar deixou de sair do
     * `cosView`.
     */
    /*
     * ⚠️ Abre em 0,80 e NÃO no meio da faixa: `TORUS_COS` é 0,574 com rampa de ±0,16, então
     * qualquer valor abaixo de 0,73 esconde o núcleo atrás do toro — que é o modelo de unificação
     * funcionando, e era o que fazia a bancada abrir com a tela vazia e `núcleo visível 0,00`.
     * O espécime tem de abrir MOSTRANDO o objeto; esconder é o que o slider serve para provar.
     */
    { key: 'view', label: 'EIXO · APONTA PARA', type: 'range', min: 0, max: 1, step: 0.01, value: 0.5 },
    // O tamanho na tela varre a escada de LOD inteira num gesto só, como no espécime da galáxia.
    { key: 'radius', label: 'RAIO DA ÂNCORA', type: 'range', min: 0.05, max: 2.5, step: 0.01, value: 1 },
    /*
     * O bojo decide se ele acende. Abaixo do limiar `quasarParams` devolve `null` e a bancada tem
     * de ficar VAZIA — é o caso negativo, e ele importa tanto quanto o positivo: um espécime que
     * desenha sempre não prova que o portão existe.
     */
    { key: 'bojo', label: 'MASSA DE BOJO', type: 'range', min: 0, max: 300, step: 1, value: 120 },
    { key: 'conc', label: 'CONCENTRAÇÃO', type: 'range', min: 0.05, max: 0.95, step: 0.01, value: 0.5 },
    /*
     * ACREÇÃO — commits nos filhos na janela de churn. É o segundo portão e o mais importante:
     * bojo diz que o buraco negro EXISTE, acreção diz que há gás caindo AGORA. Em 0 o quasar
     * APAGA por mais massivo que seja, e é o caso que prova que o portão não é decoração —
     * uma galáxia massiva congelada há um ano não é um quasar, é um buraco negro quieto.
     */
    { key: 'acrecao', label: 'ACREÇÃO (commits)', type: 'range', min: 0, max: 40, step: 1, value: 8 },
    // O portão de animação, que na cena vem do perfil de qualidade. 0 congela sem apagar nada.
    { key: 'flow', label: 'FLUXO (perfil) ×', type: 'range', min: 0, max: 2, step: 0.01, value: 1 },
    { key: 'gain', label: 'GANHO ×', type: 'range', min: 0, max: 3, step: 0.01, value: 1 },
    { key: 'seed', label: 'SEMENTE (caminho)', type: 'range', min: 0, max: 1, step: 0.001, value: 0.42 },
  ],
  watch: [
    'AS BANDAS CISALHAM: com INCLINAÇÃO ~0,7 e FLUXO 1 o interior gira mais rápido que a borda',
    'nenhuma COSTURA radial: varra a SEMENTE olhando ao longo do eixo maior',
    'de perfil um lado do disco fica mais claro E mais azul — beaming é cor, não só brilho',
    'gire e as cinco feições andam JUNTAS: disco, jato, beaming, toro e núcleo',
    'eixo apontando para você: o jato fica CURTO e MUITO brilhante ao mesmo tempo',
    'INCLINAÇÃO a 0: o disco vira um risco e o toro CONTINUA com espessura',
    'MASSA DE BOJO abaixo de 50, ou ACREÇÃO a 0: apaga, e o relatório diz qual portão fechou',
    'FLUXO a 0 congela sem apagar: nós do jato e faixas do toro continuam desenhados',
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
            // Diz QUAL dos dois portões barrou. Sem isto, "apagado" com massa alta é um mistério.
            'massa de bojo': `${bulgeMassOf(hub).toFixed(0)} ${bulgeMassOf(hub) < QUASAR_BULGE_FLOOR ? `< ${QUASAR_BULGE_FLOOR} ✗` : '✓'}`,
            acreção: `${values.acrecao} ${values.acrecao > 0 ? '✓' : '= 0 ✗ (buraco negro quieto)'}`,
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
        const acesos = quasars.update([entrada], camera, alturaFb, clock.elapsed, diskPx, {
          far: LOD_ARM_PX,
          near: LOD_FULL_PX,
        });

        const px = diskPx(values.radius, camera.position.length(), alturaFb, camera.fov);
        ctx.report({
          estado: acesos ? 'aceso' : 'abaixo do piso de LOD',
          'massa de bojo': bulgeMassOf(hub).toFixed(0),
          acreção: `${values.acrecao} commits`,
          cosView: values.view.toFixed(2),
          inclinação: `${((Math.acos(Math.min(values.view, 1)) * 180) / Math.PI).toFixed(0)}°`,
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
