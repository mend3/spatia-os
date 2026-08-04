/**
 * Motor de áudio procedural — nunca silêncio, e nenhum arquivo de áudio.
 *
 * Tudo é síntese em WebAudio: sem asset, sem download, sem licença. As sete camadas do
 * briefing viram osciladores e ruído filtrado:
 *
 *   hum grave · drone harmônico · ruído de rádio · sub-bass · cliques metálicos · reverb
 *
 * O reverb é uma resposta ao impulso **gerada em runtime** (ruído com decaimento
 * exponencial) em vez de um .wav de sala: bastam ~2s de buffer para dar a cauda de espaço
 * grande, e o arquivo que não existe não precisa ser versionado.
 *
 * A regra que mantém isso agradável por horas: nada de mudança de volume em degrau. Todo
 * parâmetro anda por `setTargetAtTime`, que é uma aproximação exponencial — o ouvido lê como
 * o ambiente respondendo, não como um mixer sendo mexido.
 *
 * Política de autoplay: o contexto só existe depois de um gesto do usuário. Por isso o boot
 * tem uma tela de engate — ela não é enfeite, é o que autoriza o áudio.
 */

// Regimes cognitivos → timbre. Os mesmos estados do buraco negro, para que som e imagem
// contem a mesma coisa: o sistema tem um estado, não dois.
const REGIMES = {
  boot: { cutoff: 220, drone: 0.05, sub: 0.02, noise: 0.004, detune: 0, shimmer: 0 },
  idle: { cutoff: 420, drone: 0.1, sub: 0.05, noise: 0.008, detune: 0, shimmer: 0.02 },
  thinking: { cutoff: 900, drone: 0.14, sub: 0.13, noise: 0.02, detune: 8, shimmer: 0.05 },
  retrieving: { cutoff: 1500, drone: 0.12, sub: 0.08, noise: 0.03, detune: 4, shimmer: 0.08 },
  searching: { cutoff: 2100, drone: 0.11, sub: 0.07, noise: 0.055, detune: 14, shimmer: 0.06 },
  answering: { cutoff: 2600, drone: 0.16, sub: 0.06, noise: 0.012, detune: -6, shimmer: 0.12 },
  error: { cutoff: 380, drone: 0.08, sub: 0.16, noise: 0.09, detune: 42, shimmer: 0 },
};

const ROOT_HZ = 55; // A1: fundamental grave o bastante para virar sensação, não nota
const GLIDE = 0.6;
const REVERB_SECONDS = 2.4;

export function createAudio() {
  let ctx = null;
  let master = null;
  let bus = null;
  let layers = null;
  let enabled = false;
  let regime = REGIMES.boot;

  function impulseResponse(context) {
    const length = Math.floor(context.sampleRate * REVERB_SECONDS);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        // Decaimento exponencial sobre ruído: cauda longa e difusa, sem coloração de sala.
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8);
      }
    }
    return buffer;
  }

  function noiseBuffer(context, seconds = 2) {
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function oscillator(type, frequency, gainValue, destination) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = gainValue;
    osc.connect(gain).connect(destination);
    osc.start();
    return { osc, gain };
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulseResponse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    reverb.connect(wet).connect(master);

    // Barramento: tudo passa por um lowpass único, e é ele que "abre" quando o sistema
    // pensa. Um filtro global economiza CPU e dá coerência — a cena inteira clareia junto.
    bus = ctx.createBiquadFilter();
    bus.type = 'lowpass';
    bus.frequency.value = REGIMES.boot.cutoff;
    bus.Q.value = 0.9;
    bus.connect(master);
    bus.connect(reverb);

    // Hum profundo: duas senóides levemente desafinadas produzem batimento lento.
    const humA = oscillator('sine', ROOT_HZ, 0.5, bus);
    const humB = oscillator('sine', ROOT_HZ * 1.006, 0.5, bus);

    // Drone: fundamental + quinta + oitava, em dente-de-serra filtrado.
    const droneGain = ctx.createGain();
    droneGain.gain.value = REGIMES.boot.drone;
    droneGain.connect(bus);
    const drone = [1, 1.5, 2, 3.01].map((ratio) =>
      oscillator('sawtooth', ROOT_HZ * ratio, 0.14 / ratio, droneGain)
    );

    // Sub-bass: o grave que aparece quando o núcleo trabalha.
    const sub = oscillator('sine', ROOT_HZ / 2, REGIMES.boot.sub, bus);

    // Ruído de rádio: branco passando por bandpass que varre devagar.
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer(ctx);
    noiseSource.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1200;
    noiseFilter.Q.value = 1.4;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = REGIMES.boot.noise;
    noiseSource.connect(noiseFilter).connect(noiseGain).connect(bus);
    noiseSource.start();

    // LFO na varredura do bandpass: é o que dá a impressão de transmissão distante.
    const sweep = ctx.createOscillator();
    const sweepDepth = ctx.createGain();
    sweep.frequency.value = 0.07;
    sweepDepth.gain.value = 700;
    sweep.connect(sweepDepth).connect(noiseFilter.frequency);
    sweep.start();

    // Camada de brilho: senóide alta que só aparece quando há atividade.
    const shimmer = oscillator('sine', ROOT_HZ * 12, 0, bus);

    layers = { humA, humB, droneGain, drone, sub, noiseGain, shimmer, noiseFilter };
  }

  function ramp(param, value, seconds = GLIDE) {
    param.setTargetAtTime(value, ctx.currentTime, seconds / 3);
  }

  function apply() {
    if (!enabled) return;
    ramp(bus.frequency, regime.cutoff);
    ramp(layers.droneGain.gain, regime.drone);
    ramp(layers.sub.gain.gain, regime.sub);
    ramp(layers.noiseGain.gain, regime.noise);
    ramp(layers.shimmer.gain.gain, regime.shimmer);
    for (const [i, voice] of layers.drone.entries()) {
      ramp(voice.osc.detune, regime.detune * (i + 1) * 0.5, 1.2);
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
        // Fade-in longo: o ambiente aparece, não liga.
        master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.4);
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

    /** Clique metálico: ruído curto por bandpass de Q alto. Um por evento discreto. */
    click({ frequency = 2400, gain = 0.06, decay = 0.09 } = {}) {
      if (!enabled) return;
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx, 0.12);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = frequency;
      filter.Q.value = 14;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(gain, ctx.currentTime);
      envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);
      source.connect(filter).connect(envelope).connect(bus);
      source.start();
      source.stop(ctx.currentTime + decay + 0.02);
    },

    /** Varredura ascendente — a "frequência que sobe" quando o sistema responde. */
    sweepUp({ from = 300, to = 1800, seconds = 0.5, gain = 0.08 } = {}) {
      if (!enabled) return;
      const osc = ctx.createOscillator();
      const envelope = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(from, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + seconds);
      envelope.gain.setValueAtTime(0.0001, ctx.currentTime);
      envelope.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + seconds * 0.3);
      envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
      osc.connect(envelope).connect(bus);
      osc.start();
      osc.stop(ctx.currentTime + seconds + 0.05);
    },

    /** Interferência de erro: grave dissonante e ruído aberto por um instante. */
    glitch() {
      if (!enabled) return;
      this.click({ frequency: 180, gain: 0.14, decay: 0.4 });
      const previous = regime;
      regime = REGIMES.error;
      apply();
      setTimeout(() => {
        regime = previous;
        apply();
      }, 700);
    },

    /** Volume mestre, para o modo cinematográfico e para o mudo. */
    setVolume(value) {
      if (enabled) master.gain.setTargetAtTime(value, ctx.currentTime, 0.4);
    },
  };
}
