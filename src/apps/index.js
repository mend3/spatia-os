/**
 * Os quatro apps da primeira leva, e os widgets que só eles usam.
 *
 * Cada app é um manifesto: onde orbita, de que cor é, quais widgets compõe. A ordem no array
 * de widgets é a ordem visual, e a ordem de registro dos apps é a ordem na dock e nos atalhos
 * numéricos — `1` abre o primeiro.
 *
 * A **Ponte MCP** merece uma nota de honestidade: este servidor NÃO é cliente MCP. Os
 * servidores (Slack, Notion, Drive, hub-board) são alcançados pelo agente, não por aqui.
 * Então a ponte mostra o que o agente reporta ter, e agir sobre eles é *pedir ao agente*. Ela
 * poderia falsificar uma lista de canais e ninguém notaria na tela — e é exatamente por isso
 * que não faz.
 */
import { registerApp } from '../kernel/registry.js';
import { registerCoreWidgets, listWidget } from './widgets-core.js';
import { registerSkyTime } from './sky-time.js';
import { el, set, shortPath, money } from '../hud/dom.js';
import { button } from '../hud/button.js';
import { on, emit } from '../core/bus.js';
import { snapshot } from '../core/state.js';
import * as api from '../core/api.js';
import * as keys from '../core/keys.js';
import * as prefs from '../core/prefs.js';
import { PROFILES } from '../core/profiles.js';

const COLORS = { files: 0x7ee0c0, system: 0xffab54, web: 0xff9b4a, bridge: 0x5ce1e6 };

export function registerApps() {
  registerCoreWidgets();
  registerSkyTime();
  registerFilesWidgets();
  registerSystemWidgets();
  registerWebWidgets();
  registerBridgeWidgets();

  registerApp({
    id: 'files',
    name: 'ARQUIVOS',
    tagline: 'o grafo como sistema de arquivos',
    color: COLORS.files,
    orbit: { radius: 12.5, inclination: -0.24, phase: 0.4 },
    // A janela do tempo entra aqui também: este é o app sobre o corpus, e navegar o corpus por
    // data é a mesma operação que navegá-lo por pasta.
    widgets: ['fs-tree', 'fs-locate', 'fs-content', 'sky-time', 'timeline'],
  });

  registerApp({
    id: 'system',
    name: 'SISTEMA',
    tagline: 'saúde, custo, permissões, afinação',
    color: COLORS.system,
    orbit: { radius: 15.5, inclination: 0.36, phase: 2.1 },
    widgets: ['sys-config', 'sys-about', 'sys-services', 'vitals', 'sys-quota', 'sky-time', 'timeline'],
  });

  registerApp({
    id: 'web',
    name: 'WEB',
    tagline: 'provedores, resultados, ingestão',
    color: COLORS.web,
    orbit: { radius: 18.5, inclination: -0.42, phase: 3.9 },
    widgets: ['web-search', 'web-providers', 'web-results', 'answer', 'sky-time', 'timeline'],
  });

  registerApp({
    id: 'bridge',
    name: 'PONTE',
    tagline: 'integrações, webhooks, MCP',
    color: COLORS.bridge,
    orbit: { radius: 21, inclination: 0.18, phase: 5.4 },
    widgets: ['br-webhooks', 'br-mcp', 'br-deliveries', 'sky-time', 'timeline'],
  });
}

/** Widgets da vista de sistema (a rota raiz). */
export const SYSTEM_VIEW = [
  'vitals', 'plan', 'timeline', 'answer', 'memory', 'tools', 'web-results',
  // A fenda `strip` é dos residentes, e o scrubber pertence a ela: ele controla o CÉU, que está
  // visível em toda rota, então tirá-lo da tela deixaria a janela temporal ativa e sem controle.
  'sky-time',
];

// ---------------------------------------------------------------- ARQUIVOS

