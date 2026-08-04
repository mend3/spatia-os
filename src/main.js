/**
 * Ponto de entrada: liga as quatro camadas ao mesmo barramento e sai da frente.
 *
 *   cena 3D  ·  HUD  ·  áudio  ·  métricas
 *
 * Nenhuma delas conhece as outras. Este arquivo é o único lugar que conhece todas, e o que
 * ele faz é só ordem de inicialização — não lógica.
 */
import { on, ui, emit } from './core/bus.js';
import * as state from './core/state.js';
import * as session from './core/session.js';
import * as api from './core/api.js';
import { createScene } from './space/scene.js';
import { DIRTY_LABELS } from './space/rings.js';
import { createAudio } from './audio/engine.js';
import { createFrame } from './hud/frame.js';
import { createStreams } from './hud/streams.js';
import { createAnswer } from './hud/answer.js';
import { createTerminal } from './hud/terminal.js';
import { createBoot } from './hud/boot.js';
import { createControls } from './hud/controls.js';
import { createPermissions } from './hud/permissions.js';
import { createVoice } from './hud/voice.js';
import { createSpeechPanel } from './hud/speech-panel.js';
import { createSystray } from './hud/systray.js';
import { createWidgetHost } from './kernel/widgets.js';
import { createRouter, ROUTE_ROOT } from './kernel/router.js';
import { listApps } from './kernel/registry.js';
import { registerApps, SYSTEM_VIEW } from './apps/index.js';
import * as tuning from './core/tuning.js';
import * as prefs from './core/prefs.js';
import * as keys from './core/keys.js';
import { button, setOn } from './hud/button.js';
import * as surface from './hud/surface.js';

const hud = document.getElementById('hud');
const canvas = document.getElementById('space');
const bootRoot = document.getElementById('boot');
const hover = document.querySelector('[data-hover]');
const bodyLayer = document.getElementById('bodies');

