// BASELINE DE DESEMPENHO — cole no console da aba da cena, com a JANELA EM PRIMEIRO PLANO.
// Leva ~35s. Não mexa no mouse nem troque de aba enquanto roda.
(async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const canvas = document.querySelector('canvas');
  const bus = await import('/src/core/bus.js');

  // FPS por contagem de rAF: a cena desenha no mesmo vsync, então quadro perdido por ela é
  // quadro perdido aqui. Teto = taxa do monitor — se der 120 num monitor de 120Hz, a cena
  // não é o gargalo NESTA pose, e o número que informa é o custo em ms, abaixo.
  const fps = async (segundos = 5) => {
    let n = 0,
      parar = false;
    const tick = () => {
      n += 1;
      if (!parar) requestAnimationFrame(tick);
    };
    const t0 = performance.now();
    requestAnimationFrame(tick);
    await espera(segundos * 1000);
    parar = true;
    return +(n / ((performance.now() - t0) / 1000)).toFixed(1);
  };

  const roda = (voltas, direcao) => {
    for (let i = 0; i < voltas; i++) {
      canvas.dispatchEvent(
        new WheelEvent('wheel', { deltaY: direcao * 100, bubbles: true, cancelable: true })
      );
    }
  };

  const pose = async (nome, voltas, direcao) => {
    bus.emit({ t: 'ui.focus-node', source: null });
    await espera(1000);
    roda(voltas, direcao);
    await espera(6000); // deixa o voo terminar ANTES de medir
    const quadros = await fps(5);
    const custo = await window.espatial.renderCost(30);
    return { pose: nome, fps: quadros, ...custo };
  };

  const gl = canvas.getContext('webgl2');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const ambiente = {
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'indisponível',
    navegador:
      navigator.userAgent.match(/(Chrome|Firefox|Safari)\/[\d.]+/g)?.join(' ') ?? navigator.userAgent,
    dpr: devicePixelRatio,
    buffer: [canvas.width, canvas.height],
    css: [canvas.clientWidth, canvas.clientHeight],
    // Se qualquer um destes não for o esperado, a medida não vale: aba oculta é estrangulada
    // no motor, e janela sem foco pode ser ocluída por outra.
    oculta: document.hidden,
    comFoco: document.hasFocus(),
    telaCheia: Boolean(document.fullscreenElement),
  };

  const longe = await pose('LONGE (céu, orçamento mínimo)', 40, +1);
  const perto = await pose('PERTO (sombra enchendo o quadro)', 60, -1);

  const saida = { quando: new Date().toISOString(), ambiente, medidas: [longe, perto] };
  console.log(JSON.stringify(saida, null, 2));
  copy?.(JSON.stringify(saida)); // vai para a área de transferência no Chrome
  return saida;
})();
