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
    'AS BANDAS DO DISCO CISALHAM: com INCLINAÇÃO ~0,7 e FLUXO 1, o interior tem de girar visivelmente mais rápido que a borda. Se o padrão inteiro gira como um bloco, a lei de Kepler (omega ∝ r^-1.5) saiu da fase e virou rotação rígida — e um disco rígido é um anel pintado.',
    'NENHUMA COSTURA RADIAL. Gire e varra a SEMENTE olhando para o eixo maior: uma cicatriz reta saindo do centro significa que o ruído das bandas voltou a ser amostrado no ângulo cru (`atan` salta de +pi para -pi) em vez de num círculo.',
    'O BEAMING É ASSIMÉTRICO E COLORIDO: com INCLINAÇÃO baixa (de perfil), um lado do disco tem de ficar mais claro E MAIS AZUL que o outro. Só mais claro significa que o Doppler entrou no brilho e não na temperatura — é assim que luz refletida se comporta, não gás em órbita.',
    'GIRE A CÂMERA e as cinco feições têm de andar JUNTAS: o disco achata, o jato encurta, o beaming troca de lado, o toro cobre e descobre o núcleo, e a espessura dele aparece. Uma que fique parada deixou de sair do `cosView` e virou constante — e antes desta troca NENHUMA se movia, porque o eixo era de tela.',
    'ORBITE ATÉ O EIXO APONTAR PARA VOCÊ: o jato tem de ficar CURTO e MUITO brilhante ao mesmo tempo (é um blazar), não longo e brilhante. O par "estoura e encurta" sai do mesmo cosseno; se ele estourar sem encurtar, o beaming está lendo um ângulo e o comprimento outro.',
    'O TORO NÃO ACHATA COM O DISCO. Leve a INCLINAÇÃO a 0: o disco vira um risco e o toro TEM de continuar uma faixa grossa. Os dois virando linha juntos significa que o piso de razão de aspecto (h/r ~ 0,5) sumiu — e sem espessura o toro não tem como esconder o núcleo, que é a razão de ele existir.',
    'BORDA NENHUMA, EM CANTO NENHUM. Nem faixa reta (a caixa do jato cortando o lóbulo), nem círculo (a caixa do núcleo cortando o toro). Este arquivo já pagou as duas: cada corte usa a cauda da PRÓPRIA gaussiana que ele corta, e a caixa segue a feição mais externa.',
    'MASSA DE BOJO abaixo de 50: a bancada fica VAZIA e o relatório diz `apagado`. O portão não é decoração.',
    '⚠️ ACREÇÃO = 0 com MASSA DE BOJO no máximo: tem de APAGAR do mesmo jeito, e o relatório tem de dizer QUAL portão barrou. É a metade que faltava — o que separa uma galáxia massiva de um quasar não é o buraco negro (toda galáxia massiva tem um), é gás caindo AGORA. Um diretório grande e concentrado congelado há um ano não é um quasar.',
    '⚠️ O NÚCLEO É UM PONTO, não o objeto. `CORE_RADIUS` é 0,016 raios do disco da galáxia, então o toro morre em 0,216 e o disco de acreção em 0,067 — um quinto e um quinze avos da hospedeira. Se o AGN ocupar boa parte do quadro, a escala regrediu: era 0,16 e o toro chegava a 2,16, o DOBRO da galáxia inteira. Os JATOS continuam longos de propósito (5 raios do disco), e é isso que torna o objeto reconhecível.',
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
            // Diz QUAL dos dois portões barrou. Sem isto, "apagado" com massa alta é um mistério.
            'massa de bojo': `${bulgeMassOf(hub).toFixed(0)} ${bulgeMassOf(hub) < QUASAR_BULGE_FLOOR ? `< ${QUASAR_BULGE_FLOOR} ✗` : '✓'}`,
            'acreção': `${values.acrecao} ${values.acrecao > 0 ? '✓' : '= 0 ✗ (buraco negro quieto)'}`,
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
          'acreção': `${values.acrecao} commits`,
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
