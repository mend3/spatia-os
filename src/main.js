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
import * as saudeStore from './core/saude.js';
import * as session from './core/session.js';
import * as tela from './core/tela.js';
import * as attention from './core/attention.js';
import * as api from './core/api.js';
import { createScene } from './space/scene.js';
import { createAudio } from './audio/engine.js';
import { createFrame, AFERICAO_MS } from './hud/frame.js';
import { createStreams } from './hud/streams.js';
import { createAnswer } from './hud/answer.js';
import { createTerminal } from './hud/terminal.js';
import { createBoot } from './hud/boot.js';
import { createControls } from './hud/controls.js';
import { createPermissions } from './hud/permissions.js';
import { createVoice } from './hud/voice.js';
import { createSpeechPanel } from './hud/speech-panel.js';
import { createSystray } from './hud/systray.js';
import { createCenaSwitch } from './hud/cena.js';
import * as favoritos from './hud/favoritos-ui.js';
import { APARENCIAS } from './space/favoritos.js';
import { registrarTipoDeCorpo } from './core/cena-atual.js';
import { createYield } from './hud/yield.js';
import { createWidgetHost } from './kernel/widgets.js';
import { createRouter, ROUTE_ROOT } from './kernel/router.js';
import { listApps, listWidgets, getApp } from './kernel/registry.js';
import { registerApps, SYSTEM_VIEW, closeFileReader } from './apps/index.js';
import * as tuning from './core/tuning.js';
import * as prefs from './core/prefs.js';
import * as motion from './core/motion.js';
import * as keys from './core/keys.js';
import * as profiles from './core/profiles.js';
import { button, setOn } from './hud/button.js';
import { plural } from './hud/dom.js';
import * as surface from './hud/surface.js';

const hud = document.getElementById('hud');
const canvas = document.getElementById('space');
const bootRoot = document.getElementById('boot');
const bodyLayer = document.getElementById('bodies');

/* ⟦sonda-hud⟧ ═══════════════════════════════════════════════════════════════════════════════
 *
 * A SONDA DA HUD — quanto da janela a interface reivindica AO PONTEIRO, e o que está recolhido.
 *
 * ☠️ **A grandeza é ÁREA QUE ACEITA PONTEIRO, nunca área desenhada.** Todo ouvinte de gesto da
 * cena está preso ao `canvas` (`space/scene.js`), e não há em `window` quem reencaminhe o gesto:
 * um retângulo com `pointer-events: auto` por cima do céu não DISPUTA o clique — ele impede que
 * o evento exista para a cena, sem fallback e sem nada acusar. Medir pixel pintado responderia outra
 * pergunta, e responderia errado nos dois sentidos: a HUD é hairline (quase toda transparente,
 * e mesmo assim reivindica) e o painel de palco tem fundo opaco que às vezes CEDE o ponteiro.
 *
 * O instrumento é `document.elementFromPoint`, que já honra `pointer-events` por especificação —
 * ele devolve quem RECEBERIA o gesto naquele ponto, e é o mesmo teste que diagnosticou a zona
 * morta do leitor de arquivo. A varredura é uma grade de passo DECLARADO sobre a janela inteira;
 * ela substitui os 45 pontos avulsos de `hud/yield.js` por comportamento permanente.
 *
 * ## Nada aqui é lista branca
 *
 * A atribuição não escolhe elementos: varre a janela toda e sobe do alvo até achar IDENTIDADE
 * declarada (`data-widget` · `data-slot` · `data-surface` · qualquer `data-*` · `id` · um marco
 * de HTML). Quem não tem identidade nenhuma é nomeado PELA FORMA e entra em `desconhecidos` —
 * forma nova ACUSA, nunca é tolerada em silêncio. E `conservacao` confere que nenhum ponto se
 * perdeu no caminho: soma dos donos + canvas + fundo + nulos tem de dar `pontos`.
 *
 * ## Recolhido ≠ não montado ≠ sem controle
 *
 * `espatial.collapsed.v1` faz widget recolhido PARECER vazio, e por isso "o painel não apareceu"
 * tem causas indistinguíveis a olho. Elas saem separadas, e cada uma é um fato diferente:
 *
 * | campo | o que significa |
 * |---|---|
 * | `recolhidos` | montado nesta rota, e o operador fechou (`data-collapsed="true"`) |
 * | `abertos` | montado e com corpo visível |
 * | `semControle` | montado e sem botão de recolher — é a fenda `stage`, que não tem rótulo |
 * | `naoMontados` | registrado no kernel e ausente desta rota — decisão do manifesto |
 * | `ausentes` | ☠️ **declarado pela rota e ausente do DOM** — isto é defeito, não decisão |
 * | `recolhidosForaDaRota` | o operador fechou, e o widget nem está aqui para parecer vazio |
 *
 * ## Procedência de todo número
 *
 * `passoPx`, `colunas`, `linhas` e `pontos` voltam junto: qualquer fração daqui se refaz por
 * `pontos_do_dono / pontos`. Fração de ponto é fração de ÁREA porque a grade é uniforme — as
 * células da borda direita e de baixo são parciais, e é por isso que `colunas`/`linhas` saem por
 * `ceil` e o ponto é o centro da célula, clampeado dentro da janela.
 *
 * ## O que ela NÃO responde
 *
 * - **Não diz o que a cena desenhou.** Mede LAYOUT, não quadro; aba oculta não invalida esta
 *   medida (o layout continua vivo), mas também não a torna prova de que o céu está no ar.
 * - **Não navega.** Mede a rota que está na tela e CARIMBA `rota` no resultado. Para varrer as
 *   dez, navegue e colecione — a marca de rota é o que impede misturar duas telas num número só:
 *
 *       const r = []; for (const id of ['', 'files', 'system', 'web', 'bridge', 'journal',
 *                                       'metrics', 'security', 'activity', 'storage']) {
 *         location.hash = `#/${id}`; await new Promise((f) => setTimeout(f, 900));
 *         r.push(spatia.hud());
 *       }
 *       console.table(r.map((h) => ({ rota: h.rota.id, ponteiro: h.ponteiro.fracaoReivindicada,
 *                                     recolhidos: h.widgets.recolhidos.length,
 *                                     ausentes: h.widgets.ausentes.join(',') })));
 *
 * - **Não julga legibilidade.** "O painel está na frente" e "o painel tem o mesmo âmbar do anel"
 *   dão a mesma foto; esta sonda separa o primeiro do segundo e não opina sobre o segundo.
 */

/** Passo padrão da varredura, em px CSS. Sobrepõe-se com `spatia.hud({ passo: 8 })`. */
const SONDA_PASSO_PX = 16;

/**
 * Marcos de HTML que já SÃO identidade, quando não há `data-*` nem `id` no caminho.
 *
 * Não é lista de quem pode reivindicar o ponteiro — todo elemento é varrido de qualquer jeito.
 * É o vocabulário com que a atribuição NOMEIA quem encontrou; fora dele o dono cai em
 * `desconhecido:`, que é o campo que acusa.
 */
const SONDA_MARCOS = new Set(['HEADER', 'FOOTER', 'NAV', 'MAIN', 'ASIDE', 'DIALOG', 'FORM']);

/** A identidade DECLARADA de um nó, da mais específica para a mais grosseira, ou `null`. */
function sondaIdentidade(no) {
  const dados = no.dataset || {};
  if (dados.widget) return `widget:${dados.widget}`;
  if (dados.slot) return `fenda:${dados.slot}`;
  if (dados.surface) return `superficie:${dados.surface}`;
  const chaves = Object.keys(dados);
  if (chaves.length) return `data-${chaves[0]}`;
  if (no.id) return `#${no.id}`;
  if (SONDA_MARCOS.has(no.tagName)) return String(no.tagName).toLowerCase();
  return null;
}

/** O nome da FORMA de quem não tem identidade — para acusar em vez de sumir com o ponto. */
function sondaForma(no) {
  const classe = typeof no.className === 'string' ? no.className.trim().split(/\s+/)[0] : '';
  const tag = String(no.tagName || '?').toLowerCase();
  return `desconhecido:${tag}${classe ? `.${classe}` : ''}`;
}

const sondaFrac = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
const sondaPx = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

/** A caixa de um nó em px CSS e em fração da janela. */
function sondaCaixa(no, janela) {
  const r = no.getBoundingClientRect();
  return {
    larguraPx: sondaPx(r.width),
    alturaPx: sondaPx(r.height),
    esquerdaPx: sondaPx(r.left),
    topoPx: sondaPx(r.top),
    fracaoLargura: sondaFrac(r.width / janela.larguraPx),
    fracaoAltura: sondaFrac(r.height / janela.alturaPx),
    fracaoJanela: sondaFrac((r.width * r.height) / janela.areaPx2),
  };
}

