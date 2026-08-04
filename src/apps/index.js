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
import { el, set, shortPath, money } from '../hud/dom.js';
import { on, emit } from '../core/bus.js';
import { snapshot } from '../core/state.js';
import * as api from '../core/api.js';

const COLORS = { files: 0x7ee0c0, system: 0xffab54, web: 0xff9b4a, bridge: 0x5ce1e6 };

export function registerApps() {
  registerCoreWidgets();
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
    widgets: ['fs-tree', 'fs-locate', 'fs-content', 'timeline'],
  });

  registerApp({
    id: 'system',
    name: 'SISTEMA',
    tagline: 'saúde, custo, permissões, afinação',
    color: COLORS.system,
    orbit: { radius: 15.5, inclination: 0.36, phase: 2.1 },
    widgets: ['sys-about', 'sys-services', 'vitals', 'sys-quota', 'timeline'],
  });

  registerApp({
    id: 'web',
    name: 'WEB',
    tagline: 'provedores, resultados, ingestão',
    color: COLORS.web,
    orbit: { radius: 18.5, inclination: -0.42, phase: 3.9 },
    widgets: ['web-providers', 'web-results', 'answer', 'timeline'],
  });

  registerApp({
    id: 'bridge',
    name: 'PONTE',
    tagline: 'integrações, webhooks, MCP',
    color: COLORS.bridge,
    orbit: { radius: 21, inclination: 0.18, phase: 5.4 },
    widgets: ['br-webhooks', 'br-mcp', 'br-deliveries', 'timeline'],
  });
}

/** Widgets da vista de sistema (a rota raiz) — o conjunto que já existia. */
export const SYSTEM_VIEW = ['vitals', 'plan', 'timeline', 'answer', 'memory', 'tools', 'web-results'];

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
          const button = el('button', 'fs-crumb-part', part);
          button.addEventListener('click', () => {
            cwd = target;
            notify();
          });
          crumb.append(el('span', 'fs-crumb-sep', '/'), button);
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
          const row = el('button', 'fs-row fs-dir');
          row.append(el('span', 'fs-glyph', '▸'), el('span', 'fs-name', dir));
          row.addEventListener('click', () => {
            cwd = prefix ? `${prefix}${dir}` : dir;
            notify();
          });
          rows.push(row);
        }
        for (const node of files.sort((a, b) => a.label.localeCompare(b.label))) {
          const row = el('button', `fs-row fs-file kind-${node.kind}`);
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
              const row = el('button', 'fs-row fs-file');
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
    id: 'fs-content',
    title: 'CONTEÚDO',
    slot: 'stage',
    render(view) {
      const handler = async ({ source }) => {
        view.empty('lendo…');
        try {
          const payload = await api.node(source);
          const blocks = [el('div', 'fs-title', source)];
          for (const chunk of payload.chunks || []) {
            const block = el('div', 'chunk');
            if (chunk.section) block.append(el('div', 'chunk-section', `§ ${chunk.section}`));
            block.append(el('pre', 'chunk-text', chunk.text));
            blocks.push(block);
          }
          if (blocks.length === 1) blocks.push(el('div', 'widget-empty', 'sem chunks indexados'));
          view.set(blocks);
        } catch (error) {
          view.empty(`falhou: ${error.message}`);
        }
      };
      const offOpen = on('ui.open-file', handler);
      const offSelect = on('ui.select', ({ node }) => node?.source && handler({ source: node.source }));
      view.empty('escolha um arquivo na árvore, ou clique numa estrela');
      return { destroy: () => { offOpen(); offSelect(); } };
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

  listWidget({
    id: 'br-mcp',
    title: 'SERVIDORES MCP',
    hint: 'VIA AGENTE',
    slot: 'right',
    grow: 1,
    render(view) {
      function draw(brain) {
        const servers = brain?.mcp || [];
        if (!servers.length) {
          return view.empty('faça uma pergunta: a lista vem do que o agente reporta ao iniciar');
        }
        view.set([
          el('div', 'unit-sub', `${brain.tools} ferramentas na sessão · cwd ${brain.cwd}`),
          ...servers.map((name) => {
            const row = el('div', 'unit');
            row.append(el('i', 'dot'), el('span', 'unit-name', name));
            row.querySelector('.dot').dataset.status = 'on';
            return row;
          }),
          // Honestidade explícita na própria tela: este servidor não é cliente MCP.
          el('div', 'unit-sub', 'este servidor não fala MCP — quem alcança estes servidores é o agente'),
        ]);
      }
      const store = snapshot();
      if (store.brain) draw(store.brain);
      else view.empty('faça uma pergunta: a lista vem do que o agente reporta ao iniciar');
      return { destroy: on('brain', draw) };
    },
  });
}

