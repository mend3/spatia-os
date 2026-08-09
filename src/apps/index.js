/**
 * Os quatro apps da primeira leva, e os widgets que só eles usam.
 *
 * Cada app é um manifesto: onde orbita, de que cor é, quais widgets compõe. A ordem no array
 * de widgets é a ordem visual, e a ordem de registro dos apps é a ordem na dock e nos atalhos
 * numéricos — `1` abre o primeiro.
 *
 * O CONJUNTO RESIDENTE — os widgets que toda lista monta, e o motivo de cada um — está em
 * `residentes.js`, e `declararApp` recusa a lista que não o traz. Repeti-lo aqui em prosa foi
 * exatamente como `#/security` perdeu a `timeline` sem nada acusar.
 *
 * A **Ponte MCP** merece uma nota de honestidade: este servidor NÃO é cliente MCP. Os
 * servidores (Slack, Notion, Drive, hub-board) são alcançados pelo agente, não por aqui.
 * Então a ponte mostra o que o agente reporta ter, e agir sobre eles é *pedir ao agente*. Ela
 * poderia falsificar uma lista de canais e ninguém notaria na tela — e é exatamente por isso
 * que não faz.
 */
import { ROUTE_ROOT } from '../kernel/registry.js';
import { declararApp, declararVista } from './residentes.js';
import { registerCoreWidgets, listWidget } from './widgets-core.js';
import { registerSkyTime } from './sky-time.js';
import { registerContextWidget } from './context.js';
import { registerJournal } from './journal.js';
import { registerMetrics } from './metrics.js';
import { registerSecurity } from './security.js';
import { registerActivity } from './activity.js';
import { registerStorage } from './storage.js';
import { el, set, shortPath, money, plural } from '../hud/dom.js';
import { button } from '../hud/button.js';
import { on, emit } from '../core/bus.js';
import { snapshot } from '../core/state.js';
import * as api from '../core/api.js';
import * as keys from '../core/keys.js';
import * as prefs from '../core/prefs.js';
import { PROFILES } from '../core/profiles.js';
import { SPEC as TUNING_SPEC } from '../core/tuning.js';
import { PLATES } from '../space/backdrop.js';
import { DIRTY_LABELS } from '../space/rings.js';
import { KIND_COLORS as SKY_COLORS } from '../space/graph.js';
import { morphologyOf } from '../space/catalog.js';

const COLORS = { files: 0x7ee0c0, system: 0xffab54, web: 0xff9b4a, bridge: 0x5ce1e6 };

export function registerApps() {
  registerCoreWidgets();
  registerSkyTime();
  registerContextWidget();
  registerFilesWidgets();
  registerSystemWidgets();
  registerWebWidgets();
  registerBridgeWidgets();

  declararApp({
    id: 'files',
    name: 'ARQUIVOS',
    tagline: 'o grafo como sistema de arquivos',
    color: COLORS.files,
    key: '1',
    // Clicking a file or a folder in the sky lands here. Declared in the manifest, the
    // destination is a property of the app: uninstalling ARQUIVOS leaves the gesture ownerless
    // instead of leaving the kernel routing to something that is gone.
    claims: ['ui.select:file', 'ui.select:dir'],
    // A janela do tempo entra aqui também: este é o app sobre o corpus, e navegar o corpus por
    // data é a mesma operação que navegá-lo por pasta.
    widgets: ['context', 'fs-tree', 'fs-shape', 'fs-locate', 'fs-content', 'answer', 'sky-time', 'timeline'],
  });

  declararApp({
    id: 'system',
    name: 'SISTEMA',
    tagline: 'saúde, custo, permissões, afinação',
    color: COLORS.system,
    key: '2',
    widgets: ['context', 'sys-config', 'sys-about', 'sys-services', 'vitals', 'sys-quota', 'answer', 'sky-time', 'timeline'],
  });

  declararApp({
    id: 'web',
    name: 'WEB',
    tagline: 'provedores, resultados, ingestão',
    color: COLORS.web,
    key: '3',
    widgets: ['context', 'web-search', 'web-providers', 'web-results', 'answer', 'sky-time', 'timeline'],
  });

  declararApp({
    id: 'bridge',
    name: 'PONTE',
    tagline: 'integrações, webhooks, MCP',
    color: COLORS.bridge,
    key: '4',
    widgets: ['context', 'br-credentials', 'br-webhooks', 'br-mcp', 'br-deliveries', 'answer', 'sky-time', 'timeline'],
  });

  /*
   * O DIÁRIO se registra inteiro (widgets + manifesto) no próprio módulo: ele tem estado comum
   * aos cinco widgets, e esse estado não pertence a este arquivo.
   *
   * Por ÚLTIMO porque a ordem de registro é a ordem da dock e dos atalhos numéricos — registrar
   * antes remapearia o `1`–`4` que o operador já decorou.
   */
  registerJournal();
  registerMetrics();
  registerSecurity();
  registerActivity();
  registerStorage();
}

/**
 * Widgets da vista de sistema (a rota raiz).
 *
 * ⚠️ Ela é a DÉCIMA rota e não passa pelo registro de apps — um portão montado só no `registerApp`
 * deixaria justamente a rota inicial de fora. `declararVista` é o mesmo portão para ela.
 */
export const SYSTEM_VIEW = declararVista(ROUTE_ROOT, [
  'vitals', 'plan', 'timeline', 'answer',
  /*
   * O CONTEXTO abre o trilho da direita: é o widget de maior taxa de mudança da vista (troca a
   * cada movimento do cursor sobre o céu), e a fenda `right` é justamente a do que está
   * acontecendo AGORA. Abaixo dele fica o que só muda quando o núcleo responde.
   */
  'context', 'memory', 'tools', 'web-results',
  'sky-time',
]);

// ---------------------------------------------------------------- ARQUIVOS

/*
 * O leitor central FECHÁVEL, para a cascata do Esc.
 *
 * Ele é um WIDGET no palco e não um painel da `surface`, então `surface.closeTop()` não o alcança.
 * Sem este gancho o Esc desce até o último passo da cadeia, que volta à rota raiz e desmonta o app
 * inteiro — o leitor fecha levando junto a busca e os resultados.
 *
 * Fica no módulo porque quem monta o widget e quem trata a tecla não se conhecem — a mesma razão
 * de `ui.apply-profile` passar pelo barramento em vez de alcançar a cena.
 */
let readerClose = null;

/**
 * Fecha o leitor central de arquivo, se houver um aberto.
 *
 * @returns {boolean} se havia algo a fechar — é o que a cadeia do Esc usa para decidir se
 *   continua descendo para os passos seguintes.
 */
export const closeFileReader = () => (readerClose ? readerClose() : false);