/**
 * O QUINTO dono do estado de tela, lido cru.
 *
 * `formato` distingue os três estados que colapsariam em "vazio": `ausente` é o operador que
 * nunca decidiu (`fechadas: []` é medida), `ilegivel` é armazém que não respondeu (`null`, que
 * é *"não medi"*), e `lista` é o formato antigo que `kernel/widgets.js` ainda aceita — lê-lo
 * como `{}` devolveria zero recolhido para quem tem todos fechados.
 */
function sondaOperador(armazem) {
  let bruto;
  try {
    bruto = JSON.parse(armazem?.getItem('espatial.collapsed.v1') ?? 'null');
  } catch {
    return { formato: 'ilegivel', fechadas: null, abertas: null };
  }
  if (bruto === null || bruto === undefined) return { formato: 'ausente', fechadas: [], abertas: [] };
  if (Array.isArray(bruto)) return { formato: 'lista', fechadas: [...bruto], abertas: [] };
  return {
    formato: 'v1',
    fechadas: [...(bruto.fechadas || [])],
    abertas: [...(bruto.abertas || [])],
  };
}

/**
 * @param {object} env
 * @param {Document} env.doc
 * @param {Window} env.win
 * @param {Element} env.canvas       o `<canvas>` da cena — o único destino que NÃO é reivindicação
 * @param {Element} env.hud          a raiz da HUD, para ler a elevação em vigor
 * @param {object} env.rota          `tela.estado().rota` — o carimbo do resultado
 * @param {string[]} env.montados    o que o HOST diz estar montado (cruzado com o DOM)
 * @param {string[]} env.registrados todo widget conhecido pelo kernel
 * @param {string[]} env.declarados  o que ESTA rota declara montar
 * @param {Storage} env.armazem      onde `espatial.collapsed.v1` mora
 * @param {object} [opcoes]
 * @param {number} [opcoes.passo]    passo da grade, em px CSS
 */