async function main() {
  if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) {
    api.reportClient({ boot: 'no_webgl' });
    bootRoot.querySelector('[data-boot-status]').textContent =
      'WebGL indisponível — o observatório precisa de aceleração gráfica';
    return;
  }

  state.install();
  // Depois do `state`: os dois assinam o mesmo barramento, e o contexto da sessão referencia
  // o regime cognitivo — instalar antes o faria observar um store que ainda não existe.
  session.install();
  keys.install();

  const audio = createAudio();
  const scene = createScene(canvas, { labelLayer: bodyLayer });
  /*
   * `document`, não `hud`, para os módulos que ADOTAM nós.
   *
   * Os nós de conteúdo nascem no depósito, que vive fora do `#hud` — buscar só dentro do hud
   * devolvia null e o boot morria em `frame.js`. Quem APPENDA (terminal, painéis) continua
   * recebendo `hud`, porque aí o pai importa.
   */
  const frame = createFrame(document);

  /*
   * Registro antes do router: o registro VALIDA que todo widget pedido por um app existe, e
   * falhar aqui é falhar no boot com o nome do culpado — não numa fenda vazia meia hora
   * depois, quando alguém abrir o app.
   */
  registerApps();
  const apps = listApps();
  const host = createWidgetHost(hud);
  const chrome = createDock(hud, apps);
  const router = createRouter({ host, scene, chrome });
  const streams = createStreams(document, { toolColor: scene.toolColor });
  const answer = createAnswer(document);
  const terminal = createTerminal(hud, { audio });
  const controls = createControls(hud);
  const perms = createPermissions(hud);
  const speechPanel = createSpeechPanel(hud);
  const panels = { tuning: controls, permissions: perms, speech: speechPanel };
  /*
   * Depois dos painéis, de propósito: cada um deles procura o próprio gatilho por
   * `querySelector` no `create*`, e os gatilhos agora moram dentro dos popovers da systray.
   * A ordem não afeta a busca (o HTML já está no DOM), mas mantém a leitura honesta — a
   * systray é a moldura dos controles, não a dona deles.
   */
  const systray = createSystray(hud);
  // A onda da HUD passa a ser desenhada com a amplitude real do áudio que o motor toca.
  const voice = createVoice(document, { onLevel: (level) => terminal.setLevel(level) });

  /*
   * Os interruptores do sistema também são astros.
   *
   * Eles existiam só como botões no canto do rodapé — descobríveis por quem já sabia que
   * estavam lá. Num ambiente onde tudo é corpo em órbita, um interruptor escondido num canto é
   * a única coisa que não obedece à própria metáfora. Os botões continuam (são o caminho
   * rápido), mas agora têm corpo.
   */
  const CONTROLS = [
    { id: 'ctl-voice', name: 'VOZ', key: 'V', color: 0xc59bff, action: () => voice.setEnabled(!voice.isEnabled()) },
    { id: 'ctl-speech', name: 'CONFIG VOZ', color: 0x9b7fff, action: () => speechPanel.toggle() },
    { id: 'ctl-perms', name: 'PERMISSÕES', key: 'P', color: 0xffd257, action: () => perms.toggle() },
    { id: 'ctl-tune', name: 'AFINAR', key: '`', color: 0xffb35c, action: () => controls.toggle() },
  ];
  const controlBodies = CONTROLS.map((control, index) => ({
    ...control,
    type: 'control',
    // Fases distribuídas no anel interno; inclinação alternada para não colidirem na projeção.
    orbit: { phase: (index / CONTROLS.length) * Math.PI * 2, inclination: index % 2 ? 0.5 : -0.34 },
  }));
  scene.installApps([...apps, ...controlBodies]);

  on('ui.toggle-control', ({ id }) => {
    const control = CONTROLS.find((entry) => entry.id === id);
    control?.action();
    audio.click({ frequency: 275, gain: 0.045, decay: 0.4 });
  });
  terminal.resize();
  window.addEventListener('resize', () => terminal.resize());

  /**
   * Destrava o áudio na primeira interação real, uma vez só.
   *
   * Três eventos porque três caminhos de entrada existem: mouse (`pointerdown`), teclado
   * (`keydown`) e roda (`wheel`, que é como se orbita a câmera). `{ once: true }` em cada um não
   * bastaria — o primeiro a disparar tem que remover os outros dois, senão sobram listeners
   * armados para sempre esperando um gesto que já aconteceu.
   */
  function armAudioUnlock() {
    const events = ['pointerdown', 'keydown', 'wheel'];
    const unlock = async () => {
      for (const name of events) window.removeEventListener(name, unlock, true);
      const started = await audio.enable();
      // Reporta o desfecho: o boot já disse `audio: false`, e sem isto a métrica ficaria
      // afirmando que este cliente nunca teve som.
      if (started) api.reportClient({ audio: true, audio_unlocked_by: 'gesture' });
    };
    for (const name of events) window.addEventListener(name, unlock, true);
  }

  const boot = createBoot(bootRoot, {
    /**
     * `ambient` é a resposta do gate do boot — som ligado ou entrada em silêncio.
     *
     * O clique nos botões É o gesto que a política de autoplay exige, então aqui `enable()`
     * tem tudo para funcionar. Mesmo assim ele pode LANÇAR (numa aba sem gesto válido o
     * `resume()` REJEITA em vez de resolver com estado suspenso), e tratar só o `false`
     * deixava a exceção subir e travar o boot. O `armAudioUnlock` fica como rede: se o gesto
     * não valeu por algum motivo, o próximo destrava.
     *
     * "IGNORAR" não arma rede nenhuma e registra `audio.muted`. É escolha, não adiamento —
     * ligar o som depois, por um clique que era para fazer outra coisa, contradiria o que o
     * operador acabou de responder. O caminho de volta é ⌘M, que reabre o áudio.
     */
    onEngage: async ({ ambient }) => {
      prefs.set('audio.muted', !ambient);
      let started = false;
      if (ambient) {
        try {
          started = await audio.enable();
        } catch (error) {
          console.warn('[audio] gesto do boot não destravou; aguardando o próximo', error);
        }
        if (started) audio.setVolume(tuning.get('volume'));
        else armAudioUnlock();
      }
      api.reportClient({ boot: 'success', audio: started });
      emit({ t: 'state', state: 'idle', label: 'OCIOSO' });
      terminal.focus();
    },
  });

  // Áudio e cena assinam o mesmo estado, então som e imagem nunca divergem.
  on('ui.state-changed', ({ state: next }) => audio.setRegime(next));

  // A janela temporal do céu. O widget do scrubber não conhece a cena e a cena não conhece o
  // widget: os dois falam em espaço de recência, que é o mesmo eixo que já define o raio orbital.
  on('ui.sky-reveal', ({ reveal }) => scene.revealSky(reveal));

  // O volume é afinação como qualquer outra — mesmo painel, mesma persistência.
  tuning.subscribe((values, key) => {
    if (key === null || key === 'volume') audio.setVolume(values.volume);
    if (key === null || key === 'ambient' || key === 'brightness') audio.tune(values);
  });

  on('ui.hover', ({ node }) => {
    if (!node) {
      hover.classList.remove('on');
      return;
    }
    hover.classList.add('on');
    hover.querySelector('[data-hover-label]').textContent = node.label;
    // O anel sem legenda é enfeite: quem passa o cursor precisa ler QUAL dos três estados é.
    const dirty = node.type === 'file' ? scene.dirtyOf(node.source) : null;
    hover.querySelector('[data-hover-meta]').textContent = [
      node.kind,
      `${node.chunks} chunk(s)`,
      node.type === 'file' ? null : 'agregado',
      // Sem `?? dirty.toUpperCase()`, um estado novo no servidor (`conflicted`, p.ex.) faria o
      // anel ser pintado como ALTERADO enquanto o rótulo CALA — céu e texto discordando em
      // silêncio, que é o modo de falha mais caro de diagnosticar.
      dirty ? DIRTY_LABELS[dirty] ?? dirty.toUpperCase() : null,
    ]
      .filter(Boolean)
      .join(' · ');
  });

  installShortcuts(scene, audio, answer, terminal, router, streams, systray);

  /*
   * Uma janela para o contexto, no console.
   *
   * Instrumentação que não dá para inspecionar é instrumentação que ninguém confere — e store
   * que ninguém confere diverge da tela em silêncio, que é exatamente o defeito que ele existe
   * para impedir. Uma leitura só, sem estado escrito: `espatial.session()` e `espatial.state()`.
   * Não é API pública; é a janela de quem está depurando.
   */
  window.espatial = Object.freeze({
    session: () => session.snapshot(),
    state: () => state.snapshot(),
  });

  // Clicar num corpo no espaço abre o app dele — o mesmo caminho do clique na dock.
  on('ui.open-app', ({ id }) => router.navigate(id));

  let health = null;
  try {
    health = await api.health();
    frame.applyHealth(health);
    voice.applyHealth(health);
    streams.showProviders(health.providers);
    scene.installProviders(health.providers);
  } catch (error) {
    boot.fail(`servidor não respondeu: ${error.message}`);
    return;
  }

  let nodeCount = 0;
  try {
    const graph = await api.graph();
    nodeCount = scene.loadGraph(graph);
    frame.applyGraph(nodeCount);
    streams.note(`TOPOLOGIA CARREGADA · ${nodeCount} CORPOS`, 'good');
  } catch (error) {
    streams.note(`TOPOLOGIA INDISPONÍVEL: ${error.message}`, 'bad');
  }

  // Sem topologia não há estrela para receber anel — sondar o disco só gastaria `git status`.
  if (nodeCount) watchDirty(scene, streams);

  // O router entra em cena depois de saúde e topologia: um app que carrega dados no onEnter
  // não deve fazê-lo antes de o sistema saber o que está no ar.
  router.start(SYSTEM_VIEW);
  // Eventos que ninguém pediu (webhooks) começam a chegar aqui.
  api.watchSystem();

  restorePrefs(panels, audio);

  await boot.report(health, nodeCount);
  api.startTelemetry(() => ({ ...scene.sampleTelemetry(), audio: audio.isEnabled() }));
  await boot.engage();
}