function registerFilesWidgets() {
  /*
   * O último arquivo que o operador pediu no CÉU, e a porta para abri-lo se o leitor já estiver
   * montado. Vivem no registro e não no widget porque o clique atravessa uma navegação — o
   * evento chega antes de o leitor existir, e um assinante que nasce depois nunca o vê.
   */
  let pedidoDeLeitura = null;
  let abrirAgora = null;
  on('ui.select', ({ node }) => {
    if (node?.type !== 'file') return;
    pedidoDeLeitura = node.source;
    abrirAgora?.(node.source);
  });

  // `null` = ainda não sabemos a raiz. Ela vem do servidor (`files_root`), derivada do corpus
  // em vez de fixa no código: o corpus tem duas raízes (workspace e memórias do agente), e
  // abrir na raiz vazia mostraria duas pastas em vez do conteúdo.
  let cwd = null;
  let nodes = [];
  const listeners = new Set();

  const notify = () => listeners.forEach((fn) => fn());

  listWidget({
    id: 'fs-tree',
    title: 'ÁRVORE',
    slot: 'left',
    grow: 1,
    render(view) {
      async function draw() {
        if (!nodes.length) {
          try {
            const payload = await api.graph();
            nodes = payload.nodes || [];
            if (cwd === null) cwd = payload.files_root || '';
          } catch (error) {
            view.empty(`topologia indisponível: ${error.message}`);
            return;
          }
        }
        if (cwd === null) cwd = '';

        const rows = [];
        // Breadcrumb: o caminho é o estado, e subir é sempre possível.
        const crumb = el('div', 'fs-crumb');
        const root = el('button', 'fs-crumb-part', '/');
        root.addEventListener('click', () => {
          cwd = '';
          notify();
        });
        crumb.append(root);
        let acc = '';
        for (const part of cwd.split('/').filter(Boolean)) {
          acc = acc ? `${acc}/${part}` : part;
          const target = acc;
          // `crumb`, não `button`: o nome sombreava o primitivo importado dentro deste bloco.
          const step = el('button', 'fs-crumb-part', part);
          step.addEventListener('click', () => {
            cwd = target;
            notify();
          });
          crumb.append(el('span', 'fs-crumb-sep', '/'), step);
        }
        rows.push(crumb);

        const prefix = cwd ? `${cwd}/` : '';
        const dirs = new Set();
        const files = [];
        for (const node of nodes) {
          // `path` para navegar, `source` para abrir: fonte absoluta tem primeiro segmento
          // vazio e desenhava uma pasta sem nome na raiz.
          const path = node.path || node.source;
          if (node.type !== 'file' || !path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length);
          const slash = rest.indexOf('/');
          if (slash === -1) files.push(node);
          else if (rest.slice(0, slash)) dirs.add(rest.slice(0, slash));
        }

        for (const dir of [...dirs].sort()) {
          const row = button({ variant: 'row', size: 'row', data: { entry: 'dir' } });
          row.append(el('span', 'fs-glyph', '▸'), el('span', 'fs-name', dir));
          row.addEventListener('click', () => {
            cwd = prefix ? `${prefix}${dir}` : dir;
            notify();
          });
          rows.push(row);
        }
        for (const node of files.sort((a, b) => a.label.localeCompare(b.label))) {
          const row = button({ variant: 'row', size: 'row', data: { entry: 'file', kind: node.kind } });
          row.append(el('span', 'fs-glyph', '·'), el('span', 'fs-name', node.label));
          row.append(el('span', 'fs-meta', `${node.chunks}`));
          row.addEventListener('click', () => reveal(node.source));
          rows.push(row);
        }

        if (rows.length === 1) rows.push(el('div', 'widget-empty', 'nada indexado aqui'));
        view.set(rows);
      }

      listeners.add(draw);
      draw();
      return { destroy: () => listeners.delete(draw) };
    },
  });

  listWidget({
    id: 'fs-shape',
    title: 'FORMA DO CORPUS',
    hint: 'por tipo',
    slot: 'left',
    /**
     * Os dois histogramas que o servidor JÁ MANDA e ninguém desenhava.
     *
     * `/api/graph` devolve `stats.kinds` e `stats.repos` prontos (`server/graph.py`), e o
     * payload inteiro trafegava com eles a cada carga da topologia sem nenhuma tela consumindo.
     * Recontar no cliente seria pior que desperdício: seriam duas contagens do mesmo fato, com
     * a chance de discordarem — que é exatamente o defeito que o `core/corpus.js` existe para
     * ter matado uma vez (a cena desenhava 388 e o rótulo dizia 397).
     *
     * A barra é o próprio número: largura proporcional ao maior. Sem eixo, sem legenda — a
     * pergunta é "de que este corpus é feito", e a resposta é a ordem de grandeza.
     *
     * ## O histograma É o filtro
     *
     * Clicar numa linha tira aquele tipo do céu. Não é um painel de filtros separado de propósito:
     * a lista que responde "de que isto é feito" é a mesma que responde "me mostra só isto", e
     * duplicá-la em dois lugares daria duas verdades sobre o mesmo conjunto.
     *
     * ⚠️ O estado vive AQUI, no widget, e não no grafo. A cena é quem obedece (`ui.filter-kinds`),
     * e o widget é quem lembra — se fosse ao contrário, trocar de rota destruiria o painel e o
     * filtro voltaria sozinho, que é a corrida de remontagem que este arquivo já pagou duas vezes.
     */
    render(view) {
      view.empty('carregando…');
      // `null` = nada foi tocado ainda. Vira Set no primeiro clique, e daí em diante é a verdade.
      let ligados = null;
      api
        .graph()
        .then(({ stats }) => {
          const kinds = Object.entries(stats?.kinds || {}).sort((a, b) => b[1] - a[1]);
          if (!kinds.length) {
            view.empty('sem estatística no payload');
            return;
          }
          const peak = kinds[0][1];
          const todos = kinds.map(([kind]) => kind);
          const ativo = (kind) => !ligados || ligados.has(kind);

          const alternar = (kind) => {
            // Primeiro clique parte de "todos ligados": o gesto é DESLIGAR o que atrapalha, que é
            // o que se quer quando se está procurando algo. Começar do vazio faria o primeiro
            // clique apagar o céu inteiro.
            if (!ligados) ligados = new Set(todos);
            if (ligados.has(kind)) ligados.delete(kind);
            else ligados.add(kind);
            /*
             * Desligar TUDO devolve o céu inteiro em vez de deixar a tela preta.
             *
             * Um céu vazio é indistinguível de um defeito de carga, e o operador que chegou lá
             * clicando não tem como saber qual dos dois está vendo. Voltar ao estado neutro é a
             * saída legível — e é o mesmo estado em que o painel nasceu.
             */
            if (ligados.size === 0) ligados = null;
            emit({ t: 'ui.filter-kinds', kinds: ligados ? [...ligados] : null });
            desenhar();
          };

          function desenhar() {
            view.set(
              kinds.map(([kind, count]) => {
                const ligado = ativo(kind);
                const linha = button({
                  variant: 'row',
                  size: 'row',
                  data: { kind, on: ligado ? '1' : '0' },
                });
                linha.classList.add('shape-row');
                linha.title = ligado ? `ocultar ${kind} do céu` : `mostrar ${kind} no céu`;
                linha.setAttribute('aria-pressed', ligado ? 'true' : 'false');
                linha.append(el('span', 'shape-name', kind));

                // Que corpo celeste este tipo é. `°` marca a morfologia que o modelo declara e a
                // cena ainda não desenha — sem a marca, o rótulo afirmaria uma imagem que não
                // está lá.
                const forma = morphologyOf(kind);
                const corpo = el('span', 'shape-body', forma.drawn ? forma.body : `${forma.body}°`);
                if (!forma.drawn) corpo.title = `${forma.body} ainda não é desenhada — o corpo aparece como estrela`;
                linha.append(corpo);

                const trilho = el('div', 'shape-track');
                const barra = el('i', 'shape-bar');
                barra.style.width = `${Math.max(2, (count / peak) * 100)}%`;
                // A cor é a MESMA que o céu usa para aquele tipo — o histograma e a cena falam do
                // mesmo dado, e cor divergente faria parecerem dois assuntos.
                barra.style.background = `#${(SKY_COLORS[kind] ?? SKY_COLORS.other).toString(16).padStart(6, '0')}`;
                trilho.append(barra);
                linha.append(trilho, el('span', 'shape-count', String(count)));
                linha.addEventListener('click', () => alternar(kind));
                return linha;
              })
            );
          }

          desenhar();
        })
        .catch((error) => view.empty(`indisponível: ${error.message}`));
      /*
       * Destruir o painel SOLTA o filtro. Um céu filtrado por um controle que não está mais na
       * tela é um estado sem dono — e o operador não teria onde clicar para desfazê-lo.
       */
      return { destroy: () => emit({ t: 'ui.filter-kinds', kinds: null }) };
    },
  });

  /**
   * Revelar um arquivo: CENTRALIZA o astro dele e abre o leitor.
   *
   * São dois gestos que o operador entende como um só — "me mostra este arquivo" quer dizer
   * onde ele está no céu E o que tem dentro. Só o segundo abre um painel sobre um céu parado,
   * sem nada que diga de onde aquilo veio.
   *
   * ⚠️ NÃO emite `ui.select`. A cena escuta esse evento para travar a câmera, mas `answer.js`
   * também o escuta para preencher o inspetor da DIREITA — e o leitor central já vai abrir por
   * `ui.open-file`. Os dois juntos renderizam o mesmo arquivo em dois painéis sobrepostos, que
   * é um defeito que este arquivo já pagou uma vez. `ui.focus-node` só tem a cena como ouvinte.
   */
  const reveal = (source) => {
    emit({ t: 'ui.focus-node', source });
    emit({ t: 'ui.open-file', source });
  };

  listWidget({
    id: 'fs-locate',
    title: 'LOCALIZAR',
    hint: 'SEMÂNTICO',
    slot: 'right',
    grow: 1,
    render(view) {
      const box = el('input', 'fs-search');
      box.placeholder = 'descreva o que procura';

      /*
       * Os resultados têm CONTÊINER PRÓPRIO: `view.set`/`view.empty` substituem os filhos do
       * corpo do widget, e com a lista dentro dele a primeira busca apagaria o próprio campo de
       * busca. Campo e lista como irmãos, só a lista é trocada.
       */
      const results = el('div', 'fs-results');
      view.set([box, results]);

      const say = (text) => results.replaceChildren(el('div', 'widget-empty', text));

      box.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        const query = box.value.trim();
        if (!query) return;
        say('buscando…');
        try {
          const { hits } = await api.search(query, 12);
          if (!hits.length) return say('nenhum resultado');
          results.replaceChildren(
            ...hits.map((hit) => {
              const row = button({ variant: 'row', size: 'row', data: { entry: 'file' } });
              row.append(el('span', 'hit-score', (hit.score ?? 0).toFixed(3)));
              row.append(el('span', 'fs-name', shortPath(hit.source, 40)));
              row.addEventListener('click', () => reveal(hit.source));
              return row;
            })
          );
        } catch (error) {
          say(`falhou: ${error.message}`);
        }
      });

      return null;
    },
  });

  /*
   * Seção que a página de configuração deve abrir — por evento, vindo da systray.
   *
   * ⚠️ Só a variável NÃO basta: com a rota já em SISTEMA o `navigate` não remonta o widget, o
   * pedido não é consumido e o atalho da systray não faz nada. Por isso há dois caminhos — a
   * variável para quem ainda vai montar, o `open` para quem já está montado. O widget registra o
   * seu `open` ao montar e o solta ao sair.
   */
  let pendingSection = null;
  let openSection = null;
  on('ui.config-section', ({ id }) => {
    pendingSection = id;
    if (openSection) openSection(id);
  });

  listWidget({
    id: 'sys-config',
    title: 'CONFIGURAÇÃO',
    hint: 'seções',
    slot: 'stage',
    surface: true,
    /**
     * A página de configuração — menu lateral à esquerda, seção à direita.
     *
     * Ela NÃO reconstrói os controles. As seções de afinação, permissões e voz apenas abrem os
     * painéis que já existem (`createControls` / `createPermissions` / `createSpeechPanel`),
     * pelos MESMOS gatilhos que a systray usa. Duplicar a construção daqueles controles aqui
     * garantiria divergência na primeira alteração: dois lugares desenhando o mesmo slider,
     * lendo o mesmo store, e só um deles atualizado quando o parâmetro mudasse.
     *
     * O que a página acrescenta é o que NÃO cabia num popover: a lista completa de atalhos, que
     * nenhuma outra superfície mostrava desde que a linha fixa do rodapé saiu.
     */
    render(view) {
      const page = el('div', 'config');
      const menu = el('nav', 'config-menu');
      const body = el('div', 'config-body');
      page.append(menu, body);

      const abrir = (seletor) => () => document.querySelector(seletor)?.click();
      const SECTIONS = [
        { id: 'perfil', name: 'PERFIL', render: renderProfiles },
        { id: 'fundo', name: 'FUNDO', render: renderBackdrop,
          note: 'imagens reais do Webb por trás do sistema' },
        { id: 'atalhos', name: 'ATALHOS', render: renderShortcuts },
        { id: 'afinacao', name: 'AFINAÇÃO', open: abrir('[data-tune-toggle]'),
          note: 'a cena inteira — núcleo, céu, grafo, câmera, lente, áudio' },
        { id: 'permissoes', name: 'PERMISSÕES', open: abrir('[data-perms-toggle]'),
          note: 'o que o agente pode fazer, e com quais ferramentas' },
        { id: 'voz', name: 'VOZ', open: abrir('[data-speech-toggle]'),
          note: 'motor, timbre e mistura da fala' },
      ];

      // Quem pediu uma seção específica ganha ela; o pedido é consumido para não repetir na
      // próxima abertura, que teria de voltar ao topo.
      let active = pendingSection && SECTIONS.some((s) => s.id === pendingSection)
        ? pendingSection
        : SECTIONS[0].id;
      pendingSection = null;

      /**
       * Os três perfis, com o custo dito em português.
       *
       * A seção existe porque o painel de afinação tem 22 sliders e nenhum agrupamento por
       * CUSTO: quem abre numa máquina fraca não tem como saber quais três decidem o FPS.
       * Escolher aqui reescreve os 22 de uma vez — é o mesmo store, com nome.
       */
      function renderProfiles(into) {
        const atual = prefs.get('view.profile');
        const blocks = [el('div', 'controls-group', 'QUALIDADE')];
        for (const perfil of PROFILES) {
          const linha = el('div', 'config-profile');
          const escolha = button({ variant: 'select', size: 'sm', on: perfil.id === atual });
          escolha.textContent = perfil.name;
          escolha.addEventListener('click', () => {
            emit({ t: 'ui.apply-profile', id: perfil.id });
            // Redesenha para o botão marcado acompanhar a escolha na hora.
            setTimeout(() => renderProfiles(into), 60);
          });
          linha.append(escolha, el('span', 'config-profile-note', perfil.note));
          blocks.push(linha);
        }
        blocks.push(
          el(
            'div',
            'widget-hint',
            // A contagem vem do SPEC: um número copiado não acompanha uma tabela que cresce.
            `o perfil reescreve os ${TUNING_SPEC.length} parâmetros da afinação · ajustar um slider depois não muda o nome`
          )
        );
        into.replaceChildren(...blocks);
      }

      /**
       * FUNDO — rotação de imagens reais do Webb.
       *
       * Todos os controles escrevem em `prefs` e emitem UM evento; a cena escuta e aplica. A
       * seção não conhece `scene`, pelo mesmo motivo que a de perfil não conhece: widget que
       * alcança a cena por referência direta só funciona montado no app que a tem.
       */
      function renderBackdrop(into) {
        const ligado = prefs.get('sky.backdrop');
        const blocks = [el('div', 'controls-group', 'FUNDO DO UNIVERSO')];

        const troca = (chave, valor) => {
          prefs.set(chave, valor);
          emit({ t: 'ui.apply-backdrop' });
          setTimeout(() => renderBackdrop(into), 60);
        };

        const alterna = (rotulo, chave, nota) => {
          const linha = el('div', 'config-profile');
          const b = button({ variant: 'select', size: 'sm', on: prefs.get(chave) });
          b.textContent = prefs.get(chave) ? 'LIGADO' : 'DESLIGADO';
          b.addEventListener('click', () => troca(chave, !prefs.get(chave)));
          linha.append(b, el('span', 'config-profile-note', `${rotulo} · ${nota}`));
          return linha;
        };

        blocks.push(alterna('exibir', 'sky.backdrop', 'desligado, o céu volta ao fundo preto'));

        if (ligado) {
          blocks.push(
            alterna('transição', 'sky.backdropFade', 'fusão cruzada de 4s; desligada, a troca é seca')
          );

          // Tempo de rotação: passos NOMEADOS, não um slider. A grandeza tem poucas respostas
          // úteis, e um contínuo aqui convidaria a ajustar segundo a segundo algo que ninguém
          // percebe em menos de meio minuto de diferença.
          const tempos = [
            [30, '30s'], [90, '1min30'], [300, '5min'], [900, '15min'],
          ];
          const linhaTempo = el('div', 'config-profile config-row-choices');
          const grupoTempo = el('div', 'config-choices');
          for (const [valor, rotulo] of tempos) {
            const b = button({
              variant: 'select', size: 'sm', on: prefs.get('sky.backdropSeconds') === valor,
            });
            b.textContent = rotulo;
            b.addEventListener('click', () => troca('sky.backdropSeconds', valor));
            grupoTempo.append(b);
          }
          linhaTempo.append(grupoTempo, el('span', 'config-profile-note', 'quanto cada imagem fica no ar'));
          blocks.push(linhaTempo);

          const linhaQ = el('div', 'config-profile config-row-choices');
          const grupoQ = el('div', 'config-choices');
          for (const [valor, rotulo] of [['high', 'ALTA'], ['low', 'BAIXA']]) {
            const b = button({
              variant: 'select', size: 'sm', on: prefs.get('sky.backdropQuality') === valor,
            });
            b.textContent = rotulo;
            b.addEventListener('click', () => troca('sky.backdropQuality', valor));
            grupoQ.append(b);
          }
          linhaQ.append(grupoQ, el('span', 'config-profile-note', 'alta 3200×1800 · baixa 1280×720'));
          blocks.push(linhaQ);

          /*
           * O crédito é OBRIGAÇÃO de licença (CC BY 4.0), não cortesia — e é também informação:
           * saber que aquilo é um berçário estelar real, e não textura, é parte do que a imagem
           * comunica.
           */
          blocks.push(el('div', 'controls-group', 'AS TRÊS IMAGENS'));
          for (const plate of PLATES) {
            const linha = el('div', 'config-key');
            linha.append(
              el('span', 'config-key-label', plate.name),
              el('span', 'config-profile-note', plate.note),
              el('span', 'config-profile-note', plate.credit)
            );
            blocks.push(linha);
          }
          blocks.push(
            el('div', 'widget-hint', 'ESA/Webb, NASA & CSA · CC BY 4.0 · os únicos binários do projeto')
          );
        }

        into.replaceChildren(...blocks);
      }

      function renderShortcuts(into) {
        /*
         * Gerado de `keys.list()`, NUNCA escrito à mão.
         *
         * A versão manual desta lista morava no rodapé e apodreceu: anunciava `G` depois de a
         * tecla ter virado ⌘G. Aqui a tecla é derivada do próprio registro do atalho, então um
         * `bind` que mude passa a aparecer certo sem ninguém lembrar de vir aqui.
         */
        const groups = new Map();
        for (const entry of keys.list()) {
          if (!groups.has(entry.group)) groups.set(entry.group, []);
          groups.get(entry.group).push(entry);
        }
        const blocks = [];
        for (const [group, entries] of groups) {
          blocks.push(el('div', 'controls-group', group));
          for (const entry of entries) {
            const row = el('div', 'config-key');
            row.append(el('kbd', 'config-kbd', entry.keys));
            row.append(el('span', 'config-key-label', entry.label));
            // "vale digitando" é a distinção que decide se um atalho pode ser uma letra solta —
            // é a regra que fez `G` sair e ⌘G entrar, e ela merece estar visível.
            if (entry.whileTyping) row.append(el('i', 'config-key-note', 'vale digitando'));
            blocks.push(row);
          }
        }
        if (!blocks.length) blocks.push(el('div', 'widget-empty', 'nenhum atalho registrado'));
        into.replaceChildren(...blocks);
      }

      function draw() {
        menu.replaceChildren(
          ...SECTIONS.map((section) => {
            const item = button({ variant: 'select', size: 'sm', on: section.id === active });
            item.textContent = section.name;
            item.addEventListener('click', () => {
              active = section.id;
              // Seção que é atalho para um painel ABRE o painel e continua marcada: a página é
              // o índice, o painel é o lugar onde se mexe.
              section.open?.();
              draw();
            });
            return item;
          })
        );
        const section = SECTIONS.find((entry) => entry.id === active);
        if (section?.render) section.render(body);
        else body.replaceChildren(el('div', 'widget-empty', section?.note || ''));
      }

      draw();
      view.set([page]);

      openSection = (id) => {
        if (!SECTIONS.some((entry) => entry.id === id)) return;
        active = id;
        pendingSection = null;
        draw();
      };
      // Sem o `destroy`, uma segunda montagem deixaria a primeira respondendo ao evento e
      // desenhando numa página que saiu do DOM.
      return { destroy: () => { openSection = null; } };
    },
  });

  listWidget({
    id: 'fs-content',
    title: 'CONTEÚDO',
    slot: 'stage',
    surface: true,
    render(view, ctx) {
      /*
       * Lê o ARQUIVO NO DISCO, com o índice como reserva.
       *
       * `/api/node` devolve os chunks INDEXADOS, que são a foto do último `reindex`: com os anéis
       * de Saturno na cena isso é contradição visível — o anel ao lado da estrela diz "este
       * arquivo mudou" enquanto o painel mostra o texto de antes da mudança. `/api/file` lê o
       * disco, com a barreira de raízes em `server/files.py`.
       *
       * O índice continua servindo, e não como enfeite: ele é o que existe quando o arquivo
       * saiu do disco (renomeado, removido, fora da raiz permitida). Nesse caso a tela DIZ que
       * está mostrando o índice — mostrar conteúdo velho sem avisar é a mentira que esta
       * correção existe para acabar.
       */
      const REPOUSO = 'escolha um arquivo na árvore · ou passe o cursor sobre um astro';
      // `true` a partir do momento em que um arquivo foi aberto: daí em diante o hover do céu
      // não pode mais escrever aqui.
      let lendo = false;

      const handler = async ({ source }) => {
        lendo = true;
        // The address follows the reader: this widget is the one that knows which file is open,
        // so it is the one that writes the sub-route. Re-entering the same address is a no-op.
        ctx.navigate(ctx.route, source);
        view.empty('lendo…');
        try {
          const blocks = [el('div', 'fs-title', source)];
          try {
            const file = await api.fileBySource(source);
            // `el(tag, classe, TEXTO)` — o terceiro argumento é texto, não nó. Passar o `<pre>`
            // ali o transformava em "[object HTMLPreElement]" na tela.
            const block = el('div', 'chunk');
            block.append(el('pre', 'chunk-text', file.text));
            blocks.push(block);
            if (file.truncated) {
              blocks.push(el('div', 'widget-hint', `truncado · ${file.bytes} bytes no disco`));
            }
            view.set(blocks);
            return;
          } catch (diskError) {
            blocks.push(
              el('div', 'widget-hint', `disco indisponível (${diskError.message}) · mostrando o índice`)
            );
          }
          const payload = await api.node(source);
          for (const chunk of payload.chunks || []) {
            const block = el('div', 'chunk');
            if (chunk.section) block.append(el('div', 'chunk-section', `§ ${chunk.section}`));
            block.append(el('pre', 'chunk-text', chunk.text));
            blocks.push(block);
          }
          if (blocks.length === 2) blocks.push(el('div', 'widget-empty', 'sem chunks indexados'));
          view.set(blocks);
        } catch (error) {
          view.empty(`falhou: ${error.message}`);
        }
      };
      /*
       * SÓ `ui.open-file`. Assinar `ui.select` também abria DOIS painéis com o mesmo arquivo.
       *
       * `answer.js` já escuta `ui.select` para preencher o inspetor da direita — clicar numa
       * estrela disparava os dois assinantes e o conteúdo aparecia duas vezes, um painel
       * tapando o outro. Não era erro de layout: eram duas renderizações legítimas do mesmo
       * evento.
       *
       * A divisão que sobra tem dono claro: estrela → inspetor da direita (leitura rápida do
       * que se clicou no céu); árvore/busca → este leitor central (leitura longa, com fundo e
       * rolagem). Antes de assinar `ui.select` aqui de novo, remova o de lá.
       */
      readerClose = () => {
        if (!lendo) return false;
        lendo = false;
        // Volta ao REPOUSO, que é também a superfície de hover do céu — fechar o leitor
        // devolve a área para quem estava usando antes, em vez de deixar um vazio mudo.
        view.empty(repousoAtual());
        return true;
      };

      /*
       * O REPOUSO não pode contradizer a HUD.
       *
       * Com um astro travado, o cabeçalho dizia "TRAVADO browser/README.md" e esta área continuava
       * pedindo "passe o cursor sobre um astro" — a interface convidando para um gesto já feito, e
       * duas afirmações sobre o mesmo estado. Travar não abre o leitor de propósito
       * (`ui.focus-node` existe justamente para mover só a câmera), mas o repouso tem de saber
       * qual é o próximo passo em vez de repetir o anterior.
       */
      let travado = null;
      const repousoAtual = () =>
        travado ? `${travado} · travado no céu — clique de novo para abrir` : REPOUSO;
      const offFoco = on('ui.node-focus', ({ source }) => {
        travado = source ?? null;
        if (!lendo) view.empty(repousoAtual());
      });

      const offOpen = on('ui.open-file', handler);
      /*
       * A assinatura do clique no céu NÃO mora aqui dentro — mora no registro, acima.
       *
       * Clicar num astro navega para este app, e a navegação MONTA este widget: quando o `render`
       * roda, o `ui.select` já passou. Assinar aqui deixaria o leitor vazio exatamente no gesto
       * que deveria abri-lo — a mesma corrida que esvaziava o painel de contexto.
       */
      abrirAgora = (source) => handler({ source });

      // O palco tem uma função só: LER o arquivo. Quem descreve o astro sob atenção é o painel
      // CONTEXTO, que existe em toda rota — afirmar aqui também daria duas vozes sobre o céu.
      view.empty(REPOUSO);

      /*
       * O pedido pendente: o clique que aconteceu ANTES desta montagem. Consumido, como
       * `pendingSection` — um pedido que sobrevivesse venceria o endereço em toda montagem
       * seguinte, e `#/files/<outro>` abriria o arquivo clicado no céu horas antes.
       */
      if (pedidoDeLeitura) {
        const pendente = pedidoDeLeitura;
        pedidoDeLeitura = null;
        handler({ source: pendente });
      } else if (ctx.arg) {
        // Nothing pending: the address IS the request. This is what makes `#/files/<caminho>`
        // survive F5 and travel in a link, instead of being decoration on the hash.
        handler({ source: ctx.arg });
      }

      return {
        destroy: () => {
          offOpen();
          offFoco();
          abrirAgora = null;
          readerClose = null;
        },
      };
    },
  });
}