function registerFilesWidgets() {
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
          row.addEventListener('click', () => emit({ t: 'ui.open-file', source: node.source }));
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
    id: 'fs-locate',
    title: 'LOCALIZAR',
    hint: 'SEMÂNTICO',
    slot: 'right',
    grow: 1,
    render(view) {
      const box = el('input', 'fs-search');
      box.placeholder = 'descreva o que procura';
      box.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        const query = box.value.trim();
        if (!query) return;
        view.empty('buscando…');
        try {
          const { hits } = await api.search(query, 12);
          if (!hits.length) return view.empty('nenhum resultado');
          view.set(
            hits.map((hit) => {
              const row = button({ variant: 'row', size: 'row', data: { entry: 'file' } });
              row.append(el('span', 'hit-score', (hit.score ?? 0).toFixed(3)));
              row.append(el('span', 'fs-name', shortPath(hit.source, 40)));
              row.addEventListener('click', () => emit({ t: 'ui.open-file', source: hit.source }));
              return row;
            })
          );
        } catch (error) {
          view.empty(`falhou: ${error.message}`);
        }
      });
      // O input fica FORA da área rolável: buscar não pode exigir rolar até o campo.
      view.push(box);
      return null;
    },
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
        { id: 'atalhos', name: 'ATALHOS', render: renderShortcuts },
        { id: 'afinacao', name: 'AFINAÇÃO', open: abrir('[data-tune-toggle]'),
          note: 'a cena inteira — núcleo, céu, grafo, câmera, lente, áudio' },
        { id: 'permissoes', name: 'PERMISSÕES', open: abrir('[data-perms-toggle]'),
          note: 'o que o agente pode fazer, e com quais ferramentas' },
        { id: 'voz', name: 'VOZ', open: abrir('[data-speech-toggle]'),
          note: 'motor, timbre e mistura da fala' },
      ];

      let active = SECTIONS[0].id;

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
            'o perfil reescreve os 22 parâmetros da afinação · ajustar um slider depois não muda o nome'
          )
        );
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
      return null;
    },
  });

  listWidget({
    id: 'fs-content',
    title: 'CONTEÚDO',
    slot: 'stage',
    surface: true,
    render(view) {
      /*
       * Lê o ARQUIVO NO DISCO, com o índice como reserva.
       *
       * A rota `/api/file` existia, com barreira de raízes em `server/files.py`, cliente em
       * `core/api.js` — e ZERO chamadores. O leitor usava `/api/node`, que devolve os chunks
       * INDEXADOS: a foto do último `reindex`. Com os anéis de Saturno na cena, isso virou
       * contradição visível — o anel ao lado da estrela dizendo "este arquivo mudou" enquanto
       * o painel mostrava o texto de antes da mudança.
       *
       * O índice continua servindo, e não como enfeite: ele é o que existe quando o arquivo
       * saiu do disco (renomeado, removido, fora da raiz permitida). Nesse caso a tela DIZ que
       * está mostrando o índice — mostrar conteúdo velho sem avisar é a mentira que esta
       * correção existe para acabar.
       */
      const handler = async ({ source }) => {
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
      const offOpen = on('ui.open-file', handler);
      view.empty('escolha um arquivo na árvore');
      return { destroy: () => offOpen() };
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
    hint: 'ESTADO REAL',
    slot: 'right',
    grow: 1,
    render(view) {
      async function draw() {
        let data;
        try {
          data = await api.health();
        } catch (error) {
          return view.empty(error.message);
        }
        const units = [
          ['qdrant', 'MEMÓRIA VETORIAL', data.qdrant?.online, `${data.qdrant?.points ?? 0} chunks`],
          ['claude', 'AGENTE', data.claude_cli, data.brain],
          ['ollama', 'MODELO LOCAL', data.ollama?.online, `${data.ollama?.models?.length ?? 0} modelos`],
          ['tts', 'SÍNTESE DE VOZ', data.tts?.online, data.tts?.voice ?? '—'],
          ...(data.providers || []).map((p) => [p.id, `BUSCA · ${p.label}`, p.online, p.online ? 'pronto' : p.needs]),
        ];
        view.set(units.map(([id, label, up, detail]) => {
          const row = el('div', `unit ${up ? '' : 'down'}`);
          row.append(el('i', 'dot'), el('span', 'unit-name', label), el('span', 'unit-detail', detail));
          row.querySelector('.dot').dataset.status = up ? 'on' : 'off';
          row.dataset.unit = id;
          return row;
        }));
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
    render(view) {
      function draw() {
        const store = snapshot();
        const rows = [
          ['CUSTO DA SESSÃO', money(store.cost)],
          ['TURNOS', String(store.turns || '—')],
          ['CARGA COGNITIVA', store.cogTokens ? `${store.cogTokens.toLocaleString('pt-BR')} tk` : '—'],
        ];
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
   * Estar no app Web não mudava nada: a única entrada era o compositor do rodapé, que respeita
   * o toggle global. Perguntar na "página de web" e receber "o workspace não tem resposta" é a
   * expectativa sendo violada — o app Web tem que buscar na web, sem depender de um toggle em
   * outro canto da tela.
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
   * A versão anterior mostrava só o que o agente reporta no evento `brain`, e por isso não
   * tinha como explicar uma ausência: `hub-board` não aparecia e a tela não dizia nada. O
   * defeito não era a ausência do servidor, era a omissão silenciosa.
   *
   * Agora:
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

      api
        .mcp()
        .then((payload) => {
          inventory = payload;
          draw();
        })
        .catch(() => draw());
      draw();
      return { destroy: on('brain', draw) };
    },
  });
}