/*
 * Sondagem das alterações locais — os anéis de Saturno.
 *
 * Deliberadamente MENOR que o TTL de 15s do cache do servidor (`server/dirty.py`), e não igual
 * a ele. Com os dois períodos iguais, uma sondagem que chega logo antes de o cache expirar
 * recebe a foto velha e a próxima só vem 15s depois — o atraso de pior caso vira 30s, o dobro
 * do anunciado. Sondar mais rápido não custa `git status` nenhum (quem decide isso é o cache do
 * servidor); custa um GET, e é o preço de o anel acompanhar mesmo o Ctrl+S.
 */
const DIRTY_POLL_MS = 6_000;

/**
 * Mantém os anéis em dia com o disco.
 *
 * Aba escondida não sonda: cada sondagem que vence o cache é um `git status --porcelain` por
 * raiz git (o workspace e cada submódulo), e pagar isso por uma aba que ninguém está olhando é
 * gastar CPU do operador para desenhar o que ele não vê. Ao voltar para a aba a sondagem é
 * imediata — esperar o próximo tique mostraria o disco de até 15s atrás.
 */
function watchDirty(scene, streams) {
  // Começa em 0 e não em `null`: árvore limpa no boot é o caso comum, e anunciar "0 arquivos"
  // toda vez que o observatório sobe é ruído.
  let announced = 0;
  let failing = false;

  async function poll() {
    if (document.hidden) return;
    try {
      const payload = await api.dirty();
      // Validação de fronteira: um 200 sem `files` (ou com `files` que não é objeto) cairia em
      // `total = 0` e a tela anunciaria "ÁRVORE LIMPA" em verde — afirmando sobre o disco a
      // partir de uma resposta que não diz nada sobre o disco.
      const files = payload?.files;
      if (!files || typeof files !== 'object' || Array.isArray(files)) {
        throw new Error('resposta sem tabela de arquivos');
      }
      const { shown, dropped, total } = scene.markDirty(files);
      failing = false;
      if (shown === announced) return;
      announced = shown;
      streams.note(dirtyNote(shown, dropped, total), shown ? '' : 'good');
    } catch (error) {
      /*
       * Falha = APAGAR os anéis, não mantê-los.
       *
       * Mantidos, o céu segue afirmando "este arquivo está alterado" e o hover segue dizendo
       * ALTERADO por tempo indeterminado, com base numa leitura que já não se consegue
       * verificar — inclusive depois de o operador ter commitado tudo. Some-se a isso que a
       * nota de erro rola para fora do log e a afirmação falsa fica sozinha na tela. Sumir com
       * o anel é a única leitura honesta: não se sabe.
       */
      scene.forgetDirty();
      announced = 0;
      // Uma nota por queda, não uma a cada tique: um servidor fora do ar não pode encher o log.
      if (failing) return;
      failing = true;
      streams.note(`ALTERAÇÕES LOCAIS INDISPONÍVEIS: ${error.message} · ANÉIS REMOVIDOS`, 'bad');
    }
  }

  setInterval(poll, DIRTY_POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
  });
  poll();
}