// ---------------------------------------------------------------- SISTEMA

function registerSystemWidgets() {
  let health = null;

  listWidget({
    id: 'sys-about',
    title: 'SOBRE ESTE SISTEMA',
    slot: 'left',
    render(view) {
      async function draw() {
        try {
          health = await api.health();
        } catch (error) {
          return view.empty(`servidor não respondeu: ${error.message}`);
        }
        const rows = [
          ['NÚCLEO', health.brain === 'claude' ? 'claude · subprocesso' : `ollama · ${health.ollama?.models?.[0] ?? '—'}`],
          ['RAIZ DO AGENTE', health.agent_cwd],
          ['MEMÓRIA VETORIAL', `${(health.qdrant?.points ?? 0).toLocaleString('pt-BR')} chunks`],
          ['VETORIZADOR', health.embed_ready ? 'onnx · cpu · local' : 'carregando'],
          ['VOZ', health.tts?.online ? `${health.tts.voice} · ${health.tts.voices.length} vozes` : 'offline'],
        ];
        view.set(rows.map(([label, value]) => {
          const row = el('div', 'kv');
          row.append(el('span', 'kv-label', label), el('span', 'kv-value', value));
          return row;
        }));
      }
      draw();
      const timer = setInterval(draw, 15000);
      return { destroy: () => clearInterval(timer) };
    },
  });

  listWidget({
    id: 'sys-services',
    title: 'SERVIÇOS',
    hint: 'DESEJADO vs REAL',
    slot: 'right',
    grow: 1,
    /**
     * Três colunas: o que esta instalação DECLAROU querer, o que está no ar, e o que se perde.
     *
     * Sem o desejado, TTS fora do ar é indistinguível de TTS que nunca foi para ser usado aqui —
     * e pintar de vermelho uma ausência que é escolha ensina o operador a ignorar vermelho, que
     * é o começo de toda cegueira operacional.
     *
     * ⚠️ `start_hint` é TEXTO copiável, não botão. O SpatIA não sobe Qdrant nem Ollama, e um
     * painel que finge poder é a mesma classe de erro do interruptor que não controla.
     */
    render(view, ctx) {
      async function draw() {
        let data;
        try {
          data = await ctx.api.units();
        } catch (error) {
          return view.empty(error.message);
        }

        const blocks = [];
        if (data.error) blocks.push(el('div', 'widget-error', `⚠ ${data.error}`));
        if (data.missing.length) {
          // O que foi declarado NECESSÁRIO e não está lá é a primeira linha, não uma cor no meio
          // da lista: é o único estado em que a instalação não faz o que prometeu fazer.
          blocks.push(
            el('div', 'widget-error', `⚠ falta o que é obrigatório: ${data.missing.join(', ')}`)
          );
        }

        for (const unit of data.units) {
          // `disabled` não é falha: é decisão declarada, e vai para o fim em tom apagado.
          const desligado = unit.wanted === 'disabled';
          const ruim = unit.missing;
          const row = el('div', `unit ${unit.up && !ruim ? '' : ruim ? 'down' : 'warn'}`);
          row.append(el('i', 'dot'), el('span', 'unit-name', unit.id));
          row.append(
            el(
              'span',
              'unit-detail',
              desligado
                ? 'desligado nesta instalação'
                : `${unit.wanted} · ${unit.up ? 'no ar' : 'fora'}`
            )
          );
          row.querySelector('.dot').dataset.status = desligado ? 'off' : unit.up ? 'on' : ruim ? 'off' : 'busy';
          // A degradação só interessa quando ela está ACONTECENDO.
          if (!unit.up && !desligado && unit.degrades) {
            row.append(el('div', 'unit-sub', `perde-se: ${unit.degrades}`));
          }
          if (!unit.up && !desligado && unit.start_hint) {
            row.append(el('div', 'unit-sub', unit.start_hint));
          }
          blocks.push(row);
        }

        if (!data.declared) {
          blocks.push(
            el('div', 'widget-hint', 'sem config/units.json: tudo é opcional e nada é falha declarada')
          );
        }
        view.set(blocks);
      }
      draw();
      const timer = setInterval(draw, 10000);
      return { destroy: () => clearInterval(timer) };
    },
  });

  listWidget({
    id: 'sys-quota',
    title: 'QUOTAS',
    hint: 'CUSTO E JANELA',
    slot: 'left',
    render(view, ctx) {
      /*
       * O teto vem do servidor e a sessão vem do estado local, e são grandezas diferentes: a
       * sessão é esta aba, o teto é o dia inteiro em disco. Misturá-las num número só faria
       * duas abas abertas parecerem ter gasto metade do que gastaram.
       */
      let budget = null;
      ctx.api.health().then((payload) => { budget = payload.budget; draw(); }).catch(() => {});

      function draw() {
        const store = snapshot();
        const rows = [
          ['CUSTO DA SESSÃO', money(store.cost)],
          ['TURNOS', String(store.turns || '—')],
          ['CARGA COGNITIVA', store.cogTokens ? `${store.cogTokens.toLocaleString('pt-BR')} tk` : '—'],
        ];
        if (budget) {
          // Teto 0 é ausência de teto, e a tela tem de DIZER isso: um limite ausente e um limite
          // folgado parecem iguais num número solto.
          rows.push(['GASTO HOJE', money(budget.spent_today)]);
          rows.push([
            'TETO DIÁRIO',
            budget.max_daily_usd
              ? `${money(budget.max_daily_usd)} · resta ${money(budget.remaining_usd)}`
              : 'sem teto (AGENT_MAX_DAILY_USD)',
          ]);
          if (budget.max_concurrent) {
            rows.push(['SIMULTÂNEAS', `${budget.running} de ${budget.max_concurrent}`]);
          }
        }
        if (store.limit?.resets_at) {
          const remaining = Math.max(0, store.limit.resets_at * 1000 - Date.now());
          rows.push([
            `JANELA ${String(store.limit.window || '').toUpperCase()}`,
            `${Math.floor(remaining / 3_600_000)}h${String(Math.floor((remaining % 3_600_000) / 60_000)).padStart(2, '0')}`,
          ]);
        }
        view.set(rows.map(([label, value]) => {
          const row = el('div', 'kv');
          row.append(el('span', 'kv-label', label), el('span', 'kv-value', value));
          return row;
        }));
      }
      draw();
      const timer = setInterval(draw, 1000);
      return { destroy: () => clearInterval(timer) };
    },
  });
}

