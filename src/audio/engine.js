/**
 * Motor de áudio procedural — ambiente para ouvir por horas, não para impressionar por dez
 * segundos. Sem nenhum arquivo de áudio: tudo é síntese em WebAudio.
 *
 * A versão anterior era áspera, e por razões identificáveis — vale registrar porque cada uma é
 * uma tentação recorrente:
 *
 * 1. **Dente-de-serra no drone.** Tem harmônicos pares E ímpares em amplitude 1/n: é o timbre
 *    de zumbido. Aqui é triângulo, cujos harmônicos são só ímpares e caem com 1/n² — a mesma
 *    sensação de "corpo" com uma fração da aspereza.
 * 2. **Intervalo em 3.01.** Um doze avos ligeiramente desafinado produz batimento audível e
 *    constante, e batimento constante é fadiga. Os intervalos agora são de entonação justa
 *    (1, 3/2, 2, 5/2, 3), que batem zero por construção.
 * 3. **Ruído branco em bandpass com Q 1.4, varrendo.** Isso é chiado que se move — o ouvido
 *    persegue. Virou ruído rosa (energia igual por oitava, como chuva ou vento) em lowpass
 *    fixo e baixo: lê como ar da sala, não como estática de rádio.
 *
 * Mais três decisões que fazem a diferença entre "ambiente" e "zumbido de fundo":
 *
 * - **Q 0.5 no filtro global.** Q ≥ 1 cria um pico ressonante na frequência de corte, e o corte
 *   se move com o estado — então o pico varria o espectro. Q 0.5 é queda suave, sem pico.
 * - **High-shelf cortando agudos.** Nada acima de 3kHz precisa existir aqui, e é justamente
 *   essa faixa que cansa.
 * - **Tremolo lento por voz, em taxas incomensuráveis** (0,037 / 0,053 / 0,071 Hz). O padrão
 *   nunca se repete de forma reconhecível, então o ouvido para de prestar atenção — que é
 *   exatamente o objetivo de um som ambiente.
 *
 * Política de autoplay: o contexto só existe depois de um gesto do usuário. Por isso o boot tem
 * uma tela de engate — ela não é enfeite, é o que autoriza o áudio.
 */

// Regimes cognitivos → timbre. Amplitudes e cortes ficam numa faixa estreita de propósito: o
// sistema muda de humor sem nunca ficar estridente, e a diferença é sentida, não anunciada.
const REGIMES = {
  boot: { cutoff: 380, drone: 0.06, sub: 0.03, air: 0.004, warmth: 1, shimmer: 0 },
  idle: { cutoff: 620, drone: 0.115, sub: 0.055, air: 0.007, warmth: 1, shimmer: 0.006 },
  thinking: { cutoff: 1150, drone: 0.135, sub: 0.1, air: 0.012, warmth: 0.9, shimmer: 0.016 },
  retrieving: { cutoff: 1400, drone: 0.125, sub: 0.075, air: 0.014, warmth: 0.92, shimmer: 0.022 },
  searching: { cutoff: 1300, drone: 0.12, sub: 0.07, air: 0.018, warmth: 0.95, shimmer: 0.014 },
  answering: { cutoff: 1750, drone: 0.15, sub: 0.06, air: 0.009, warmth: 0.88, shimmer: 0.03 },
  error: { cutoff: 340, drone: 0.09, sub: 0.13, air: 0.03, warmth: 1.15, shimmer: 0 },
};

// A1. Grave o bastante para virar sensação em vez de nota reconhecível.
const ROOT_HZ = 55;

/*
 * Entonação JUSTA, não temperamento igual.
 *
 * Razões de inteiros pequenos alinham os harmônicos das vozes: elas somam em vez de bater. O
 * quinto temperado (1.4983) contra o justo (1.5) já produz batimento perceptível quando as
 * notas sustentam por minutos — e aqui elas sustentam para sempre.
 */
const VOICES = [
  { ratio: 1, gain: 0.5, lfo: 0.037 },
  { ratio: 3 / 2, gain: 0.3, lfo: 0.053 },
  { ratio: 2, gain: 0.22, lfo: 0.071 },
  { ratio: 5 / 2, gain: 0.12, lfo: 0.041 },
  { ratio: 3, gain: 0.08, lfo: 0.059 },
];

// Glide longo: o ambiente responde ao estado sem que a mudança soe como um corte.
const GLIDE = 2.2;
const REVERB_SECONDS = 4.2;
const MASTER_GAIN = 0.42;