/**
 * O que a nota diz, e por que ela diz mais do que o número de anéis.
 *
 * "Editei um arquivo e não apareceu anel" tem duas causas, e o operador não tem como
 * distingui-las olhando o céu: ou o arquivo não está indexado (não tem estrela), ou passou do
 * teto de anéis. As duas são contadas em separado — calar qualquer uma faz o céu afirmar que
 * só aquilo mudou.
 */
function dirtyNote(shown, dropped, total) {
  if (!total) return 'ÁRVORE LIMPA · NENHUM ANEL';
  const unindexed = total - shown - dropped;
  const parts = [`TRABALHO LOCAL · ${total} ARQUIVO(S)`];
  if (shown !== total) parts.push(`${shown} NO CÉU`);
  if (dropped) parts.push(`${dropped} ALÉM DO TETO`);
  if (unindexed > 0) parts.push(`${unindexed} FORA DO ÍNDICE`);
  return parts.join(' · ');
}

function installShortcuts(scene, audio, answer, terminal, router, streams, systray) {
  // Estado restaurado do storage; o cinema é aplicado no boot por `restorePrefs`.
  let cinematic = prefs.get('view.cinematic');
  let muted = prefs.get('audio.muted');

  /**
   * `Esc` tem uma cadeia, e ela vive só aqui.
   *
   * Antes, dois módulos escutavam a tecla — o terminal para abortar, o inspetor para fechar,
   * um deles com `stopPropagation` — e o resultado era que nem o inspetor fechava nem a
   * resposta saía da tela: só F5 resolvia. A ordem é do gesto mais recente para o mais
   * antigo, que é a expectativa de qualquer interface: desfaz-se o último passo primeiro.
   */
  /*
   * `Esc` é o único atalho que vale COM foco em texto (`whileTyping`): ele é a saída, e exigir
   * desfocar antes de poder sair seria o oposto de uma saída.
   */
  keys.bind({ key: 'Escape', whileTyping: true, label: 'ESC SAIR' }, () => {
    if (systray?.isOpen()) {
      // Primeiro da cadeia: o popover é sempre o gesto mais recente quando está aberto, e a
      // ordem do Esc é desfazer o último passo antes dos anteriores.
      systray.close();
    } else if (surface.closeTop()) {
      /*
       * Painéis fecham em CASCATA, um Esc por painel, do topo para baixo (LIFO).
       *
       * `closeTop` já devolve se havia algo a fechar, então ele é a própria condição — perguntar
       * antes e fechar depois abriria espaço para os dois discordarem. Painel aberto sobre painel
       * é caso normal, e fechar a pilha inteira num Esc só transformaria "voltar um passo" em
       * "perder o contexto todo".
       */
    } else if (answer.isInspecting()) {
      answer.close();
    } else if (api.isStreaming()) {
      api.abort();
      emit({ t: 'state', state: 'idle', label: 'ABORTADO' });
      emit({ t: 'done' });
    } else if (answer.hasAnswer()) {
      answer.dismiss();
      terminal.focus();
    } else if (router.route() !== ROUTE_ROOT) {
      router.navigate(ROUTE_ROOT);
    } else {
      terminal.clearInput();
    }
    audio.click({ frequency: 165, gain: 0.05, decay: 0.5 }); // 55×3 — saída, grave
  });

  keys.bind({ code: 'Tab', label: 'TAB CINEMA' }, () => {
    cinematic = !cinematic;
    prefs.set('view.cinematic', cinematic);
    document.body.classList.toggle('cinematic', cinematic);
    ui('cinematic', { on: cinematic });
    audio.click({ frequency: cinematic ? 165 : 440, gain: 0.05, decay: 0.9 });
  });

  /*
   * ⌘M é também o caminho de VOLTA de quem escolheu "IGNORAR" no boot.
   *
   * Quem ignorou entrou sem `audio.enable()`, então o `AudioContext` nem existe: só devolver o
   * volume não produziria som nenhum, e o atalho falharia em silêncio — a pior forma de falhar,
   * porque a tela diria "não mudo" com o alto-falante calado. A tecla é gesto do usuário, que é
   * exatamente o que a política de autoplay pede, então dá para ligar aqui mesmo.
   */
  keys.bind({ code: 'KeyM', meta: true, label: '⌘M MUDO' }, async () => {
    muted = !muted;
    prefs.set('audio.muted', muted);
    if (!muted && !audio.isEnabled()) {
      try {
        await audio.enable();
      } catch (error) {
        console.warn('[audio] não destravou no ⌘M', error);
      }
    }
    // Volta ao volume afinado, não a uma constante: mudo é toggle, não reset.
    audio.setVolume(muted ? 0 : tuning.get('volume'));
  });

  keys.bind({ code: 'KeyR', alt: true, label: 'ALT+R CÂMERA' }, () => scene.release());

  /*
   * ⌘S grava o enquadramento. Vale COM foco no prompt (`whileTyping`) porque o modificador não
   * disputa caractere nenhum — é a mesma regra que fez ⌘G entrar e `G` sair.
   *
   * O salvamento também acontece sozinho (a cada 5s e ao esconder a aba), mas silencioso: o
   * atalho existe para o operador CONFIRMAR que o enquadramento que ele acabou de compor está
   * guardado, e confirmação sem retorno visível não confirma nada. Por isso a nota sai nos dois
   * casos, dizendo qual foi.
   */
  keys.bind({ code: 'KeyS', meta: true, whileTyping: true, label: '⌘S ÓRBITA' }, () => {
    const saved = scene.saveOrbit();
    streams.note(saved ? 'ÓRBITA DA CÂMERA GRAVADA' : 'ÓRBITA JÁ ESTAVA GRAVADA', 'good');
    audio.click({ frequency: 660, gain: 0.045, decay: 0.35 });
  });
}

