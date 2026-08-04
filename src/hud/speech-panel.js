/**
 * Painel de voz — junto de PERMISSÕES e AFINAR, porque configuração tem um lugar só.
 *
 * Existiu por um momento como app orbital, e estava errado: obrigava o operador a saber que
 * "voz" era destino e "permissões" era painel, sem regra que explicasse a diferença.
 *
 * Cada controle daqui foi **medido** contra o motor que roda nesta máquina. O caso que
 * justifica a régua: a sintaxe de mistura do `kokoro-tts-container` (`voz:peso,voz:peso`)
 * devolve 400 neste fastapi. O painel oferece o conceito dele — duas vozes e um peso — e o
 * servidor traduz para `voz(peso)+voz(peso)`. Um controle que produz 400 é pior que a ausência
 * dele.
 */
import { el, set } from './dom.js';
import { button } from './button.js';
import * as prefs from '../core/prefs.js';
import * as api from '../core/api.js';
import { bind } from '../core/keys.js';
import * as surface from './surface.js';

const TOGGLE_KEY = 'KeyV';

// Mesma duração do sinal de reversão do painel de permissões: um só gesto visual no sistema.
const REVERT_FLASH_MS = 1200;

export function createSpeechPanel(root) {
  const panel = el('div', 'perms speech-panel');
  const header = el('div', 'controls-head');
  header.append(el('span', 'controls-title', 'VOZ'));
  const status = el('span', 'perms-status', '');
  header.append(status);
  panel.append(header);

  const body = el('div', 'perms-body');
  panel.append(body);
  panel.append(el('div', 'perms-hint', 'V FECHA · APLICA NA PRÓXIMA FALA'));
  root.append(panel);

  let cfg = null;
  // Última config CONFIRMADA pelo servidor — a âncora da reversão. `cfg` pode estar otimista.
  let confirmed = null;
  let seq = 0;
  let player = null;

  /**
   * Pinta primeiro, reconcilia depois, reverte visivelmente se falhar.
   *
   * A versão anterior esperava o round-trip antes de redesenhar: escolher uma voz tinha latência
   * visível, e uma falha deixava a marca de seleção onde o operador clicou com um "falhou:" no
   * cabeçalho — a tela afirmando um estado que o servidor não tem.
   *
   * Aqui a mentira é pior que no painel de permissões, porque o efeito é auditivo: o operador
   * escolhe `pf_dora`, a tela mostra `pf_dora`, e a próxima frase sai com a voz antiga.
   */
  async function patch(change) {
    const mine = ++seq;
    // O servidor deriva campos (`wire_voice`, `voice_ok`, `blend_ok`) do estado; no render
    // otimista eles ainda são os antigos. Por isso o cabeçalho diz "aplicando…" em vez de já
    // anunciar a voz efetiva: aquele texto é a resposta do motor, não o pedido.
    cfg = { ...cfg, state: { ...cfg.state, ...change }, pending: true };
    draw();
    set(status, 'aplicando…');
    try {
      const fresh = await api.setSpeech(change);
      if (mine !== seq) return;
      confirmed = fresh;
      cfg = fresh;
      draw();
      set(status, cfg.wire_voice);
    } catch (error) {
      if (mine !== seq) return;
      if (confirmed) {
        cfg = confirmed;
        draw();
      }
      set(status, `revertido: ${error.message}`);
      panel.dataset.reverted = 'true';
      setTimeout(() => delete panel.dataset.reverted, REVERT_FLASH_MS);
    }
  }

  async function load() {
    try {
      cfg = await api.speech();
      confirmed = cfg;
      draw();
    } catch (error) {
      body.replaceChildren(el('div', 'widget-error', `config de voz indisponível: ${error.message}`));
    }
  }

  function draw() {
    const s = cfg.state;
    body.replaceChildren();

    if (!cfg.online) {
      body.append(el('div', 'widget-error', 'motor de voz offline'));
      body.append(el('div', 'perm-desc', 'suba no oracle: make up nvidia speech'));
      return;
    }

    // ---- bancada primeiro: é o que responde "como isso soa?" ----
    body.append(el('div', 'controls-group', 'OUVIR'));
    const bench = el('div', 'bench');
    const input = el('input', 'fs-search');
    // Aspas duplas: o texto tem apóstrofo (`you'd`, `I'll`), e entre aspas simples ele fecha a
    // string no meio da frase. Foi assim que o módulo virou SyntaxError e o boot ficou preso em
    // "verificando subsistemas" — um erro de parse aqui impede o `main()` de existir.
    input.value = "Just tell me what you'd like to work on in the workspace and I'll take it from here.";
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') speak(input.value);
    });
    const play = button({ variant: 'select', size: 'xs', label: 'SINTETIZAR', onClick: () => speak(input.value) });
    const benchStatus = el('div', 'unit-sub', '');
    bench.append(input, play, benchStatus);
    body.append(bench);
    bench.dataset.role = 'bench';

    // ---- parâmetros ----
    body.append(el('div', 'controls-group', 'PARÂMETROS'));
    body.append(slider('VELOCIDADE', s.speed, cfg.speed_range[0], cfg.speed_range[1], 0.05,
      (v) => patch({ speed: v }), 'x'));
    body.append(slider('VOLUME', s.volume_multiplier, cfg.volume_range[0], cfg.volume_range[1], 0.05,
      (v) => patch({ volume_multiplier: v }), 'x'));

    body.append(chips('IDIOMA', Object.entries(cfg.languages), s.lang_code, (v) => patch({ lang_code: v })));
    body.append(chips('FORMATO', cfg.formats.map((f) => [f, f.toUpperCase()]),
      s.response_format, (v) => patch({ response_format: v })));

    body.append(toggle('NORMALIZAR TEXTO', 'expande número, URL e e-mail antes de falar',
      s.normalize, (v) => patch({ normalize: v })));

    // ---- vozes ----
    const langOfVoice = (voice) => Object.keys(cfg.catalog).find((k) => cfg.catalog[k].includes(voice)) || '';
    const mainLang = langOfVoice(s.voice);
    body.append(el('div', 'controls-group', `VOZ PRINCIPAL · ${s.voice}`));

    /*
     * Aviso de desacordo voz↔idioma.
     *
     * Nada impede escolher `af_river` (inglês) com idioma PORTUGUÊS, e o motor aceita: devolve
     * 200 e fala inglês com fonética errada. É falha que só se percebe ouvindo, então a tela
     * tem que apontá-la — o controle permite, mas não em silêncio.
     */
    if (s.lang_code && mainLang && s.lang_code !== mainLang) {
      const warn = el('div', 'widget-error',
        `a voz ${s.voice} é ${cfg.languages[mainLang]} e o idioma está em ${cfg.languages[s.lang_code]}`);
      body.append(warn);
      body.append(
        button({ variant: 'select', size: 'xs', label: 'USAR AUTO', onClick: () => patch({ lang_code: '' }) })
      );
    }

    for (const [lang, voices] of Object.entries(cfg.catalog).sort()) {
      body.append(el('div', 'controls-group', `${cfg.languages[lang] || lang} · ${voices.length}`));
      for (const voice of [...voices].sort()) {
        const isMain = voice === s.voice;
        const isBlend = voice === s.blend_voice;
        const row = button({ variant: 'row', size: 'row', on: isMain });
        row.append(el('span', 'fs-glyph', isMain ? '◆' : isBlend ? '◇' : '·'));
        row.append(el('span', 'fs-name', voice));
        if (isMain) row.append(el('span', 'fs-meta', 'PRINCIPAL'));
        else if (isBlend) row.append(el('span', 'fs-meta', 'MISTURA'));
        row.addEventListener('click', (event) => {
          if (event.shiftKey) patch({ blend_voice: voice, blend: true });
          else patch({ voice });
        });
        body.append(row);
      }
    }

    // ---- mistura ----
    body.append(el('div', 'controls-group', 'MISTURA DE VOZES'));
    body.append(toggle('MISTURAR DUAS VOZES',
      s.blend_voice ? `com ${s.blend_voice}` : 'shift+clique numa voz acima para escolher a segunda',
      s.blend, (v) => patch({ blend: v })));
    if (s.blend && s.blend_voice) {
      body.append(slider(`PESO DE ${s.voice}`, s.blend_weight, 1, 99, 1,
        (v) => patch({ blend_weight: Math.round(v) }), '%'));
    }

    body.append(el('div', 'unit-sub', `no fio: ${cfg.wire_voice}`));
    if (!cfg.voice_ok) body.append(el('div', 'widget-error', 'a voz configurada não existe no motor'));

    async function speak(text) {
      const clean = (text || '').trim();
      if (!clean) return;
      set(benchStatus, 'sintetizando…');
      const started = performance.now();
      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error || `${response.status}`);
        }
        const blob = await response.blob();
        const ms = Math.round(performance.now() - started);

        /*
         * Toca por WebAudio, não por `<audio src=blob>`.
         *
         * O `<audio>` recusa formato que o browser não decodifica — e PCM cru é um deles, sem
         * cabeçalho para identificar. Além disso `play()` num elemento criado por script cai na
         * política de autoplay quando não há gesto recente, e o preview morria em silêncio.
         * `decodeAudioData` diz o que aconteceu, e o AudioContext já está destravado desde o
         * boot (o clique em ENGATAR).
         */
        const context = new (window.AudioContext || window.webkitAudioContext)();
        await context.resume();
        const buffer = await context.decodeAudioData(await blob.arrayBuffer());
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start();
        player = source;
        set(benchStatus,
          `${ms}ms · ${(blob.size / 1024).toFixed(1)}KB · ${blob.type} · ${buffer.duration.toFixed(1)}s`);
      } catch (error) {
        // Erro de decodificação é informação: PCM cru não toca no browser, e dizer isso é
        // melhor que um preview que não faz nada.
        set(benchStatus, `falhou: ${error.message}${cfg.state.response_format === 'pcm'
          ? ' — PCM cru não é decodificável no browser; use mp3 ou wav para ouvir aqui' : ''}`);
      }
    }
  }

  function slider(label, value, min, max, step, onChange, unit = '') {
    const row = el('label', 'control');
    const head = el('span', 'control-head');
    head.append(el('span', 'control-label', label));
    const readout = el('span', 'control-value', `${Number(value).toFixed(2)}${unit}`);
    head.append(readout);
    row.append(head);
    const input = el('input', 'control-slider');
    Object.assign(input, { type: 'range', min, max, step, value });
    input.addEventListener('input', () => set(readout, `${Number(input.value).toFixed(2)}${unit}`));
    // `change`, não `input`: cada alteração persiste no disco, e gravar a cada pixel do
    // arrasto seriam dezenas de escritas para um gesto só.
    input.addEventListener('change', () => onChange(Number(input.value)));
    row.append(input);
    return row;
  }

  function chips(label, options, active, onPick) {
    const wrap = el('div', 'chips');
    wrap.append(el('div', 'controls-group', label));
    const row = el('div', 'perm-modes');
    for (const [value, text] of options) {
      row.append(
        button({ variant: 'select', size: 'xs', label: text, on: value === active, onClick: () => onPick(value) })
      );
    }
    wrap.append(row);
    return wrap;
  }

  function toggle(name, desc, checked, onChange) {
    const row = el('label', 'perm');
    const box = el('input', 'perm-box');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => onChange(box.checked));
    const text = el('span', 'perm-text');
    text.append(el('span', 'perm-name', name), el('span', 'perm-desc', desc));
    row.append(box, text);
    return row;
  }

  surface.attach(panel, { onClose: () => setOpen(false) });

  function setOpen(open) {
    panel.classList.toggle('open', open);
    document.body.classList.toggle('speech-open', open);
    prefs.set('panel.speech', open);
    surface.track(panel, open, () => setOpen(false));
    if (trigger) trigger.dataset.on = String(open);
    if (open) {
      document.activeElement?.blur?.();
      load();
    } else {
      try {
        player?.stop();
      } catch {
        // Fonte já encerrada; nada a fazer.
      }
    }
  }

  const trigger = root.querySelector('[data-speech-toggle]');
  trigger?.addEventListener('click', () => setOpen(!panel.classList.contains('open')));

  bind({ code: TOGGLE_KEY, label: 'V CONFIG VOZ' }, () => setOpen(!panel.classList.contains('open')));

  return { toggle: () => setOpen(!panel.classList.contains('open')) };
}