// ---------------------------------------------------------------- WEB

function registerWebWidgets() {
  /*
   * Campo de busca PRÓPRIO do app, que sempre pesquisa na internet.
   *
   * O compositor do rodapé respeita o toggle global; perguntar na "página de web" e receber "o
   * workspace não tem resposta" viola a expectativa. Este campo busca na web sem depender de um
   * toggle em outro canto da tela.
   */
  listWidget({
    id: 'web-search',
    title: 'BUSCAR NA INTERNET',
    hint: 'SEMPRE WEB',
    slot: 'left',
    render(view) {
      const box = el('input', 'fs-search');
      box.placeholder = 'o que procurar na internet';
      box.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const query = box.value.trim();
        if (!query) return;
        box.value = '';
        // `web: true` explícito — não é AUTO, não é heurística. Este campo tem uma promessa.
        api.ask(query, { web: true });
      });
      view.push(box);
      view.push(el('div', 'unit-sub', 'a pergunta sai da máquina · o resultado volta como meteoro'));
      return null;
    },
  });

  listWidget({
    id: 'web-providers',
    title: 'PROVEDORES',
    slot: 'left',
    grow: 1,
    render(view) {
      async function draw() {
        try {
          const { providers } = await api.integrations();
          view.set(providers.map((provider) => {
            const row = el('div', `unit ${provider.online ? '' : 'down'}`);
            row.append(el('i', 'dot'), el('span', 'unit-name', provider.label));
            row.append(el('span', 'unit-detail', provider.online ? 'pronto' : provider.needs));
            row.querySelector('.dot').dataset.status = provider.online ? 'on' : 'off';
            return row;
          }));
        } catch (error) {
          view.empty(error.message);
        }
      }
      draw();
      return null;
    },
  });
}