/**
 * Reaplica o que estava aberto/ligado na sessão anterior.
 *
 * Roda DEPOIS do registro dos painéis e ANTES do engate: no engate o operador já vê a tela
 * como deixou. O volume é o único que não se restaura aqui — quem manda nele é o `tuning`, e
 * o mudo apenas o zera temporariamente.
 */
function restorePrefs(panels, audio) {
  if (prefs.get('view.cinematic')) {
    document.body.classList.add('cinematic');
    ui('cinematic', { on: true });
  }
  if (prefs.get('audio.muted')) audio.setVolume(0);
  for (const [name, panel] of Object.entries(panels)) {
    if (prefs.get(`panel.${name}`)) panel?.toggle?.();
  }
}

/**
 * A dock: os apps como destinos, com o atalho numérico visível.
 *
 * É o equivalente da barra de tarefas — e como cada item também É um corpo no espaço, clicar
 * aqui e clicar no corpo levam ao mesmo lugar pelo mesmo caminho (`router.navigate`).
 */
function createDock(root, apps) {
  const dock = root.querySelector('[data-dock]');
  const items = new Map();

  // A dock é o primitivo `select`: uma rota ativa entre N é um conjunto exclusivo.
  const home = button({ variant: 'select', size: 'sm', data: { app: ROUTE_ROOT } });
  home.append(
    Object.assign(document.createElement('span'), { className: 'dock-key', textContent: '⌂' }),
    Object.assign(document.createElement('span'), { textContent: 'SISTEMA' })
  );
  home.addEventListener('click', () => (window.location.hash = '#/'));
  dock.append(home);
  items.set(ROUTE_ROOT, home);

  apps.forEach((app, index) => {
    const item = button({
      variant: 'select',
      size: 'sm',
      title: app.tagline,
      // O acento é a cor do app. É o que faz a dock reusar a variante em vez de forkar.
      accent: `#${app.color.toString(16).padStart(6, '0')}`,
      data: { app: app.id },
    });
    item.append(
      Object.assign(document.createElement('span'), { className: 'dock-dot' }),
      Object.assign(document.createElement('span'), { textContent: app.name }),
      Object.assign(document.createElement('span'), { className: 'dock-key', textContent: String(index + 1) })
    );
    item.addEventListener('click', () => (window.location.hash = `#/${app.id}`));
    dock.append(item);
    items.set(app.id, item);
  });

  return {
    setActive(id) {
      for (const [key, item] of items) setOn(item, key === id);
    },
  };
}

main().catch((error) => {
  console.error('[espatial] falha na inicialização', error);
  api.reportClient({ boot: 'error' });
  /*
   * Diga na TELA, não só no console.
   *
   * Este `catch` já existia e engolia o erro para a interface: qualquer exceção no meio do
   * `main` deixava a tela de boot exibindo "verificando subsistemas…" para sempre. A guarda
   * clássica no `index.html` cobre o que acontece ANTES do módulo rodar; esta cobre o que
   * acontece depois. As duas escrevem no mesmo lugar porque, para quem olha, é a mesma falha.
   */
  const status = bootRoot?.querySelector('[data-boot-status]');
  if (!status) return;
  status.textContent = `falha ao iniciar: ${error?.message || error}`;
  status.style.color = 'var(--bad)';
});