export function medirHud(env, opcoes = {}) {
  const { doc, win, canvas: tela3d, hud: raizHud, rota, montados, registrados, declarados, armazem } = env;
  const larguraPx = win.innerWidth;
  const alturaPx = win.innerHeight;
  const janela = {
    larguraPx,
    alturaPx,
    areaPx2: larguraPx * alturaPx,
    dpr: Number.isFinite(win.devicePixelRatio) ? win.devicePixelRatio : null,
  };
  const estilo = (no) => (no ? win.getComputedStyle(no) : null);
  const raiz = doc.documentElement;

  // ───────────────────────────────────────────────── a varredura, ponto a ponto
  const passoPx = Math.max(2, Math.round(Number(opcoes.passo) || SONDA_PASSO_PX));
  const colunas = Math.max(1, Math.ceil(larguraPx / passoPx));
  const linhas = Math.max(1, Math.ceil(alturaPx / passoPx));
  const pontos = colunas * linhas;

  const porDono = new Map();
  const porFenda = new Map();
  let aoCanvas = 0;
  let aoFundo = 0;
  let nulos = 0;
  let reivindicados = 0;

  for (let i = 0; i < colunas; i++) {
    const x = Math.min(larguraPx - 0.5, (i + 0.5) * passoPx);
    for (let j = 0; j < linhas; j++) {
      const y = Math.min(alturaPx - 0.5, (j + 0.5) * passoPx);
      const alvo = doc.elementFromPoint(x, y);
      // `null` é ponto fora do documento; contá-lo como canvas inventaria gesto que chega.
      if (!alvo) {
        nulos++;
        continue;
      }
      if (alvo === raiz || alvo === doc.body) {
        aoFundo++;
        continue;
      }

      let dono = null;
      let fenda = null;
      let noCanvas = false;
      for (let no = alvo; no; no = no.parentElement) {
        if (no === tela3d) {
          noCanvas = true;
          break;
        }
        if (!dono) dono = sondaIdentidade(no);
        if (!fenda && no.dataset?.slot) fenda = no.dataset.slot;
        if (no === raiz) break;
      }
      if (noCanvas) {
        aoCanvas++;
        continue;
      }

      reivindicados++;
      const chave = dono || sondaForma(alvo);
      const registro = porDono.get(chave) || { dono: chave, fenda: fenda ?? null, pontos: 0 };
      registro.pontos++;
      porDono.set(chave, registro);
      const chaveFenda = fenda ?? 'fora';
      porFenda.set(chaveFenda, (porFenda.get(chaveFenda) ?? 0) + 1);
    }
  }

  const donos = [...porDono.values()]
    .map((d) => ({ ...d, fracaoJanela: sondaFrac(d.pontos / pontos) }))
    .sort((a, b) => b.pontos - a.pontos);
  const somaDonos = donos.reduce((t, d) => t + d.pontos, 0);
  const fendasAoPonteiro = Object.fromEntries(
    [...porFenda].map(([k, v]) => [k, { pontos: v, fracaoJanela: sondaFrac(v / pontos) }])
  );

  const ponteiro = {
    passoPx,
    colunas,
    linhas,
    pontos,
    aoCanvas,
    aoFundo,
    nulos,
    reivindicados,
    fracaoAoCanvas: sondaFrac(aoCanvas / pontos),
    fracaoReivindicada: sondaFrac(reivindicados / pontos),
    donos,
    /** ☠️ Forma que a atribuição não soube nomear. Vazio é o normal; cheio é tarefa. */
    desconhecidos: donos.filter((d) => d.dono.startsWith('desconhecido:')),
    porFenda: fendasAoPonteiro,
    /** Nenhum ponto se perde: se `bate` for falso, todo número acima está sob suspeita. */
    conservacao: {
      pontos,
      soma: aoCanvas + aoFundo + reivindicados + nulos,
      somaDonos,
      bate: aoCanvas + aoFundo + reivindicados + nulos === pontos && somaDonos === reivindicados,
    },
  };

  /**
   * A ALTURA EM QUE UM WIDGET DEIXA DE AFIRMAR — uma linha do próprio texto dele.
   *
   * ☠️ **Um item de flex ENCOLHE, e o que perde a disputa não fica menor: fica com ZERO.** Um
   * gráfico espremido some inteiro enquanto o rótulo dele continua na tela, sem erro nenhum — a
   * sonda diz `montado`, o operador não vê nada, e as duas afirmações são verdadeiras.
   *
   * ⚠️ **O piso é DERIVADO, nunca escolhido:** é `line-height` computado do próprio corpo, e
   * `fontSize × 1,2` quando ele sai `normal`. Um número fixo aqui valeria para uma fenda e mentiria
   * na outra — a legenda de 9 px e o gráfico de 14 px não têm o mesmo mínimo legível.
   */
  const umaLinhaPx = (no) => {
    const est = estilo(no);
    if (!est) return null;
    const lh = Number.parseFloat(est.lineHeight);
    if (Number.isFinite(lh)) return lh;
    const fs = Number.parseFloat(est.fontSize);
    return Number.isFinite(fs) ? fs * 1.2 : null;
  };

  /** Um widget montado, ABERTO, e desenhando menos que uma linha. */
  const espremido = (no) => {
    if (no.dataset.collapsed === 'true') return false;
    const corpo = no.querySelector('.widget-body');
    if (!corpo) return false;
    const alturaCorpo = corpo.getBoundingClientRect().height;
    const piso = umaLinhaPx(corpo);
    return Number.isFinite(alturaCorpo) && Number.isFinite(piso) && piso > 0 && alturaCorpo < piso;
  };

  // ───────────────────────────────────────────────────── a geometria das fendas
  const fendas = [...doc.querySelectorAll('[data-slot]')].map((no) => {
    const est = estilo(no);
    const nosDaFenda = [...no.querySelectorAll('[data-widget]')];
    const abertos = nosDaFenda.filter((w) => w.dataset.collapsed !== 'true');
    const alturaPx = no.getBoundingClientRect().height;
    /*
     * O ORÇAMENTO DE ALTURA — o termo que a semântica das fendas não tinha.
     *
     * Ela diz o que cada fenda SIGNIFICA e não dizia quantos widgets cabem nela. `pisoPx` é o que
     * os abertos exigem para todos continuarem afirmando (uma linha cada, mais o rótulo que já
     * ocupa espaço); `cabe` responde a pergunta que o acordeão resolvia em runtime sem nunca
     * enunciar.
     */
    let pisoPx = 0;
    let pedidoPx = 0;
    for (const w of abertos) {
      const corpo = w.querySelector('.widget-body');
      const rotulo = w.querySelector('.label');
      const linha = corpo ? umaLinhaPx(corpo) : null;
      const alturaRotulo = rotulo ? rotulo.getBoundingClientRect().height : 0;
      const cabecalho = Number.isFinite(alturaRotulo) ? alturaRotulo : 0;
      pisoPx += (Number.isFinite(linha) ? linha : 0) + cabecalho;
      /*
       * `scrollHeight` é o que o conteúdo PEDE, e o `getBoundingClientRect` é o que ele RECEBEU.
       * ⚠️ Reserva para a altura recebida: o DOM de mentira dos oráculos não tem `scrollHeight`, e
       * sem a reserva a demanda sairia zero num ambiente que mede tudo o mais corretamente.
       */
      const pedido = corpo ? (corpo.scrollHeight ?? corpo.getBoundingClientRect().height) : 0;
      pedidoPx += (Number.isFinite(pedido) ? pedido : 0) + cabecalho;
    }
    return {
      fenda: no.dataset.slot,
      ...sondaCaixa(no, janela),
      display: est ? est.display : null,
      montados: nosDaFenda.map((w) => w.dataset.widget),
      aoPonteiro: fendasAoPonteiro[no.dataset.slot] ?? { pontos: 0, fracaoJanela: 0 },
      orcamento: {
        alturaPx: sondaPx(alturaPx),
        abertos: abertos.length,
        /** O que os abertos exigem para todos continuarem AFIRMANDO: uma linha e o rótulo, cada. */
        pisoPx: sondaPx(pisoPx),
        /** O que o conteúdo deles PEDE. Acima da altura, alguém rola ou é podado — não é defeito. */
        pedidoPx: sondaPx(pedidoPx),
        /** ☠️ `false` = há aberto demais, e alguém VAI parar de afirmar. Isso é defeito. */
        cabe: Number.isFinite(alturaPx) && alturaPx > 0 ? pisoPx <= alturaPx : null,
        /** Quanto do que o conteúdo pede a fenda entrega. Acima de 1, há rolagem ou poda. */
        pressao: Number.isFinite(alturaPx) && alturaPx > 0 ? sondaFrac(pedidoPx / alturaPx) : null,
        espremidos: abertos.filter(espremido).map((w) => w.dataset.widget),
      },
    };
  });

  /*
   * O painel de palco: `null` quando não há um montado, nunca um objeto de zeros.
   *
   * `aceitaPonteiro` é lido do estilo em vigor, não deduzido: o escape do CSS só desarma o
   * painel quando ele está VAZIO, e a diferença entre "existe e cede" e "existe e captura" é
   * exatamente a zona morta sobre o corpo em foco.
   */
  const painelNo = doc.querySelector('[data-panel-surface]');
  const estPainel = estilo(painelNo);
  const painelDePalco = painelNo
    ? {
        widget: painelNo.dataset.widget ?? null,
        ...sondaCaixa(painelNo, janela),
        pointerEvents: estPainel ? estPainel.pointerEvents : null,
        aceitaPonteiro: estPainel ? estPainel.pointerEvents !== 'none' : null,
        aoPonteiro: painelNo.dataset.widget
          ? (porDono.get(`widget:${painelNo.dataset.widget}`)?.pontos ?? 0)
          : null,
      }
    : null;

  // ────────────────────────────────────────── montado, recolhido e não montado
  const nos = [...doc.querySelectorAll('[data-widget]')];
  const montadosNoDom = nos.map((no) => no.dataset.widget);
  const conjMontados = new Set(montadosNoDom);
  const decl = [...(declarados ?? [])];
  const operador = sondaOperador(armazem);
  const doHost = [...(montados ?? [])];

  const widgets = {
    declarados: decl,
    montados: montadosNoDom,
    recolhidos: nos.filter((n) => n.dataset.collapsed === 'true').map((n) => n.dataset.widget),
    abertos: nos.filter((n) => n.dataset.collapsed === 'false').map((n) => n.dataset.widget),
    semControle: nos.filter((n) => n.dataset.collapsed === undefined).map((n) => n.dataset.widget),
    /** ☠️ Declarado pela rota e AUSENTE do DOM. Não é o operador: é defeito. */
    ausentes: decl.filter((id) => !conjMontados.has(id)),
    /**
     * ☠️ **A QUARTA CAUSA: montado, ABERTO, e desenhando menos que uma linha.**
     *
     * `montado` e `aberto` continuam verdadeiros e o operador não vê nada — nenhuma das outras
     * três categorias o alcança, porque ele não foi recolhido, não deixou de ser declarado e está
     * no DOM. É o mesmo formato de «declarado sem leitor» um nível acima: declarado, montado, e
     * sem pixel.
     */
    espremidos: nos.filter(espremido).map((n) => n.dataset.widget),
    /** Montado sem a rota ter declarado — a outra ponta do mesmo portão que falta. */
    intrusos: montadosNoDom.filter((id) => !decl.includes(id)),
    naoMontados: [...(registrados ?? [])].filter((id) => !conjMontados.has(id)),
    operador,
    recolhidosForaDaRota: (operador.fechadas ?? []).filter((id) => !conjMontados.has(id)),
    /** O host e o DOM discordarem é o host tendo perdido um nó, ou o DOM tendo ganhado um. */
    divergenciaHost: {
      soNoHost: doHost.filter((id) => !conjMontados.has(id)),
      soNoDom: montadosNoDom.filter((id) => !doHost.includes(id)),
    },
  };

  /*
   * A lista de referências, medida em vez de estimada.
   *
   * `alturaLinhaPx` é a MEDIDA da caixa de uma linha, não `line-height` — nenhum é declarado
   * para `.source`, e o computado devolve a palavra `normal` em vez de um número. `null` aqui é
   * *"não há linha para medir"*, e nunca `0`.
   *
   * ⚠️ `ancorado` separa a lista que está NA TELA da que está estacionada no sótão
   * (`.attic`, em `left: -9999px`): lá a caixa existe, tem 320 px de largura, e a altura dela
   * não é a altura que o palco produziria.
   */
  const contFontes = doc.querySelector('[data-sources]');
  let fontes = null;
  if (contFontes) {
    const linhasFonte = [...contFontes.querySelectorAll('.source')];
    const caixa = sondaCaixa(contFontes, janela);
    const est = estilo(contFontes);
    const alturas = linhasFonte
      .map((l) => l.getBoundingClientRect().height)
      .filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b);
    const mediana = alturas.length ? alturas[Math.floor(alturas.length / 2)] : null;
    const estLinha = linhasFonte.length ? estilo(linhasFonte[0]) : null;
    const fontePx = estLinha ? Number.parseFloat(estLinha.fontSize) : null;
    fontes = {
      n: linhasFonte.length,
      ancorado: caixa.esquerdaPx !== null && caixa.esquerdaPx > -1000,
      caixa,
      alturaLinhaPx: sondaPx(mediana),
      fontePx: Number.isFinite(fontePx) ? fontePx : null,
      razaoLinha:
        Number.isFinite(mediana) && Number.isFinite(fontePx) && fontePx > 0
          ? sondaFrac(mediana / fontePx)
          : null,
      lineHeightComputado: estLinha ? estLinha.lineHeight : null,
      maxHeight: est ? est.maxHeight : null,
      overflowY: est ? est.overflowY : null,
    };
  }

  const estHud = estilo(raizHud);
  return {
    quando: new Date().toISOString(),
    janela,
    rota: { ...(rota ?? {}) },
    ponteiro,
    fendas,
    painelDePalco,
    widgets,
    fontes,
    /*
     * A elevação do `#hud` é `:has()`-ada no painel de palco, e o comentário do CSS declara que
     * elevá-la sempre "mataria a ilusão de profundidade". Com um painel montado ela está de pé.
     */
    elevacao: {
      hudZIndex: estHud ? estHud.zIndex : null,
      hudPointerEvents: estHud ? estHud.pointerEvents : null,
      porPainelDePalco: Boolean(painelNo),
    },
  };
}
/* ⟦/sonda-hud⟧ ═════════════════════════════════════════════════════════════════════════════ */

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
  /*
   * Before the scene exists, and that ordering is the whole point: `attention` is a pure observer
   * of `ui.links`, and the emission it must not miss is the very first one the scene produces.
   */
  attention.install();
  keys.install();

  /*
   * A DOCK SE SUSPENDE QUANDO ALGO ESTÁ EM CURSO.
   *
   * Ela responde "para onde eu vou", e essa pergunta só existe em repouso. Com um astro travado
   * ou um painel aberto o operador já escolheu o objeto, e a dock passa a competir por atenção
   * na faixa logo acima do prompt — que é onde ele está lendo.
   *
   * Os dois fatos vêm de onde já são verdade: `ui.node-focus` é o mesmo evento que trava a
   * câmera, e a pilha de painéis vive no `session`. Nenhum estado novo, nada para dessincronizar.
   * HOVER de propósito NÃO conta: passar o cursor é gesto de passagem, e a dock piscaria.
   */
  let astroTravado = false;
  const suspendeDock = () => {
    const ocupado = astroTravado || session.snapshot().panels.length > 0;
    document.body.classList.toggle('at-work', ocupado);
  };
  on('ui.node-focus', ({ source }) => {
    astroTravado = Boolean(source);
    suspendeDock();
  });
  on('ui.session', suspendeDock);

  const audio = createAudio();
  /*
   * A HUD cede onde há sinal acionável. Os trilhos laterais são os únicos que disputam espaço
   * com a órbita — cabeçalho e rodapé ficam fora da casca de nós.
   */
  const hudYield = createYield([...document.querySelectorAll('aside.slot')]);

  /*
   * A HUD é VIDRO na frente da cena, e o deslocamento dela diz isso.
   *
   * Ela anda MUITO pouco — 3px no extremo — e no MESMO sentido do ponteiro, ao contrário da
   * cena. Duas razões: uma superfície colada ao observador não tem paralaxe (ela viaja com o
   * olho), e o pequeno acompanhamento é o que a lê como camada separada em vez de textura
   * pintada sobre o universo. Mais que isso e o texto começa a "nadar", que cansa em minutos.
   *
   * `will-change` de propósito: sem ele o browser refaz layout do trilho a cada quadro de
   * movimento do mouse, e o custo aparece justamente no gesto mais frequente da interface.
   */
  const hudLayer = document.getElementById('hud');
  if (hudLayer && !motion.isReduced()) {
    hudLayer.style.willChange = 'transform';
    let alvoX = 0;
    let alvoY = 0;
    let atualX = 0;
    let atualY = 0;
    window.addEventListener(
      'pointermove',
      (event) => {
        alvoX = (event.clientX / window.innerWidth) * 2 - 1;
        alvoY = (event.clientY / window.innerHeight) * 2 - 1;
      },
      { passive: true }
    );
    const seguir = () => {
      // Mesma suavização por tempo da cena; ponteiro cru faria o texto tremer.
      atualX += (alvoX - atualX) * 0.06;
      atualY += (alvoY - atualY) * 0.06;
      hudLayer.style.transform = `translate3d(${(atualX * 3).toFixed(2)}px, ${(atualY * 3).toFixed(2)}px, 0)`;
      requestAnimationFrame(seguir);
    };
    requestAnimationFrame(seguir);
  }
  const scene = createScene(canvas, { labelLayer: bodyLayer, signals: hudYield });
  /*
   * Antes do router e do boot, de propósito: `tela` é espelho de `ui.scene-mode` e `ui.route`, e
   * a emissão que ela não pode perder é a primeira — a que o `router.start` produz.
   *
   * `scene.mode()` é o único fato daqui que não chega por evento: a cena só anuncia quando TROCA.
   * Quem o conhece declara uma vez, em vez de o estado nascer com um palpite.
   */
  tela.install({ cena: scene.mode() });
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
  /*
   * `onChange` estava vago, e por isso a rota `/api/mcp` não cumpria o motivo pelo qual ela
   * existe separada — `server/app.py` diz, na própria rota, que o painel de MCP "precisa
   * reconsultar sozinho quando a fonte muda". Mudar a fonte de settings e ver o inventário
   * velho é a tela afirmando um estado que já não é o do servidor.
   */
  const perms = createPermissions(hud, { onChange: () => ui('permissions-changed', {}) });
  const speechPanel = createSpeechPanel(hud);
  const panels = { tuning: controls, permissions: perms, speech: speechPanel };
  /*
   * Depois dos painéis, de propósito: cada um deles procura o próprio gatilho por
   * `querySelector` no `create*`, e os gatilhos agora moram dentro dos popovers da systray.
   * A ordem não afeta a busca (o HTML já está no DOM), mas mantém a leitura honesta — a
   * systray é a moldura dos controles, não a dona deles.
   */
  const systray = createSystray(hud);
  /*
   * O switcher de cena. Ele vem depois da systray porque depende de `scene`, e a nota que ele
   * publica na timeline é o que torna a troca um EVENTO em vez de um piscar — o céu inteiro muda,
   * e uma mudança dessas sem registro parece defeito.
   */
  // A HUD passa a poder perguntar o tipo à CENA, em vez de deduzi-lo do catálogo antigo.
  registrarTipoDeCorpo((source) => scene.bodyTypeOf(source));
  /*
   * O guardador das MARCAS, com o `prefs` injetado — o modelo é puro e nunca importa o storage.
   *
   * Antes de qualquer painel, porque o widget de CONTEXTO desenha a marca no primeiro `mount` e um
   * store ligado depois faria o painel nascer dizendo "favoritos não ligados" na única tela em que
   * ninguém está olhando para descobrir o motivo.
   */
  favoritos.instalarFavoritos(prefs);

  const cenaSwitch = createCenaSwitch(hud, {
    scene,
    onChange: (modo) => {
      const s = scene.universeStats?.();
      streams.note(
        modo === 'universo'
          ? `CENA UNIVERSO · ${s?.sistemas ?? 0} SISTEMAS · ${s?.corpos ?? 0} CORPOS${s?.colisoes ? ` · ${s.colisoes} COLISÕES` : ''}`
          : 'CENA AGENTE · O NÚCLEO NO CENTRO',
        'good'
      );
    },
  });
  // A onda da HUD passa a ser desenhada com a amplitude real do áudio que o motor toca.
  const voice = createVoice(document, { onLevel: (level) => terminal.setLevel(level) });

  /*
   * ⚠️ OS APPS E OS INTERRUPTORES SAEM DO CÉU — decisão do usuário em 2026-08-07.
   *
   * A cena chamava `scene.installApps([...apps, ...controlBodies])` e o argumento era o da
   * metáfora: "num ambiente onde tudo é corpo em órbita, um interruptor escondido num canto é a
   * única coisa que não obedece à própria metáfora". A metáfora custava mais do que rendia — o
   * menu já existe em botões, e um corpo de UI no meio do céu compete por atenção com os astros
   * que são o conteúdo.
   *
   * `space/bodies.js` e o espécime `CORPOS DE APP` da bancada FICAM. Não é código morto por
   * esquecimento: é o desenho que sai da cena e continua desenhável, e apagá-lo perderia junto o
   * único lugar onde o octaedro de controle podia ser inspecionado. Voltar a montar é uma linha.
   *
   * Os quatro caminhos continuam abertos, conferidos um a um antes de remover: VOZ pelo botão de
   * microfone (`hud/voice.js:220`), PERMISSÕES e CONFIG VOZ pelos `bind` dos próprios painéis
   * (`hud/permissions.js:251`, `hud/speech-panel.js:295`) e AFINAR por `⌘G` (`hud/controls.js:117`).
   * Os apps continuam na dock. Nenhum deles dependia do corpo.
   *
   * Some com isto o `ui.toggle-control`: ele só nascia do clique num corpo de controle.
   */
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

  /*
   * ⚠️ **A tela de entrada é UMA, e ela é o `#boot`.** Camada de CHEGADA própria, sobre a cena já
   * desenhando, está refutada por uso: virava uma segunda parede entre o diagnóstico e o céu, e
   * afirmava (`CÉU`, `CORPUS`) o que esta tela agora afirma dentro do bloco `CÉU`. Duas telas
   * dizendo o mesmo fato é o pedágio que o princípio 11 recusa.
   */
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

  /*
   * O rótulo de hover não mora mais num balão flutuante NEM aqui.
   *
   * O balão nascia colado no rodapé, onde o dock do sistema passa por cima: o nome do arquivo
   * aparecia ilegível justamente no gesto em que se procura qual arquivo é aquele. Em vez de
   * caçar uma posição livre — que muda com o SO, com o tamanho da janela e com o que mais
   * estiver aberto — o retorno passou para uma área que já existe, é estável, e está vazia
   * exatamente enquanto ninguém abriu nada: o leitor central.
   *
   * Quem desenha é o widget `fs-content`, que assina o mesmo `ui.hover`. Este arquivo não
   * precisa mais participar.
   */

  installShortcuts(scene, audio, answer, terminal, router, streams, systray);

  /*
   * Uma janela para o contexto, no console.
   *
   * Instrumentação que não dá para inspecionar é instrumentação que ninguém confere — e store
   * que ninguém confere diverge da tela em silêncio, que é exatamente o defeito que ele existe
   * para impedir. Uma leitura só, sem estado escrito: `spatia.session()` e `spatia.state()`.
   * Não é API pública; é a janela de quem está depurando.
   */
  window.spatia = Object.freeze({
    session: () => session.snapshot(),
    state: () => state.snapshot(),
    /**
     * O que está na tela AGORA, de um lugar só: camada na frente, pilha, cena e rota.
     *
     * ⚠️ É a sonda que separa "o botão não fez nada" de "fez, e a tela não seguiu": camada, cena
     * e rota lidas em leituras diferentes podem discordar sem que nada acuse. Ver `core/tela.js`.
     */
    tela: () => tela.estado(),
    /**
     * Quanto da janela a HUD reivindica AO PONTEIRO nesta rota, e o que está recolhido.
     *
     * ☠️ A grandeza é área que ACEITA ponteiro, não área desenhada: um retângulo sobre o céu não
     * disputa o clique, ele cancela órbita, zoom e pick ali. Ver `medirHud`, acima, para a grade,
     * a atribuição sem lista branca e a receita de varrer as dez rotas.
     */
    hud: (opcoes) => {
      const atual = tela.estado().rota;
      return medirHud(
        {
          doc: document,
          win: window,
          canvas,
          hud,
          rota: atual,
          montados: host.mounted(),
          registrados: listWidgets().map((w) => w.id),
          /*
           * ⚠️ `rota.id` nulo é ANTES da primeira navegação, e aí a rota não declarou nada.
           * Devolver `SYSTEM_VIEW` aí inventaria nove `ausentes` — defeito onde só há ordem de
           * inicialização.
           */
          declarados:
            atual.id === null
              ? []
              : atual.id === ROUTE_ROOT
                ? SYSTEM_VIEW
                : (getApp(atual.id)?.widgets ?? []),
          armazem: window.localStorage,
        },
        opcoes
      );
    },
    /**
     * As MARCAS do operador: quem marcou, quando, de qual céu, e em que estado cada uma está.
     *
     * ⚠️ Ela distingue o que o modelo distingue e a tela desenha: `degradadas` conta a marca que não
     * vale mais AQUI, `foraDoCeu` a que foi feita em outro corpus, `ausentes` a que aponta para um
     * corpo que sumiu da topologia, e `emDisco` é `null` porque ninguém mediu o disco — não é `0`,
     * que diria "medi e não há". Ver `space/favoritos.js`.
     */
    favoritos: () => favoritos.sonda(),
    /** Custo da cadeia de pós-processamento, medido na hora. Ver `scene.sampleRenderCost`. */
    renderCost: (n) => scene.sampleRenderCost(n),
    /** Raio aparente, nível de detalhe e distância do planeta em foco — ou `null`. */
    planet: () => scene.planetProbe(),
    /** Onde o DOCUMENTO do corpo em foco está ancorado, e por quê. Ver `space/ancora-de-documento.js`. */
    ancora: () => scene.ancoraDoDocumento(),
    /** Quem oclui a emissão do buraco negro neste quadro, e quem competiu. */
    oclusor: () => scene.oclusor(),
    /**
     * O FUNDO, separando as cinco causas de "não vejo o background" — que a foto NÃO separa.
     *
     * `preferencia` desligada, `montado` falso, `visivel` falso, `ganho` zero e `textura` não
     * carregada produzem a MESMA tela preta, e cada uma tem conserto diferente. Ver `space/backdrop.js`.
     */
    fundo: () => scene.fundoProbe(),
    /** Tempo, taxa e instâncias que o campo de galáxias está de fato recebendo. */
    galaxy: () => scene.galaxyProbe(),
    /** Recuo × piso de detalhe de cada pele, com a tela de verdade. Ver `space/lod.js`. */
    lod: () => scene.lodProbe(),
    /**
     * Luas em órbita e seções que não couberam na janela Roche→Hill.
     *
     * ⚠️ Só a CENA sabe responder isto, e é por isso que a sonda existe: `moonsOf` precisa do RAIO
     * ORBITAL, que nasce em `graph.js:load` (de `recency`) e não existe no payload do servidor.
     * Um censo que chamasse `moonsOf` no nó cru recebe zero lua e conclui que o sistema está
     * morto — foi o que aconteceu ao medir a cobertura do fixture em 2026-08-07.
     */
    moons: () => scene.moonReport?.(),
    /** Lê — e, com argumento, força — a força do bloom. O teste do item #9. Ver `scene.bloomProbe`. */
    bloom: (ajuste) => scene.bloomProbe(ajuste),
    /** Bancada da camada 4: `spatia.core({ regime: 'thinking', tokens: 120000 })`. */
    core: (opcoes) => scene.blackHoleProbe(opcoes),
    /**
     * A/B dos dois termos que acendem a BORDA do planeta: `spatia.pele({ limbo: 0 })`.
     *
     * Sem argumento só lê. `limbo` é a cor do ar na própria superfície (fresnel²), `casca` é a
     * atmosfera aditiva em BackSide. Os dois em 1 é a composição de hoje. Ver `space/planet.js`.
     */
    pele: (ajuste) => scene.skinTerms(ajuste),
    /**
     * O A/B dos termos da pele no MESMO quadro: `spatia.peleAB([{limbo:1},{limbo:0}], ler)`.
     *
     * `ler` roda com o desenho ainda no buffer — é onde vai o `gl.readPixels`, e ela tem de ser
     * síncrona. Ver `scene.skinAB` para o porquê de a pose ter de ser a mesma.
     */
    peleAB: (condicoes, ler) => scene.skinAB(condicoes, ler),
    /**
     * O mesmo A/B na cena UNIVERSO: `spatia.aroAB([{borda:1},{borda:0}], ler)`.
     *
     * ⚠️ Ele mede o aro da ESTRELA. `CORPO_FS` é meia-lambert puro e não tem aro — o passo 2 do
     * `distancia-e-forma.md` cria um, não ajusta um. Ver `space/universe.js`, `termos`.
     */
    aroAB: (condicoes, ler) => scene.universeAB(condicoes, ler),
    /**
     * A cena em vigor, e a troca por código: `spatia.cena('universo')`.
     *
     * Existe pelo mesmo motivo das outras sondas — sem ela, "cliquei e não mudou" não distingue
     * botão morto de cena que não trocou, e foi exatamente essa dúvida que custou a primeira
     * validação deste switcher.
     *
     * ⚠️ **`quadros` conta só o UNIVERSO** — ele vem de `universeStats()` e congela no AGENTE, então
     * usá-lo como prova de vida ali devolve "não mudou" com a tela viva. Medida que atravessa as
     * duas cenas conta `requestAnimationFrame`.
     * ⭑ **`composicao` é a que separa "preto por buffer" de "preto por câmera ou por laço"**: ela
     * diz onde a cena grava profundidade, onde a lente escreve, e se as duas colidem.
     */
    cena: (modo) =>
      modo
        ? scene.setMode(modo)
        : { modo: scene.mode(), ...scene.universeStats(), composicao: scene.composicao() },
    /**
     * A geometria da cena UNIVERSO, medida em vez de olhada.
     *
     * ⚠️ `sobreposicoes()` existe porque **colisão e oclusão produzem a mesma imagem** numa cena
     * sem sombra projetada: dois corpos alinhados com a câmera parecem se atravessar, e um defeito
     * de geometria de verdade parece a mesma coisa. A foto não decide; a distância decide.
     */
    universo: {
      sobreposicoes: (limite) => scene.universeOverlaps(limite),
      entre: (a, b) => scene.universePair(a, b),
      /**
       * O histograma do raio DESENHADO, esfera contra sprite. Ver `universe.pixels`.
       *
       * ⚠️ Leia `quadros` ANTES de acreditar em qualquer número daqui: aba oculta congela o `rAF` e
       * a sonda devolve um quadro velho com toda a cara de presente.
       */
      pixels: () => scene.universePixels(),
      /**
       * As peles desenhadas SEM foco, e quantas o teto cortou: `spatia.universo.peles()`.
       *
       * ⚠️ `cortadas` existe porque corte calado lê como "cobri tudo". Ver `scene.js`, o pool.
       */
      peles: () => scene.universeSkins(),
      /**
       * Onde a câmera desta cena está ancorada, e por quê: `spatia.universo.ancora()`.
       *
       * A origem deixou de ser o padrão — ela é a última degradação. Ver `scene.universeAnchor`.
       */
      ancora: () => scene.universeAnchor(),
      /** Adota um sistema e chega nele: `spatia.universo.irPara(3)`. */
      irPara: (i) => scene.universeGoTo(i),
      /**
       * Anexa um corpo como alvo padrão da câmera: `spatia.universo.anexar('<source>')`.
       * Sem argumento (ou `null`) desanexa e devolve ao VOO LIVRE, que é o padrão desta cena.
       */
      anexar: (source = null) => scene.universeAttach(source),
    },
  });

  // A intenção de abrir um app, venha de onde vier, vira navegação num lugar só. Desde
  // 2026-08-07 quem a emite é a dock e o atalho de SISTEMA — os corpos de app saíram do céu.
  on('ui.open-app', ({ id }) => router.navigate(id));

  let health = null;
  try {
    health = await api.health();
    frame.applyHealth(health);
    saudeStore.publicar(health);
    // O botão de voz precisa do DESEJADO, que o health não carrega: sem ele, TTS desligado por
    // decisão e TTS caído chegam iguais e a tela promete uma voz que não vem.
    api
      .units()
      .then((units) => voice.applyHealth(health, units))
      .catch(() => voice.applyHealth(health));
    streams.showProviders(health.providers);
    scene.installProviders(health.providers);
  } catch (error) {
    boot.fail(`servidor não respondeu: ${error.message}`);
    return;
  }

  /*
   * ☠️ **O retorno de `scene.loadGraph` soma corpos + LUAS, e não é `corpos`.** Publicá-lo sob
   * essa palavra dá **460 num corpus de 72** (fixture, 09/08) — e `corpos` é ARQUIVO em
   * `stats.files`, em `cena().corpos` e em todo censo. Uma palavra, duas grandezas, com a maior
   * na primeira tela que alguém lê. A contagem sai de onde a palavra já significa isso: o censo
   * do servidor, que é quem lê o `.env` e assina o `corpus` ao lado. As luas se contam com o
   * nome delas.
   *
   * ⚠️ `?? null` e não `?? 0`: servidor que não contou é *"não medi"*, e céu vazio é outra coisa.
   */
  let corpos = null;
  try {
    const graph = await api.graph();
    scene.loadGraph(graph);
    /*
     * O MESMO payload que a cena leu — não uma segunda busca.
     *
     * O contexto de aparência sai de `classificar()`/`superficieDe()`, e as duas dependem de quem é
     * o dominante do sistema. Derivar de outra leitura abriria a porta para a HUD oferecer TERRA a
     * um corpo que a cena desenha como fotosfera.
     */
    /*
     * As aparências vão para a CENA, que carrega a textura e a aplica no albedo. A cena não sabe o
     * que é um favorito — recebe `source → arquivo` e desenha; a marca fica do lado de cá.
     *
     * ⚠️ Só entram as marcas que RESOLVERAM: `sonda()` já devolve `degradada` para escolha que não
     * vale mais aqui, e mandar essas pintaria o corpo com a textura que a própria tela diz não valer.
     */
    function sincronizarAparencias() {
      const { itens = [] } = favoritos.sonda();
      const mapa = {};
      for (const it of itens) {
        if (it.estado !== 'marcada' || !it.aparencia) continue;
        // ⚠️ `sonda()` NÃO devolve `arquivo` — conferido na saída real, não no JSDoc. O caminho vive
        // no catálogo, que é do MODELO.
        const arquivo = APARENCIAS[it.contexto]?.[it.aparencia]?.arquivo;
        if (arquivo) mapa[it.id] = arquivo;
      }
      scene.declararAparencias(mapa);
    }

    favoritos.carregarTopologia(graph);
    sincronizarAparencias();
    // A marca muda por GESTO, não só no carregamento — sem isto a textura só apareceria
    // no próximo boot. `aoMudar` é o canal que o próprio módulo publica.
    favoritos.aoMudar(sincronizarAparencias);
    corpos = graph.stats?.files ?? null;
    // Sem contagem o medidor fica no travessão de nascença: `0 arq` seria uma medida inventada.
    if (corpos !== null) frame.applyGraph(corpos);
    const luas = scene.moonReport?.() ?? null;
    streams.note(`TOPOLOGIA CARREGADA · ${corpos ?? '—'} CORPOS`, 'good');
    // Seção que não coube em órbita é informação perdida da tela: quem corta avisa.
    if (luas?.dropped) {
      streams.note(`${luas.shown} LUAS EM ÓRBITA · ${luas.dropped} SEÇÕES SEM ESPAÇO`, 'warn');
    }
    /*
     * As duas notas acima caem numa superfície que a tela de entrada está cobrindo, no único
     * minuto em que ninguém pode lê-las. A entrada não produz número novo — mostra o que já
     * estava sendo afirmado, na hora em que dá para ler, junto do CORPUS que lhe dá sentido.
     *
     * ⚠️ `graph.corpus` vem do SERVIDOR. Um default aqui (`?? 'vault/'`) não falha: mede o corpus
     * errado com convicção total.
     */
    boot.ceu({ corpos, luas, corpus: graph.corpus ?? null });
  } catch (error) {
    streams.note(`TOPOLOGIA INDISPONÍVEL: ${error.message}`, 'bad');
    // `null`, nunca 0: um céu que não carregou e um céu vazio dão a mesma imagem, e só um deles
    // é um defeito. A tela de entrada não pode ser o lugar onde essa diferença se perde.
    boot.ceu({ corpos: null, corpus: null, motivo: error.message });
  }

  // Sem topologia não há estrela para receber anel — sondar o disco só gastaria `git status`.
  if (corpos) watchDirty(scene, streams, boot);
  // Sem condição: os pontos de subsistema afirmam com ou sem céu, e é a afirmação que precisa
  // de idade.
  watchHealth(frame);

  // O router entra em cena depois de saúde e topologia: um app que carrega dados no onEnter
  // não deve fazê-lo antes de o sistema saber o que está no ar.
  router.start(SYSTEM_VIEW);
  // Eventos que ninguém pediu (webhooks) começam a chegar aqui.
  api.watchSystem();

  restorePrefs(panels, audio);
  installProfiles(scene, streams);
  /*
   * A página de configuração pede pelo BARRAMENTO, não chamando a cena.
   *
   * Ela é um widget e não conhece `scene` — e não deveria: um widget que alcança a cena por
   * referência direta passa a só funcionar montado no app que a tem. Pelo evento, a mesma
   * seção serve qualquer superfície futura que queira trocar de perfil.
   */
  /*
   * O fundo do universo é aplicado pelo mesmo caminho do perfil: a tela de configuração escreve
   * em `prefs` e AVISA; quem sabe desenhar é a cena. Aplicado uma vez no boot, para que a
   * escolha da sessão anterior já esteja no ar antes do primeiro quadro visível.
   */
  const aplicarFundo = () => scene.applyBackdrop({ enabled: prefs.get('sky.backdrop') });
  aplicarFundo();
  on('ui.apply-backdrop', aplicarFundo);

  /*
   * Atalho da systray para o fundo: navega para SISTEMA e já pede a seção FUNDO.
   *
   * A ordem importa. O pedido da seção vai ANTES da navegação porque o widget lê a seção
   * pendente ao montar — invertido, ele montaria no topo e o pedido chegaria tarde.
   */
  /*
   * A systray dobra/desdobra a JANELA DO TEMPO acionando o próprio rótulo da seção.
   *
   * Clicar no rótulo é o mecanismo que toda seção já tem; o botão daqui é só um segundo lugar
   * de onde alcançá-lo. Duplicar a lógica de estado (guardar "aberto" aqui também) criaria dois
   * donos do mesmo booleano, e eles divergem no primeiro esquecimento.
   */
  document.querySelector('[data-time-toggle]')?.addEventListener('click', () => {
    const secao = [...document.querySelectorAll('.widget .label')].find(
      (l) => l.querySelector('.widget-title')?.textContent.trim() === 'JANELA DO TEMPO'
    );
    secao?.click();
    // Desdobrar e não conseguir ver seria pior que não ter o botão: rola até ela.
    secao?.closest('.widget')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  document.querySelector('[data-backdrop-open]')?.addEventListener('click', () => {
    emit({ t: 'ui.config-section', id: 'fundo' });
    emit({ t: 'ui.open-app', id: 'system' });
  });

  on('ui.apply-profile', ({ id }) => {
    const perfil = profiles.byId(id);
    if (!perfil) return;
    applyProfile(scene, perfil);
    streams.note(`PERFIL ${perfil.name} APLICADO`, 'good');
  });

  await boot.report(health);
  /*
   * Janela sem medida não vira beacon. `startTelemetry` já pula o `null` — o espalhamento é que
   * o desfazia, transformando "não medi" num relatório vazio que o servidor registra como se
   * fosse leitura. Aba em segundo plano é a maior parte da vida de uma aba.
   */
  api.startTelemetry(() => {
    const amostra = scene.sampleTelemetry();
    return amostra && { ...amostra, audio: audio.isEnabled() };
  });
  await boot.engage();
}

/**
 * Perfil de qualidade: aplica o escolhido e, só na primeira vez, MEDE e sugere.
 *
 * A sugestão nunca se aplica sozinha. Trocar a aparência da cena por conta própria é a mesma
 * classe de erro do slider que exibe um valor que não está em vigor — o `respectMotion` da cena
 * já diz na tela quando faz isso, e a mesma régua vale aqui. E a medição é do LOOP REAL, não da
 * string do navegador: `userAgent` responde "que máquina é" e a pergunta é "esta cena, com este
 * corpus, nesta janela, roda?".
 */
function installProfiles(scene, streams) {
  const escolhido = prefs.get('view.profile');
  const perfil = profiles.byId(escolhido) || profiles.byId(profiles.DEFAULT_PROFILE);
  /*
   * No boot aplica-se só a parte de CENA do perfil, nunca a afinação.
   *
   * `tuning.apply()` escreve os 22 parâmetros a partir dos DEFAULTS — que é o certo quando o
   * operador ESCOLHE um perfil, e destrutivo quando acontece sozinho. Reaplicando no boot, cada
   * reload apagava toda afinação manual e a devolvia ao default do perfil, em silêncio. O
   * `tuning` existe justamente para que minutos de tentativa e erro sobrevivam a um reload.
   *
   * Os valores da afinação já estão no localStorage; o que NÃO está lá é resolução de desenho e
   * teto de anéis, e é só isso que precisa ser reaplicado.
   */
  scene.applyProfile(perfil);

  // Quem já escolheu não é interrogado de novo a cada boot.
  if (escolhido) return;

  /*
   * Espera antes de medir: os primeiros segundos incluem compilação de shader, upload de
   * buffers e a carga da topologia. Medir ali diria que toda máquina é lenta.
   */
  const sondar = () => {
    const amostra = scene.sampleTelemetry();
    /*
     * Janela sem medida não vira recomendação — ela vira outra tentativa.
     *
     * Aba em segundo plano congela o `requestAnimationFrame` e a janela fecha com zero quadro.
     * Anunciar "0 FPS MEDIDOS · PERFIL MÍNIMO" ali é dizer que a máquina é lenta com base em
     * nada, e o operador que voltar para a aba encontra o veredito já dado. Tentar de novo custa
     * um timer e para sozinho no primeiro segundo de fato desenhado.
     */
    if (!amostra) {
      setTimeout(sondar, PROFILE_PROBE_MS);
      return;
    }
    const sugerido = profiles.suggest({ fps: amostra.fps, longFrames: amostra.long_frames });
    if (sugerido === profiles.DEFAULT_PROFILE) return;
    const nome = profiles.byId(sugerido)?.name ?? sugerido;
    streams.note(
      `${Math.round(amostra.fps)} FPS MEDIDOS · PERFIL ${nome} RECOMENDADO EM SISTEMA › CONFIGURAÇÃO`,
      'warn'
    );
  };
  setTimeout(sondar, PROFILE_PROBE_MS);
}

/**
 * Aplica um perfil INTEIRO — os 22 parâmetros e a parte de cena.
 *
 * Só para escolha explícita do operador. O caminho do boot usa `scene.applyProfile` direto,
 * porque reescrever a afinação sozinho apaga o que ele ajustou à mão (ver `installProfiles`).
 */
export function applyProfile(scene, perfil) {
  if (!perfil) return;
  tuning.apply(perfil.tuning);
  scene.applyProfile(perfil);
  prefs.set('view.profile', perfil.id);
  ui('profile-changed', { id: perfil.id });
}

// Tempo até a primeira medição valer. Antes disso a amostra inclui compilação de shader e a
// carga da topologia, e diria que qualquer máquina é lenta.
const PROFILE_PROBE_MS = 12_000;

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
 * Mantém os pontos de subsistema afirmando o PRESENTE.
 *
 * `/api/health` era lido uma vez, no boot, e os pontos ficavam com aquela leitura para sempre:
 * cinco minutos parado deixavam MEMORY verde sobre um Qdrant que podia ter caído no minuto dois,
 * e nada na tela mudava. ☠️ **Isso não é um `notice` que falta** — falha de serviço é o evento
 * `error`, que só existe dentro de uma pergunta, e o vigia de `server/ambient.py` observa corpus,
 * topologia, índice, Neo4j e credencial, **nunca qdrant/ollama/TTS**. A afirmação não tinha
 * substrato e não tinha dono.
 *
 * ⚠️ **Só `frame.applyHealth` é realimentado.** Os outros três consumidores do boot MONTAM coisa
 * (`scene.installProviders` põe corpo no céu, `streams.showProviders` redesenha a lista,
 * `voice.applyHealth` depende de uma segunda chamada a `/api/units`): remontar não é aferir, e
 * um laço que remonta a cada volta é decoração cara com cara de atualização.
 *
 * ⚠️ **Falha não repinta nada.** O `catch` é vazio de propósito — sem `applyHealth`, a idade
 * segue subindo e o cabeçalho declara a leitura vencida sozinho. Repintar com o `health` velho
 * carimbaria uma aferição que não houve; apagar os pontos jogaria fora a última medida boa. É a
 * mesma escolha do anel sujo, pelo outro lado: lá não se sabe mais, aqui sabe-se de quando é.
 *
 * ⚠️ **Ele não emite no barramento e não escreve linha de timeline.** Um evento por volta seria
 * a mesma frase a cada 30 s, que é exatamente o que ensina o operador a não ler a tela.
 */

function watchHealth(frame) {
  async function poll() {
    // Aba escondida não afere: a leitura chegaria para ninguém, e ao voltar a idade dela já
    // estaria velha de qualquer jeito. O retorno à aba afere na hora.
    if (document.hidden) return;
    try {
      const saude = await api.health();
      frame.applyHealth(saude);
      saudeStore.publicar(saude);
      /*
       * ⚠️ **Quem sabe do disco é o SERVIDOR** — o navegador não lista sistema de arquivos, e
       * sondar arquivo por arquivo confundiria 404 de rede com arquivo ausente. O modelo de
       * favoritos distingue TRÊS estados (`true | false | null`), e adivinhação devolveria `false`
       * onde o fato é `null`.
       *
       * `texturas` ausente do payload deixa `emDisco` em `null` — servidor velho não vira "medi e
       * não há". É a mesma leitura que já vinha, sem chamada nova.
       */
      favoritos.declararEmDisco(Array.isArray(saude?.texturas) ? new Set(saude.texturas) : null);
    } catch {
      // Sem leitura não há o que carimbar. A idade que sobe é o anúncio.
    }
  }

  setInterval(poll, AFERICAO_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
  });
}

