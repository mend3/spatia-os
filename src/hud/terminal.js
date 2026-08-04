/**
 * O terminal de comando e a voz.
 *
 * Não é uma caixa de chat: é um prompt `>` que **esvazia ao enviar**. O texto desaparecer é
 * proposital — a resposta do sistema é a cena reagindo, não uma bolha empilhada num
 * histórico. O que aconteceu fica na timeline; o que importa fica no espaço.
 *
 * Entrada de voz: `SpeechRecognition` (segure ESPAÇO). A SAÍDA de voz mora em `hud/voice.js`.
 *
 * A forma de onda tem três fontes, todas medidas — nenhuma estimada:
 *   1. microfone gravando → `AnalyserNode` sobre o stream do mic;
 *   2. sistema falando    → nível que o `voice.js` mede do áudio tocando (`setLevel`);
 *   3. nada acontecendo   → ondulação de repouso, que não finge ser sinal.
 *
 * A versão anterior estimava a onda da fala por eventos de fronteira de palavra, porque
 * `speechSynthesis` não expõe o buffer de áudio. Com o TTS do oracle devolvendo MP3, o áudio
 * passa por um AnalyserNode de verdade e a estimativa saiu.
 */
import { on } from '../core/bus.js';
import * as api from '../core/api.js';

const BARS = 42;
const HOLD_KEY = 'Space';

export function createTerminal(root, { audio }) {
  const input = root.querySelector('[data-prompt]');
  const ghost = root.querySelector('[data-prompt-ghost]');
  const hint = root.querySelector('[data-voice-hint]');
  const canvas = root.querySelector('[data-waveform]');
  const context = canvas.getContext('2d');
  const webToggle = root.querySelector('[data-web-toggle]');

  const levels = new Float32Array(BARS);
  let analyser = null;
  let micData = null;
  let micStream = null;
  let recognition = null;
  // Nível vindo de fora (voz do servidor): quando presente, manda na onda.
  let external = null;
  let webMode = false;

  // ---------------------------------------------------------------- envio

  function submit(text) {
    const question = (text ?? input.value).trim();
    if (!question) return;
    input.value = '';
    ghost.textContent = '';
    audio.click({ frequency: 1600, gain: 0.05 });
    api.ask(question, { web: webMode });
  }

  input.addEventListener('input', () => {
    ghost.textContent = input.value ? '' : 'faça uma pergunta ao núcleo';
    if (input.value) audio.click({ frequency: 3200, gain: 0.014, decay: 0.04 });
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
    // `Esc` NÃO é tratado aqui: a cadeia (inspetor → abortar → limpar) mora no main.js.
    // Dois módulos escutando a mesma tecla e chamando `stopPropagation` é como o inspetor
    // ficou impossível de fechar sem F5.
  });

  webToggle.addEventListener('click', () => {
    webMode = !webMode;
    webToggle.dataset.on = String(webMode);
    webToggle.textContent = webMode ? 'WEB · ON' : 'WEB · AUTO';
  });

  // ---------------------------------------------------------------- microfone

  async function startListening() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      hint.textContent = 'RECONHECIMENTO DE VOZ INDISPONÍVEL NESTE BROWSER';
      return;
    }
    if (recognition) return;

    recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = [...event.results].map((result) => result[0].transcript).join('');
      input.value = transcript;
      if (event.results[event.results.length - 1].isFinal) submit(transcript);
    };
    recognition.onerror = (event) => {
      hint.textContent = `VOZ: ${event.error.toUpperCase()}`;
    };
    recognition.onend = () => {
      recognition = null;
      hint.textContent = 'MANTENHA ESPAÇO PARA FALAR · ESC PARA ABORTAR';
      stopMeter();
    };

    recognition.start();
    hint.textContent = '● OUVINDO';
    await startMeter();
  }

  /** Analyser sobre o microfone: aqui a forma de onda é medição, não estimativa. */
  async function startMeter() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const meterContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = meterContext.createAnalyser();
      analyser.fftSize = 256;
      micData = new Uint8Array(analyser.frequencyBinCount);
      meterContext.createMediaStreamSource(micStream).connect(analyser);
    } catch {
      analyser = null;
    }
  }

  function stopMeter() {
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = null;
    analyser = null;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code !== HOLD_KEY || event.repeat) return;
    if (document.activeElement === input && input.value) return;
    event.preventDefault();
    startListening();
  });

  window.addEventListener('keyup', (event) => {
    if (event.code !== HOLD_KEY) return;
    recognition?.stop();
  });

  // ---------------------------------------------------------------- fala

  // A fala é do `hud/voice.js`. Aqui só o som do sistema reagindo — havia um `speak()` neste
  // módulo atrás de um `root.dataset.voice` que ninguém nunca setava, ou seja, nunca falava.
  on('answer', () => audio.sweepUp({ from: 420, to: 1900, seconds: 0.6 }));

  on('error', () => audio.glitch());
  on('tool', (event) => {
    if (event.phase === 'call') audio.click({ frequency: 900, gain: 0.05, decay: 0.16 });
  });
  on('memory', () => audio.click({ frequency: 2100, gain: 0.05, decay: 0.2 }));

  // ---------------------------------------------------------------- desenho da onda

  function draw() {
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);

    if (analyser) {
      analyser.getByteFrequencyData(micData);
      for (let i = 0; i < BARS; i++) {
        const sample = micData[Math.floor((i / BARS) * micData.length)] / 255;
        levels[i] += (sample - levels[i]) * 0.4;
      }
    } else if (external !== null) {
      // Amplitude medida do áudio que está tocando — não é estimativa.
      for (let i = 0; i < BARS; i++) {
        const shape = Math.sin((i / BARS) * Math.PI); // envelope: centro mais alto que as pontas
        levels[i] += (external * (0.35 + shape * 1.15) - levels[i]) * 0.35;
      }
    } else {
      for (let i = 0; i < BARS; i++) {
        // Sem microfone e sem áudio: ondulação de repouso.
        const base = 0.06 + Math.sin(performance.now() * 0.002 + i * 0.42) * 0.035;
        levels[i] += (base - levels[i]) * 0.08;
      }
    }

    const barWidth = width / BARS;
    for (let i = 0; i < BARS; i++) {
      const value = Math.max(levels[i], 0.02);
      const barHeight = value * height * 0.9;
      context.fillStyle = `rgba(255, ${170 + value * 70}, ${110 + value * 90}, ${0.35 + value * 0.6})`;
      context.fillRect(
        i * barWidth + barWidth * 0.22,
        (height - barHeight) / 2,
        barWidth * 0.56,
        barHeight
      );
    }
    requestAnimationFrame(draw);
  }

  hint.textContent = 'MANTENHA ESPAÇO PARA FALAR · ESC PARA ABORTAR';
  requestAnimationFrame(draw);

  return {
    /** Chamado pelo motor de voz a cada quadro com a amplitude real; 0 devolve ao repouso. */
    setLevel(value) {
      external = value > 0.001 ? value : null;
    },
    clearInput: () => { input.value = ''; },
    focus: () => input.focus(),
    submit,
    resize() {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    },
  };
}