// ---------------------------------------------------------------- PONTE

function registerBridgeWidgets() {
  listWidget({
    id: 'br-credentials',
    title: 'CREDENCIAIS',
    hint: 'IMPRESSÃO, NUNCA O VALOR',
    slot: 'left',
    /**
     * O que existe, onde mora, e a impressão — nunca o segredo.
     *
     * Não há caminho de código que devolva o valor, nem mascarado: mascarar seria manter o
     * caminho e confiar na formatação. A impressão existe para o operador dizer "é a mesma
     * credencial de ontem" sem que esse caminho precise existir.
     */
    render(view, ctx) {
      async function draw() {
        let data;
        try {
          data = await ctx.api.credentials();
        } catch (error) {
          return view.empty(error.message);
        }
        const store = data.store;
        const blocks = [];

        // Onde a credencial mora é pergunta de tela, e a resposta não pode ser "depende".
        const guarda = el('div', 'kv');
        guarda.append(el('span', 'kv-label', 'GUARDADAS EM'), el('span', 'kv-value', store.storage));
        blocks.push(guarda);
        if (store.mode_ok === false) {
          // Segredo legível por outros é achado, não detalhe.
          blocks.push(el('div', 'widget-error', `⚠ permissão do arquivo é ${store.mode}, deveria ser 0o600`));
        }

        for (const provider of data.providers) {
          const cred = provider.credential;
          const ok = cred?.state === 'válida';
          const row = el('div', `unit ${ok ? '' : 'down'}`);
          row.append(el('i', 'dot'), el('span', 'unit-name', provider.label));
          row.append(
            el('span', 'unit-detail', cred ? `${cred.state} · ${cred.fingerprint}` : provider.configured ? 'sem credencial' : provider.needs)
          );
          row.querySelector('.dot').dataset.status = ok ? 'on' : 'off';
          if (cred?.scopes?.length) row.append(el('div', 'unit-sub', cred.scopes.join(' ')));

          /*
           * ⚠️ O redirect EFETIVO fica visível antes de autorizar.
           *
           * Provedores exigem a porta exata registrada, e alguns exigem `localhost` em vez de
           * `127.0.0.1`. Descobrir isso no meio do fluxo dá uma mensagem que não diz qual dos
           * dois lados está errado — `ESPATIAL_PORT` deixa de ser detalhe local aqui.
           */
          row.append(el('div', 'unit-sub', `redirect: ${provider.redirect_uri}`));

          const acao = button({ variant: 'select', size: 'sm' });
          if (cred) {
            acao.textContent = 'ESQUECER';
            acao.addEventListener('click', async () => {
              await ctx.api.oauthForget(provider.id);
              draw();
            });
          } else {
            acao.textContent = 'AUTORIZAR';
            acao.disabled = !provider.configured;
            acao.addEventListener('click', async () => {
              const { url, error } = await ctx.api.oauthStart(provider.id);
              // A página abre a URL e não sabe mais nada: o verifier nunca chegou aqui.
              if (url) window.open(url, '_blank', 'noopener');
              else view.push(el('div', 'widget-error', error || 'não consegui iniciar'));
            });
          }
          row.append(acao);
          blocks.push(row);
        }

        blocks.push(el('div', 'controls-group', 'PONTE AUTENTICADA'));
        for (const b of data.bridge) {
          blocks.push(el('div', 'unit-sub', `${b.url} → ${b.base} · ${b.state}`));
        }
        // A regra completa, escrita onde ela é executada.
        blocks.push(el('div', 'widget-hint', 'o agente fala com a ponte, não com o terceiro — o token não entra no contexto dele'));
        view.set(blocks);
      }
      draw();
      return null;
    },
  });

  listWidget({
    id: 'br-webhooks',
    title: 'WEBHOOKS DE ENTRADA',
    slot: 'left',
    grow: 1,
    render(view) {
      async function draw() {
        try {
          const { webhooks } = await api.integrations();
          view.set(webhooks.map((hook) => {
            const row = el('div', `unit ${hook.verified ? '' : 'warn'}`);
            row.append(el('i', 'dot'), el('span', 'unit-name', hook.label));
            row.append(el('span', 'unit-detail', hook.verified ? 'HMAC ativo' : 'sem verificação'));
            row.querySelector('.dot').dataset.status = hook.verified ? 'on' : 'busy';
            const url = el('div', 'unit-sub', `POST ${hook.url}`);
            row.append(url);
            if (!hook.verified) row.append(el('div', 'unit-sub', `defina ${hook.needs} para exigir assinatura`));
            return row;
          }));
        } catch (error) {
          view.empty(error.message);
        }
      }
      draw();
      const timer = setInterval(draw, 20000);
      return { destroy: () => clearInterval(timer) };
    },
  });

  listWidget({
    id: 'br-deliveries',
    title: 'ENTREGAS RECENTES',
    slot: 'stage',
    // DECIDIDO que sim: são linhas de texto no centro do palco, que é onde o disco de acreção é
    // desenhado. Sem a moldura opaca o disco atravessa a lista — o mesmo caso que `index.html`
    // nomeia na superfície de painel, e o que separa isto da RESPOSTA (prosa sobre o céu, que
    // fica sem moldura de propósito) é que uma entrega não tem lugar nenhum no céu.
    surface: true,
    render(view) {
      async function draw() {
        try {
          const { history } = await api.integrations();
          if (!history.length) {
            return view.empty('nenhuma entrega ainda — aponte um webhook para POST /hooks/<fonte>');
          }
          view.set(history.map((item) => {
            const row = el('div', 'delivery');
            const when = new Date(item.at * 1000);
            row.append(el('span', 'row-time', when.toTimeString().slice(0, 8)));
            row.append(el('span', 'delivery-source', item.label));
            row.append(el('span', 'delivery-summary', item.summary || '—'));
            row.append(el('span', 'delivery-meta', item.verified ? 'verificada' : 'sem HMAC'));
            return row;
          }));
        } catch (error) {
          view.empty(error.message);
        }
      }
      draw();
      // Entrega nova chega pelo stream; redesenhar no evento evita polling curto.
      const off = on('tool', (event) => {
        if (event.origin === 'webhook' && event.phase === 'result') draw();
      });
      return { destroy: off };
    },
  });

  /*
   * Servidores MCP — DUAS listas, de propósito.
   *
   * Só o que o agente reporta no evento `brain` não explica uma AUSÊNCIA — um servidor que não
   * aparece não diz por quê, e a omissão silenciosa é pior que a falta.
   *
   *   DECLARADO  — o que existe em arquivo, por escopo, com o escopo desligado marcado como
   *                fora e o motivo escrito. Vem de `/api/mcp` e existe antes de perguntar nada.
   *   REPORTADO  — o que o agente de fato recebeu na sessão. É a verdade, e é maior que a
   *                lista declarada: conectores da conta (`claude.ai …`) não estão em arquivo
   *                nenhum que este servidor possa ler.
   *
   * As duas listas discordarem é informação, não bug — e é por isso que ficam separadas em vez
   * de fundidas numa só que esconderia a diferença.
   */
  listWidget({
    id: 'br-mcp',
    title: 'SERVIDORES MCP',
    hint: 'DECLARADO vs SESSÃO',
    slot: 'right',
    grow: 1,
    render(view) {
      let inventory = null;

      function unit(name, detail, status) {
        const row = el('div', `unit ${status === 'on' ? '' : 'down'}`);
        row.append(el('i', 'dot'), el('span', 'unit-name', name));
        if (detail) row.append(el('span', 'unit-detail', detail));
        row.querySelector('.dot').dataset.status = status;
        return row;
      }

      function draw() {
        const brain = snapshot().brain;
        const blocks = [];

        if (inventory) {
          blocks.push(el('div', 'controls-group', 'DECLARADO EM ARQUIVO'));
          for (const scope of inventory.scopes) {
            const suffix = scope.loaded ? 'carregado' : 'FONTE DESLIGADA';
            blocks.push(el('div', 'unit-sub', `${scope.label} · ${scope.where} · ${suffix}`));
            if (!scope.servers.length) {
              blocks.push(el('div', 'unit-sub', '  nenhum servidor neste escopo'));
              continue;
            }
            for (const server of scope.servers) {
              const inert = server.approved === false;
              blocks.push(
                unit(
                  server.name,
                  inert ? 'não aprovado' : server.transport,
                  scope.loaded && !inert ? 'on' : 'off'
                )
              );
            }
          }
          for (const item of inventory.excluded) {
            blocks.push(el('div', 'unit-sub', `⚠ ${item.name} fora: ${item.reason}`));
          }
          /*
           * `partial` do servidor: `server/mcp_scopes.py` o marca quando há fonte que ele não
           * conseguiu ler. Uma lista que se apresenta como total sem ser é pior que uma lista
           * curta com aviso.
           */
          if (inventory.partial) {
            blocks.push(
              el('div', 'unit-sub', '⚠ inventário PARCIAL — há fontes que este servidor não conseguiu ler')
            );
          }
        } else {
          blocks.push(el('div', 'unit-sub', 'inventário de escopos indisponível'));
        }

        blocks.push(el('div', 'controls-group', 'REPORTADO PELA SESSÃO'));
        if (!brain) {
          blocks.push(el('div', 'unit-sub', 'faça uma pergunta: esta lista vem do agente ao iniciar'));
        } else {
          blocks.push(el('div', 'unit-sub', `${brain.tools} ferramentas na sessão · cwd ${brain.cwd}`));
          for (const name of brain.mcp || []) blocks.push(unit(name, '', 'on'));
          // A diferença entre as listas é o dado mais informativo desta tela, então ela é
          // calculada e escrita, não deixada para o operador cruzar com o olho.
          const declared = new Set(
            (inventory?.scopes || []).flatMap((scope) => scope.servers.map((s) => s.name))
          );
          const extra = (brain.mcp || []).filter((name) => !declared.has(name));
          if (extra.length) {
            blocks.push(
              el('div', 'unit-sub', `${extra.length} não está em arquivo que este servidor leia (conector da conta)`)
            );
          }
          const missing = [...declared].filter((name) => !(brain.mcp || []).includes(name));
          if (missing.length) {
            blocks.push(el('div', 'unit-sub', `⚠ declarado e ausente da sessão: ${missing.join(', ')}`));
          }
        }

        // Honestidade explícita na própria tela: este servidor não é cliente MCP.
        blocks.push(el('div', 'unit-sub', 'este servidor não fala MCP — quem alcança estes servidores é o agente'));
        view.set(blocks);
      }

      function refresh() {
        api
          .mcp()
          .then((payload) => {
            inventory = payload;
            draw();
          })
          .catch(() => draw());
      }

      refresh();
      draw();
      const offBrain = on('brain', draw);
      // Fonte de settings trocada no painel de permissões: o inventário de escopos muda com
      // ela, e reconsultar é o motivo declarado de esta rota existir separada da de permissões.
      const offPerms = on('ui.permissions-changed', refresh);
      return { destroy: () => { offBrain(); offPerms(); } };
    },
  });
}