/**
 * Mantém os anéis em dia com o disco.
 *
 * Aba escondida não sonda: cada sondagem que vence o cache é um `git status --porcelain` por
 * raiz git (o workspace e cada submódulo), e pagar isso por uma aba que ninguém está olhando é
 * gastar CPU do operador para desenhar o que ele não vê. Ao voltar para a aba a sondagem é
 * imediata — esperar o próximo tique mostraria o disco de até 15s atrás.
 */
function watchDirty(scene, streams, boot) {
  // Começa em 0 e não em `null`: árvore limpa no boot é o caso comum, e anunciar "0 arquivos"
  // toda vez que o observatório sobe é ruído.
  let announced = 0;
  let failing = false;

  /*
   * A PRIMEIRA leitura do disco chega enquanto a tela de entrada ainda cobre a timeline — é o
   * fato que se perdia. As duas superfícies recebem o MESMO texto: uma delas reescrevendo a
   * frase seria um número que muda conforme onde se lê.
   */
  const anunciar = (texto, tom = '') => {
    streams.note(texto, tom);
    boot.disco(texto, tom);
  };

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
      /*
       * Sem raiz git configurada não é árvore limpa — é o servidor dizendo que não olhou.
       *
       * Com `AGENT_CWD` vazio (que é o que o `.env.example` traz) a rota devolvia `{}` e a tela
       * anunciava ÁRVORE LIMPA em verde, indistinguível de um repositório sem alterações. Uma
       * feature desligada tem que parecer desligada.
       */
      if (payload.root === null) {
        scene.forgetDirty();
        if (!failing) {
          failing = true;
          anunciar('SEM RAIZ GIT CONFIGURADA (AGENT_CWD) · ANÉIS DESLIGADOS', 'bad');
        }
        return;
      }
      const resultado = scene.markDirty(files);
      failing = false;
      if (resultado.shown === announced) return;
      announced = resultado.shown;
      anunciar(dirtyNote(resultado), resultado.shown ? '' : 'good');
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
      anunciar(`ALTERAÇÕES LOCAIS INDISPONÍVEIS: ${error.message} · ANÉIS REMOVIDOS`, 'bad');
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
/**
 * A nota do trabalho local — e ela nomeia CADA razão de um arquivo sujo não virar anel.
 *
 * ⚠️ **Ela dizia "FORA DO ÍNDICE" para três coisas diferentes.** O cálculo era
 * `total − shown − dropped`, e nesse resto cabiam: arquivo que não casou com nó nenhum (o único
 * que de fato não está indexado), arquivo cujo CORPO recusou o anel pelo solver, e arquivo
 * escondido pelo filtro de tipo. Medido em 2026-08-08: **17 sujos · 17 casaram · 11 anéis**, e a
 * tela anunciava "6 FORA DO ÍNDICE" sobre seis arquivos que estavam no índice e foram recusados
 * pelo catálogo.
 *
 * A diferença não é cosmética: mandava reindexar o corpus para consertar uma decisão de
 * morfologia. Diagnóstico que aponta o lugar errado é pior que diagnóstico nenhum — é a mesma
 * lição do verificador do diário, que acusava a linha íntegra em vez da órfã.
 */
function dirtyNote({ shown, dropped, total, casados, recusados, escondidos }) {
  if (!total) return 'ÁRVORE LIMPA · NENHUM ANEL';
  const foraDoIndice = total - casados;
  const parts = [`TRABALHO LOCAL · ${plural(total, 'ARQUIVO').toUpperCase()}`];
  if (shown !== total) parts.push(`${shown} NO CÉU`);
  if (dropped) parts.push(`${dropped} ALÉM DO TETO`);
  // "o corpo não hospeda anel" — decisão do catálogo, não falta de indexação.
  if (recusados) parts.push(`${recusados} SEM ANEL POR CLASSE`);
  if (escondidos) parts.push(`${escondidos} OCULTOS PELO FILTRO`);
  if (foraDoIndice > 0) parts.push(`${foraDoIndice} FORA DO ÍNDICE`);
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
  keys.bind({ key: 'Escape', whileTyping: true, label: 'SAIR', group: 'NAVEGAÇÃO' }, () => {
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
    } else if (closeFileReader()) {
      /*
       * O leitor central de arquivo. Ele não é painel da `surface`, é widget do palco — sem este
       * degrau o Esc caía até o reset de rota lá embaixo, que DESMONTA o app e leva junto a
       * busca e os resultados. Fechar o leitor tem de custar exatamente um passo, como qualquer
       * outro painel.
       */
    } else if (answer.isInspecting()) {
      /*
       * Fechar o inspetor SOLTA o astro junto — é um gesto só.
       *
       * Clicar numa estrela faz duas coisas ao mesmo tempo: trava a câmera nela e abre o
       * conteúdo à direita. Desfazer só metade deixaria a câmera presa a um astro cujo painel
       * já saiu da tela, e o operador sem caminho óbvio para se soltar (a deriva automática
       * está desligada justamente porque ele escolheu para onde olhar).
       */
      answer.close();
      scene.focusNode(null);
    } else if (scene.focusedNode()) {
      // Inspetor já fechado por outro caminho (o × dele), câmera ainda presa: Esc solta.
      scene.focusNode(null);
    } else if (api.isStreaming()) {
      api.abort();
      /*
       * `ui.cancel` cala o TTS — e ninguém o emitia.
       *
       * `hud/voice.js` assina `on('ui.cancel', stop)` desde sempre, e nenhum ponto do sistema
       * publicava o evento: abortar uma resposta parava o stream e deixava a voz lendo a
       * resposta abandonada até a fila esvaziar. Assinante sem emissor é uma funcionalidade
       * que existe no código e nunca acontece.
       */
      ui('cancel', {});
      emit({ t: 'state', state: 'idle', label: 'ABORTADO' });
      emit({ t: 'done' });
    } else if (answer.hasAnswer()) {
      // Descartar a resposta também cala: ler em voz alta um texto que saiu da tela é o
      // sistema falando sozinho sobre algo que o operador acabou de dispensar.
      ui('cancel', {});
      answer.dismiss();
      terminal.focus();
    } else if (router.route() !== ROUTE_ROOT) {
      router.navigate(ROUTE_ROOT);
    } else {
      terminal.clearInput();
    }
    audio.click({ frequency: 165, gain: 0.05, decay: 0.5 }); // 55×3 — saída, grave
  });

  keys.bind({ code: 'Tab', label: 'CINEMA', group: 'CENA' }, () => {
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
  keys.bind({ code: 'KeyM', meta: true, label: 'MUDO', group: 'ÁUDIO' }, async () => {
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

  keys.bind({ code: 'KeyR', alt: true, label: 'SOLTAR CÂMERA', group: 'CENA' }, () => scene.release());

  /*
   * F marca e desmarca o corpo SOB ATENÇÃO — o mesmo que o painel de CONTEXTO está nomeando.
   *
   * ⚠️ O sujeito sai de `attention.snapshot()`, e não de `scene.focusedNode()`, porque é ele que o
   * painel desenha: dois sujeitos para o mesmo gesto fariam a tecla marcar um corpo enquanto a tela
   * mostra a marca de outro. Na cena UNIVERSO o cursor não troca o sujeito (`paintLinks` só repinta
   * no foco), então ali a tecla age sobre o corpo TRAVADO; no AGENTE o cursor vence enquanto existe,
   * que é a mesma precedência do arco.
   *
   * ⚠️ **Colisão de tecla falha no REGISTRO** — `keys.bind` recusa combinação já tomada e derruba o
   * boot com o nome do dono. É por isso que ela mora aqui, junto dos outros atalhos globais, e não
   * no `mount` do widget: registrada por rota, a duplicidade só apareceria na rota que a montasse.
   *
   * A recusa do modelo (marca sem carimbo de corpus) vira NOTA, não exceção: ela traz o conserto
   * dentro do motivo, e engoli-la deixaria a tecla falhando em silêncio.
   */
  keys.bind({ code: 'KeyF', label: 'FAVORITAR', group: 'CENA' }, () => {
    const alvo = attention.snapshot().subject;
    if (!alvo) {
      streams.note('NENHUM CORPO SOB ATENÇÃO — PASSE O CURSOR OU TRAVE UM ASTRO', 'warn');
      return;
    }
    const r = favoritos.alternar(alvo);
    if (!r.ok) {
      streams.note(`MARCA RECUSADA — ${r.erro}`, 'bad');
      return;
    }
    streams.note(`${r.marcada ? 'MARCADO' : 'DESMARCADO'} · ${alvo.source || alvo.id}`, 'good');
    audio.click({ frequency: r.marcada ? 660 : 330, gain: 0.04, decay: 0.3 });
  });

  /*
   * ⌘S grava o enquadramento. Vale COM foco no prompt (`whileTyping`) porque o modificador não
   * disputa caractere nenhum — é a mesma regra que fez ⌘G entrar e `G` sair.
   *
   * O salvamento também acontece sozinho (a cada 5s e ao esconder a aba), mas silencioso: o
   * atalho existe para o operador CONFIRMAR que o enquadramento que ele acabou de compor está
   * guardado, e confirmação sem retorno visível não confirma nada. Por isso a nota sai nos dois
   * casos, dizendo qual foi.
   */
  keys.bind({ code: 'KeyS', meta: true, whileTyping: true, label: 'GRAVAR ÓRBITA', group: 'CENA' }, () => {
    /*
     * A nota diz o que FOI gravado, e antes ela dizia menos do que o atalho fazia.
     *
     * "ÓRBITA DA CÂMERA" descrevia só metade: o astro travado também atravessa o refresh agora, e
     * é ele que devolve o operador ao corpo que estava inspecionando. Nomear os dois é o que separa
     * "gravei" de "gravei o quê".
     */
    const saved = scene.saveOrbit();
    // `focusedNode()` já existia e o Esc a usa (main.js:631). Um segundo acessor para a
    // mesma coisa seria a duplicata que esta base já pagou quatro vezes.
    const astro = scene.focusedNode?.();
    const oQue = astro ? 'CÂMERA E ASTRO EM FOCO' : 'CÂMERA';
    streams.note(saved ? `${oQue} — GRAVADO` : 'NADA MUDOU DESDE A ÚLTIMA GRAVAÇÃO', 'good');
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
 * É o equivalente da barra de tarefas, e desde 2026-08-07 é o ÚNICO caminho de ponteiro até um
 * app: os corpos de app saíram do céu (ver o bloco que removia `installApps`). O destino segue
 * sendo `router.navigate`.
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
      Object.assign(document.createElement('span'), { className: 'dock-key', textContent: app.key ?? '' })
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
  console.error('[spatia] falha na inicialização', error);
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
