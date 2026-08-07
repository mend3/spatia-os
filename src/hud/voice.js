/**
 * Leitura da resposta em voz alta, pelo TTS global.
 *
 * **Fala por frase, não pela resposta inteira.** É a diferença entre a voz começar em ~3s e
 * começar em ~18s: esperar o `answer` completo significa esperar o modelo terminar de
 * raciocinar E o motor sintetizar tudo. Aqui cada frase fechada durante o stream de tokens
 * entra numa fila e é sintetizada enquanto o resto da resposta ainda está sendo escrita.
 *
 * A fila é serial de propósito. Sintetizar em paralelo chegaria mais rápido e falaria fora de
 * ordem — e resposta técnica lida na ordem errada é pior que resposta lida devagar.
 *
 * A forma de onda passa a ser **medição**: o áudio é decodificado e tocado por um
 * `AudioBufferSourceNode` ligado a um `AnalyserNode`, então o desenho lê amplitude real. A
 * versão anterior usava `speechSynthesis`, que não expõe o buffer, e a onda era um envelope
 * estimado pelos eventos de fronteira de palavra. O fallback continua sendo ele — e continua
 * estimando —, mas só quando o TTS do servidor não responde.
 */
import { on } from '../core/bus.js';
import * as prefs from '../core/prefs.js';