export function createAudio() {
  let ctx = null;
  let master = null;
  let bus = null;
  let layers = null;
  let enabled = false;
  let regime = REGIMES.boot;
  let volume = MASTER_GAIN;
  // Escalas do painel de afinação, aplicadas sobre o regime — nunca substituindo-o.
  const tune = { ambient: 1, brightness: 1 };

  /**
   * Resposta ao impulso do reverb, gerada em runtime.
   *
   * Ruído com decaimento exponencial e um pequeno pré-delay. O pré-delay é o que dá a impressão
   * de sala grande: sem ele o reverb cola na fonte e soa como abafamento, não como espaço.
   */
  function impulseResponse(context) {
    const length = Math.floor(context.sampleRate * REVERB_SECONDS);
    const preDelay = Math.floor(context.sampleRate * 0.045);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      // Passa-baixa de um polo dentro da própria IR: cauda que escurece com o tempo, como
      // acontece numa sala real. Cauda brilhante soa metálica.
      let smooth = 0;
      for (let i = preDelay; i < length; i++) {
        const t = (i - preDelay) / (length - preDelay);
        const noise = Math.random() * 2 - 1;
        smooth += (noise - smooth) * 0.22;
        data[i] = smooth * Math.pow(1 - t, 2.6);
      }
    }
    return buffer;
  }

  /**
   * Ruído ROSA, não branco.
   *
   * Branco tem energia igual por Hz, então metade dela vive na última oitava — é isso que soa
   * como chiado. Rosa tem energia igual por oitava, que é como o ouvido divide o espectro, e é
   * a cor de chuva e vento. O filtro é a aproximação de Paul Kellet: barata e boa o bastante.
   */
  function pinkNoise(context, seconds = 6) {
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0;

    // High-shelf cortando agudos ANTES da saída: nada acima de 3kHz tem função aqui, e é
    // exatamente essa faixa que cansa em escuta longa.
    const tame = ctx.createBiquadFilter();
    tame.type = 'highshelf';
    tame.frequency.value = 2800;
    tame.gain.value = -9;
    master.connect(tame).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulseResponse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    reverb.connect(wet).connect(master);

    /*
     * Filtro global. Q 0.5, não 0.9.
     *
     * Q ≥ 1 cria pico ressonante NA frequência de corte — e o corte se move com o estado
     * cognitivo, então o pico varria o espectro a cada mudança de regime. Era audível como um
     * "uau" sintético. Q 0.5 é queda suave sem pico nenhum.
     */
    bus = ctx.createBiquadFilter();
    bus.type = 'lowpass';
    bus.frequency.value = REGIMES.boot.cutoff;
    bus.Q.value = 0.5;
    bus.connect(master);
    bus.connect(reverb);

    // ---- drone: triângulo em entonação justa, cada voz com tremolo próprio ----
    const droneGain = ctx.createGain();
    droneGain.gain.value = REGIMES.boot.drone;
    droneGain.connect(bus);

    const voices = VOICES.map(({ ratio, gain, lfo }) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = ROOT_HZ * ratio;

      const level = ctx.createGain();
      level.gain.value = gain;

      // Tremolo: modula a AMPLITUDE, não a afinação. Modular afinação reintroduziria o
      // batimento que a entonação justa existe para eliminar.
      const trem = ctx.createOscillator();
      const tremDepth = ctx.createGain();
      trem.frequency.value = lfo;
      tremDepth.gain.value = gain * 0.35;
      trem.connect(tremDepth).connect(level.gain);
      trem.start();

      osc.connect(level).connect(droneGain);
      osc.start();
      return { osc, level, base: gain };
    });

    // ---- sub: senóide pura, uma oitava abaixo da fundamental ----
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = ROOT_HZ / 2;
    subGain.gain.value = REGIMES.boot.sub;
    sub.connect(subGain).connect(bus);
    sub.start();

    // ---- ar: ruído rosa em lowpass FIXO e baixo. Sem varredura. ----
    const airSource = ctx.createBufferSource();
    airSource.buffer = pinkNoise(ctx);
    airSource.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'lowpass';
    airFilter.frequency.value = 520;
    airFilter.Q.value = 0.4;
    const airGain = ctx.createGain();
    airGain.gain.value = REGIMES.boot.air;
    airSource.connect(airFilter).connect(airGain).connect(bus);
    airSource.start();

    /*
     * Brilho: uma quinta DUAS oitavas acima, em triângulo — não uma senóide alta solta.
     *
     * A versão anterior punha uma senóide em 660Hz, que é a região onde o ouvido é mais
     * sensível: sozinha ela fura a mistura. Como intervalo consonante do próprio acorde, ela
     * some dentro do timbre e só se percebe como "abriu".
     */
    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    shimmer.type = 'triangle';
    shimmer.frequency.value = ROOT_HZ * 6;
    shimmerGain.gain.value = 0;
    shimmer.connect(shimmerGain).connect(bus);
    shimmer.start();

    layers = { voices, droneGain, subGain, airGain, shimmerGain };
  }

  function ramp(param, value, seconds = GLIDE) {
    // `setTargetAtTime` é aproximação exponencial: nunca produz o degrau que um `setValueAtTime`
    // produziria, e é o que faz a mudança de regime ser sentida em vez de ouvida.
    param.setTargetAtTime(value, ctx.currentTime, seconds / 3);
  }

  function apply() {
    if (!enabled) return;
    ramp(bus.frequency, regime.cutoff * tune.brightness);
    ramp(layers.droneGain.gain, regime.drone);
    ramp(layers.subGain.gain, regime.sub);
    ramp(layers.airGain.gain, regime.air * tune.ambient);
    ramp(layers.shimmerGain.gain, regime.shimmer);

    // `warmth` desafina as vozes altas para BAIXO alguns cents. Nada perceptível como
    // afinação; percebe-se como o acorde ficando mais "fechado" ou mais "aberto".
    for (const [index, voice] of layers.voices.entries()) {
      ramp(voice.osc.detune, (1 - regime.warmth) * -14 * index, 3.5);
    }
  }

  return {
    isEnabled: () => enabled,

    /** Só pode ser chamado dentro de um gesto do usuário — é a exigência do browser. */
    async enable() {
      if (enabled) return true;
      try {
        if (!ctx) build();
        await ctx.resume();
        enabled = true;
        // Fade-in de 4s: o ambiente aparece, não liga.
        master.gain.setTargetAtTime(volume, ctx.currentTime, 1.4);
        apply();
        return true;
      } catch (error) {
        console.warn('[audio] não foi possível iniciar', error);
        return false;
      }
    },

    setRegime(state) {
      regime = REGIMES[state] || REGIMES.idle;
      apply();
    },

    /**
     * Toque discreto para evento pontual.
     *
     * Era ruído em bandpass com Q 14 — um tick metálico. Agora é uma senóide com envelope de
     * ataque suave e cauda longa: lê como madeira ou marimba, e não corta a conversa.
     */
    click({ frequency = 660, gain = 0.05, decay = 0.5 } = {}) {
      if (!enabled) return;
      const osc = ctx.createOscillator();
      const envelope = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      // Ataque de 12ms em vez de instantâneo: o clique de um envelope abrupto é o próprio
      // estalo, independente do timbre que vem depois.
      envelope.gain.setValueAtTime(0.0001, ctx.currentTime);
      envelope.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);
      osc.connect(envelope).connect(bus);
      osc.start();
      osc.stop(ctx.currentTime + decay + 0.05);
    },

    /**
     * Sino de resposta pronta: fundamental + duas parciais, decaindo em tempos diferentes.
     *
     * Substitui a varredura de frequência de antes. Varredura é um efeito, e efeito chama
     * atenção para si; um sino consonante com o drone informa e desaparece.
     */
    sweepUp({ gain = 0.055 } = {}) {
      if (!enabled) return;
      // Razões harmônicas do próprio acorde: o sino pertence à música que já está tocando.
      const partials = [
        { ratio: 6, decay: 1.6, level: 1 },
        { ratio: 9, decay: 1.1, level: 0.5 },
        { ratio: 12, decay: 0.8, level: 0.25 },
      ];
      for (const { ratio, decay, level } of partials) {
        const osc = ctx.createOscillator();
        const envelope = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = ROOT_HZ * ratio;
        envelope.gain.setValueAtTime(0.0001, ctx.currentTime);
        envelope.gain.exponentialRampToValueAtTime(gain * level, ctx.currentTime + 0.02);
        envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);
        osc.connect(envelope).connect(bus);
        osc.start();
        osc.stop(ctx.currentTime + decay + 0.05);
      }
    },

    /** Erro: o ambiente escurece e engrossa por um instante. Sem estridência. */
    glitch() {
      if (!enabled) return;
      this.click({ frequency: 110, gain: 0.09, decay: 1.1 });
      const previous = regime;
      regime = REGIMES.error;
      apply();
      setTimeout(() => {
        regime = previous;
        apply();
      }, 1400);
    },

    /** Afinação do ambiente: escala o regime, não o troca. */
    tune(values) {
      tune.ambient = values.ambient ?? 1;
      tune.brightness = values.brightness ?? 1;
      apply();
    },

    setVolume(value) {
      volume = value;
      if (enabled) master.gain.setTargetAtTime(value, ctx.currentTime, 0.6);
    },
  };
}
