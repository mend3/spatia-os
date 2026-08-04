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
import * as prefs from '../core/prefs.js';
import { el } from './dom.js';

const BARS = 42;

export function createTerminal(root, { audio }) {
  const input = root.querySelector('[data-prompt]');
  const ghost = root.querySelector('[data-prompt-ghost]');
  const hint = root.querySelector('[data-voice-hint]');
  const canvas = root.querySelector('[data-waveform]');
  const context = canvas.getContext('2d');
  const webToggle = root.querySelector('[data-web-toggle]');
  const sendBtn = root.querySelector('[data-send-btn]');
  const attachBtn = root.querySelector('[data-attach-btn]');
  const attachInput = root.querySelector('[data-attach-input]');
  const chips = root.querySelector('[data-attachments]');

  // Anexos pendentes desta pergunta. O agente recebe CAMINHO, não bytes: ele já tem `Read`,
  // que lida com imagem e PDF melhor que qualquer coisa que eu enfiasse no prompt.
  const attached = [];

  const levels = new Float32Array(BARS);
  let analyser = null;
  let micData = null;
  let micStream = null;
  let recognition = null;
  // Nível vindo de fora (voz do servidor): quando presente, manda na onda.
  let external = null;
  // Estado do controle vem do storage: o operador não deve reescolher a cada reload.
  let webMode = prefs.get('web.mode');

  // ---------------------------------------------------------------- envio

  let lastSubmit = { text: '', at: 0 };

  /**
   * O botão tem três papéis, e o modo é derivado — nunca guardado.
   *
   * Estado duplicado entre "o que o botão mostra" e "o que ele faz" é como o botão passa a
   * mentir. Aqui `mode()` lê o input e o reconhecimento, e o desenho segue.
   */
  function mode() {
    if (recognition) return 'stop';
    return input.value.trim() || attached.length ? 'send' : 'mic';
  }

  function refresh() {
    const current = mode();
    sendBtn.dataset.mode = current;
    sendBtn.title = { mic: 'falar', send: 'enviar', stop: 'parar de gravar' }[current];
    ghost.textContent = input.value ? '' : 'faça uma pergunta ao núcleo';

    chips.replaceChildren();
    for (const item of attached) {
      const chip = el('span', `chip ${item.path ? '' : 'pending'}`);
      chip.append(el('span', 'chip-name', item.name));
      const drop = el('button', 'chip-drop', '×');
      drop.title = 'remover anexo';
      drop.addEventListener('click', () => {
        attached.splice(attached.indexOf(item), 1);
        refresh();
      });
      chip.append(drop);
      chips.append(chip);
    }
  }

  sendBtn.addEventListener('click', () => {
    const current = mode();
    if (current === 'send') submit();
    else if (current === 'stop') recognition?.stop();
    else startListening();
  });

  attachBtn.addEventListener('click', () => attachInput.click());

  attachInput.addEventListener('change', async () => {
    for (const file of [...attachInput.files]) {
      // Entra na lista já como pendente: o upload de um arquivo grande leva tempo, e o
      // operador precisa ver que o anexo foi aceito antes de terminar de subir.
      const item = { name: file.name, path: '' };
      attached.push(item);
      refresh();
      try {
        const response = await fetch('/api/attach', {
          method: 'POST',
          headers: { 'X-Filename': encodeURIComponent(file.name) },
          body: file,
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || response.status);
        Object.assign(item, await response.json());
      } catch (error) {
        hint.textContent = `ANEXO FALHOU: ${error.message}`;
        attached.splice(attached.indexOf(item), 1);
      }
      refresh();
    }
    attachInput.value = '';
  });

  function submit(text) {
    const question = (text ?? input.value).trim();
    if (!question) return;
    // Rede de segurança independente da voz: dois envios do MESMO texto em menos de 2s são o
    // mesmo gesto (duplo Enter, evento repetido), e o segundo só abortaria o primeiro.
    const now = performance.now();
    if (question === lastSubmit.text && now - lastSubmit.at < 2000) return;
    lastSubmit = { text: question, at: now };

    // Anexo pronto entra como caminho no prompt; anexo ainda subindo é descartado com aviso,
    // porque mandar um caminho que não existe faria o agente errar sem saber por quê.
    const ready = attached.filter((item) => item.path);
    const waiting = attached.length - ready.length;
    const body = ready.length
      ? `${question}\n\nAnexos (leia com a ferramenta Read):\n${ready.map((a) => `- ${a.path}`).join('\n')}`
      : question;
    if (waiting) hint.textContent = `${waiting} ANEXO(S) AINDA SUBINDO — NÃO FORAM ENVIADOS`;

    input.value = '';
    attached.length = 0;
    refresh();
    audio.click({ frequency: 220, gain: 0.055, decay: 0.7 }); // 55×4 — confirmação grave
    api.ask(body, { web: webMode });
  }

  input.addEventListener('input', () => {
    refresh();
    // Som por tecla é o mais fácil de tornar insuportável: fica quase inaudível e grave.
    // 3200Hz a cada caractere era a pior combinação possível — região sensível do ouvido,
    // repetida dezenas de vezes por frase.
    if (input.value) audio.click({ frequency: 330, gain: 0.006, decay: 0.07 });
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

  function applyWeb() {
    webToggle.dataset.on = String(webMode);
    webToggle.textContent = webMode ? 'WEB · ON' : 'WEB · AUTO';
  }
  webToggle.addEventListener('click', () => {
    webMode = !webMode;
    prefs.set('web.mode', webMode);
    applyWeb();
  });
  applyWeb();

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

    /*
     * `onresult` dispara várias vezes com `interimResults`, e o Chrome pode entregar um
     * resultado FINAL mais de uma vez. Cada disparo chamava `submit()`, e duas perguntas em
     * sequência produzem exatamente os dois sintomas juntos: `api.ask` faz `abort()` no
     * início, então a segunda mata o stream da primeira — cujos eventos (plano, memória) já
     * pintaram o painel. Painel com dados duplicados, e resposta que nunca fecha.
     *
     * A trava é por sessão de reconhecimento, não por texto: o mesmo enunciado pode
     * legitimamente ser perguntado duas vezes, só não pelo mesmo ato de fala.
     */
    recognition.onresult = (event) => {
      const transcript = [...event.results].map((result) => result[0].transcript).join('');
      input.value = transcript;
      refresh();
      if (!event.results[event.results.length - 1].isFinal) return;
      // Transcreve e PARA — não envia sozinho.
      //
      // O envio automático era a origem da pergunta duplicada (o Chrome pode entregar mais de
      // um resultado final) e não deixava revisar o que o reconhecimento entendeu. Com o botão
      // que virou "enviar" assim que há texto, o gesto seguinte é óbvio e é do operador.
      try {
        recognition.stop();
      } catch {
        // Já encerrado.
      }
    };
    recognition.onerror = (event) => {
      hint.textContent = `VOZ: ${event.error.toUpperCase()}`;
    };
    recognition.onend = () => {
      recognition = null;
      hint.textContent = input.value.trim() ? 'REVISE E ENVIE' : 'NADA RECONHECIDO';
      stopMeter();
      refresh();
    };

    recognition.start();
    hint.textContent = '● OUVINDO · TOQUE EM PARAR QUANDO TERMINAR';
    refresh();
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


  // ---------------------------------------------------------------- fala

  // A fala é do `hud/voice.js`. Aqui só o som do sistema reagindo — havia um `speak()` neste
  // módulo atrás de um `root.dataset.voice` que ninguém nunca setava, ou seja, nunca falava.
  on('answer', () => audio.sweepUp());

  on('error', () => audio.glitch());
  on('tool', (event) => {
    if (event.phase === 'call') audio.click({ frequency: 275, gain: 0.04, decay: 0.45 }); // 55×5
  });
  on('memory', () => audio.click({ frequency: 495, gain: 0.045, decay: 0.6 })); // 55×9

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

  hint.textContent = 'MIC PARA FALAR · CLIPE PARA ANEXAR · ESC PARA ABORTAR';
  refresh();
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