// Fim de frase seguido de espaço/fim. O lookbehind evita quebrar em `v1.2` ou `etc.`
// seguido de minúscula, que produziria fragmentos sem sentido para o motor.
const SENTENCE = /(?<=[.!?…:])\s+(?=[A-ZÀ-Ú"'`\-—*\d])/;
const MIN_CHARS = 24;
const MAX_QUEUE = 12;

export function createVoice(root, { onLevel } = {}) {
  const toggle = root.querySelector('[data-voice-toggle]');
  const hint = root.querySelector('[data-voice-hint]');

  let enabled = false;
  let pending = '';
  let queue = [];
  let speaking = false;
  let engine = 'server';
  let generation = 0;

  let context = null;
  let analyser = null;
  let currentSource = null;

  function audio() {
    if (!context) {
      context = new (window.AudioContext || window.webkitAudioContext)();
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(context.destination);
    }
    return context;
  }

  // ---------------------------------------------------------------- fila

  function enqueue(text) {
    // Limpa AQUI, não em quem chama: é o ponto por onde todo caminho passa (frase fechada
    // durante o stream, resto no `answer`, resposta curta). Limpar só no fallback deixava o
    // motor recebendo crase e asterisco no caminho normal — medido, ia `A rede \`workspace\``.
    const clean = stripMarkup(text).replace(/\s+/g, ' ').trim();
    if (!clean) return;
    if (queue.length >= MAX_QUEUE) return; // resposta muito longa: fala o começo, não trava
    queue.push({ text: clean, generation });
    if (!speaking) drain();
  }

  async function drain() {
    speaking = true;
    while (queue.length) {
      const item = queue.shift();
      // Descarta o que sobrou de uma resposta já abandonada: `Esc` ou pergunta nova
      // incrementam a geração, e áudio da pergunta anterior não pode continuar falando.
      if (item.generation !== generation || !enabled) continue;
      try {
        await speakServer(item.text);
      } catch (error) {
        engine = 'browser';
        setHint(`VOZ DO SERVIDOR INDISPONÍVEL (${error.message}) · USANDO O BROWSER`);
        speakBrowser(item.text);
      }
    }
    speaking = false;
    onLevel?.(0);
  }

  async function speakServer(text) {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `${response.status}`);
    }

    const bytes = await response.arrayBuffer();
    const ctx = audio();
    await ctx.resume();
    const buffer = await ctx.decodeAudioData(bytes);

    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      currentSource = source;
      source.onended = () => {
        if (currentSource === source) currentSource = null;
        resolve();
      };
      source.start();
      engine = 'server';
      setHint('● FALANDO');
      pump();
    });
  }

  /** Amplitude real do áudio tocando, por quadro, para a forma de onda da HUD. */
  function pump() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const step = () => {
      if (!currentSource) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const value of data) sum += value;
      onLevel?.(sum / data.length / 255);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Fallback: `speechSynthesis`. Sem acesso ao buffer, logo sem onda medida. */
  function speakBrowser(text) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.02;
    utterance.pitch = 0.92;
    utterance.onboundary = () => onLevel?.(0.55 + Math.random() * 0.3);
    utterance.onend = () => onLevel?.(0);
    speechSynthesis.speak(utterance);
  }

  function stop() {
    generation += 1;
    queue = [];
    pending = '';
    try {
      currentSource?.stop();
    } catch {
      // `stop()` em source já encerrado levanta; o estado que importa é o currentSource.
    }
    currentSource = null;
    speechSynthesis?.cancel?.();
    onLevel?.(0);
    setHint(idleHint());
  }

  // ---------------------------------------------------------------- eventos

  on('query', stop);
  on('ui.cancel', stop);

  on('token', (event) => {
    if (!enabled) return;
    pending += event.text;
    // Só corta em frase fechada. Cortar por tamanho produziria pedaços que o motor lê com
    // entonação errada, e é audível.
    const parts = pending.split(SENTENCE);
    while (parts.length > 1) {
      const sentence = parts.shift();
      if (sentence.trim().length >= MIN_CHARS) enqueue(sentence);
      else parts[0] = `${sentence} ${parts[0]}`;
    }
    pending = parts[0] ?? '';
  });

  on('answer', (event) => {
    if (!enabled) return;
    // O resto que não fechou frase, e o caso da resposta curta que nunca disparou corte.
    if (pending.trim()) enqueue(pending);
    else if (!queue.length && !speaking) enqueue(event.text || '');
    pending = '';
  });

  /** Markdown e citações não se leem em voz alta — `[3]` viraria "colchete três". */
  function stripMarkup(text) {
    return text
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\[\d{1,2}\]/g, '')
      .replace(/^[\s*\-•]+/gm, '');
  }

  // ---------------------------------------------------------------- controle

  function idleHint() {
    if (!enabled) return 'MANTENHA ESPAÇO PARA FALAR · ESC PARA ABORTAR';
    return `VOZ ATIVA · ${engine === 'server' ? 'TTS DO ORACLE' : 'SÍNTESE DO BROWSER'}`;
  }

  function setHint(text) {
    if (hint) hint.textContent = text;
  }

  function setEnabled(value) {
    enabled = value;
    prefs.set('voice.enabled', value);
    if (toggle) {
      toggle.dataset.on = String(value);
      toggle.textContent = value ? 'VOZ · ON' : 'VOZ · OFF';
    }
    if (!value) stop();
    else {
      // Precisa de gesto do usuário para o AudioContext — e o clique no toggle é ele.
      audio().resume?.();
      setHint(idleHint());
    }
  }

  toggle?.addEventListener('click', () => setEnabled(!enabled));

  /*
   * Restaura o estado salvo, mas SEM tocar no AudioContext.
   *
   * `setEnabled(true)` chama `audio().resume()`, e no carregamento da página não existe gesto
   * do usuário — o browser recusa e o contexto fica suspenso, então a primeira fala sairia
   * muda. O rótulo reflete o estado salvo; o contexto destrava no primeiro gesto real (o
   * ENGATAR do boot, ou o próprio toggle).
   */
  if (prefs.get('voice.enabled')) {
    enabled = true;
    if (toggle) {
      toggle.dataset.on = 'true';
      toggle.textContent = 'VOZ · ON';
    }
  }

  return {
    setEnabled,
    isEnabled: () => enabled,
    stop,
    /** O boot informa se o TTS do servidor existe, para o rótulo não mentir. */
    /**
     * @param {object} health
     * @param {object} [units] resposta de `/api/units` — o DESEJADO, que o health não tem
     */
    applyHealth(health, units) {
      engine = health?.tts?.online ? 'server' : 'browser';

      /*
       * DESABILITAR ANTES DE FALHAR, e dizer qual das duas coisas é.
       *
       * O health responde só o real: TTS fora do ar e TTS que nunca foi para ser usado nesta
       * instalação chegavam iguais aqui. Com o grafo do `units`, a capacidade `voice` diz se o
       * que falta foi DECLARADO desligado — e aí a mensagem é "desligado", não "falhou".
       *
       * O motor do browser continua atendendo nos dois casos; o que muda é a expectativa que a
       * tela cria. Prometer voz de servidor que não vai vir é a promessa que este bloco desfaz.
       */
      const voz = units?.capabilities?.voice;
      if (voz && !voz.ready) {
        setHint(
          voz.disabled.length
            ? `SÍNTESE DESLIGADA NESTA INSTALAÇÃO (${voz.disabled.join(', ')}) — VOZ DO NAVEGADOR`
            : `SÍNTESE FORA DO AR (${voz.missing.join(', ')}) — VOZ DO NAVEGADOR`
        );
        return;
      }
      /*
       * Cada variável é nomeada pelo seu próprio nome.
       *
       * O servidor mandava `voice_ok AND blend_ok` num booleano só, e a tela sempre acusava
       * TTS_VOICE — mesmo quando a que faltava era a voz de mistura. Mandar conferir a
       * variável errada é pior que não avisar: gasta o tempo de quem procura no lugar errado.
       */
      if (health?.tts?.online && health.tts.voice_ok === false) {
        setHint(`VOZ "${health.tts.voice}" NÃO EXISTE NO MOTOR — VERIFIQUE TTS_VOICE`);
      } else if (health?.tts?.online && health.tts.blend_ok === false) {
        setHint(`VOZ DE MISTURA "${health.tts.blend_voice}" NÃO EXISTE — VERIFIQUE TTS_BLEND_VOICE`);
      }
    },
  };
}

export { SENTENCE };
