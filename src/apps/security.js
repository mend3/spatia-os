/**
 * PERMISSÕES — o que este agente pode fazer agora, quem decidiu, e a prova de que virou flag.
 *
 * Promovido de painel a DESTINO. O critério da §0 do OS-SCREENS decide: painel é para mudança
 * que se vê no mesmo instante, na mesma tela. Nenhum toggle de permissão tem efeito na execução
 * em curso — ele vira flag de `claude -p` na PRÓXIMA invocação. Não há nada acontecendo para
 * olhar, e portanto nenhum custo em ser tela.
 *
 * ⚠️ Os toggles continuam morando em `hud/permissions.js`, e esta tela NÃO os reconstrói. Dois
 * lugares desenhando o mesmo switch e escrevendo no mesmo store divergem na primeira alteração —
 * é a razão que a página de configuração já escreveu. Aqui eles se abrem pelo mesmo gatilho.
 *
 * O que a promoção acrescenta são as duas perguntas que não cabiam num painel sobreposto:
 * ALCANCE e EXPOSIÇÃO.
 */
import { registerApp } from '../kernel/registry.js';
import { listWidget } from './widgets-core.js';
import { el, plural } from '../hud/dom.js';
import { button } from '../hud/button.js';
import { snapshot } from '../core/state.js';
import * as prom from '../core/promtext.js';

const COLOR = 0xff6b6b;

let describe = null;
let health = null;
let metrics = null;
let erro = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

async function load(api) {
  try {
    const [config, saude, texto] = await Promise.all([
      fetch('/api/config').then((r) => r.json()),
      api.health(),
      fetch('/metrics').then((r) => r.text()),
    ]);
    describe = config;
    health = saude;
    metrics = prom.parse(texto);
    erro = null;
  } catch (error) {
    erro = error.message;
  }
  notify();
}

function follow(draw, ctx) {
  listeners.add(draw);
  draw();
  if (ctx) load(ctx.api);
  return { destroy: () => listeners.delete(draw) };
}

const kv = (label, value) => {
  const row = el('div', 'kv');
  row.append(el('span', 'kv-label', label), el('span', 'kv-value', String(value)));
  return row;
};

/** Abre o painel real pelo MESMO gatilho da systray — uma verdade, um código. */
const abrirPainel = () => document.querySelector('[data-perms-toggle]')?.click();

export function registerSecurity() {
  registerMode();
  registerTools();
  registerCatalog();
  registerReach();
  registerExposure();
  registerEffective();

  registerApp({
    id: 'security',
    name: 'PERMISSÕES',
    tagline: 'o que o agente alcança, e a prova disso',
    color: COLOR,
    key: '7',
    widgets: [
      'context', 'sec-mode', 'sec-tools', 'sec-catalog',
      'sec-reach', 'sec-exposure', 'sec-effective', 'answer', 'sky-time',
    ],
  });
}

// ---------------------------------------------------------------- MODO

function registerMode() {
  listWidget({
    id: 'sec-mode',
    title: 'MODO',
    slot: 'left',
    render(view, ctx) {
      function draw() {
        if (erro) return view.empty(`indisponível: ${erro}`);
        if (!describe) return view.empty('carregando…');
        const state = describe.state || {};
        const modo = (describe.modes || []).find((m) => m.id === state.mode);

        const blocks = [
          kv('MODO', state.mode || '—'),
          kv('FONTES DE SETTINGS', (state.setting_sources || []).join(', ') || 'nenhuma'),
        ];
        if (modo?.note) blocks.push(el('div', 'unit-sub', modo.note));

        // O acoplamento que o painel já documenta: fonte de settings desligada leva junto
        // hooks E skills do repositório. É a nota que não cabia no popover.
        blocks.push(
          el('div', 'widget-hint', 'fonte desligada leva junto os hooks e as skills daquele escopo')
        );

        const ajustar = button({ variant: 'select', size: 'sm' });
        ajustar.textContent = 'AJUSTAR';
        ajustar.addEventListener('click', abrirPainel);
        blocks.push(ajustar);
        view.set(blocks);
      }
      return follow(draw, ctx);
    },
  });
}

// ---------------------------------------------------------------- FERRAMENTAS

function registerTools() {
  listWidget({
    id: 'sec-tools',
    title: 'FERRAMENTAS',
    hint: 'O QUE OS TOGGLES NEGAM',
    slot: 'left',
    grow: 1,
    render(view, ctx) {
      function draw() {
        if (!describe) return view.empty(erro ? `indisponível: ${erro}` : 'carregando…');
        const off = new Set(describe.state?.tools_off || []);
        const blocks = (describe.tools || []).map((tool) => {
          const ligada = !off.has(tool.id);
          const row = el('div', `unit ${ligada ? '' : 'down'}`);
          row.append(el('i', 'dot'), el('span', 'unit-name', tool.label || tool.id));
          row.append(el('span', 'unit-detail', ligada ? tool.kind : 'negada'));
          row.querySelector('.dot').dataset.status = ligada ? 'on' : 'off';
          return row;
        });
        if (!blocks.length) blocks.push(el('div', 'widget-empty', 'catálogo vazio'));
        view.set(blocks);
      }
      return follow(draw, ctx);
    },
  });
}

// ---------------------------------------------------------------- CATÁLOGO

function registerCatalog() {
  listWidget({
    id: 'sec-catalog',
    title: 'SKILLS E AGENTES DESCOBERTOS',
    hint: 'COM A ORIGEM',
    slot: 'stage',
    grow: 1,
    surface: true,
    render(view, ctx) {
      function draw() {
        if (!describe) return view.empty(erro ? `indisponível: ${erro}` : 'carregando…');
        const catalog = describe.catalog || {};
        const blocks = [];

        /*
         * A ORIGEM é o dado, não enfeite.
         *
         * As skills e os agentes não são do sistema: são descobertos em `AGENT_CWD/.claude`.
         * Trocar `AGENT_CWD` troca o catálogo INTEIRO sem tocar em nenhum toggle — e sem o
         * caminho na tela o operador leria a lista como propriedade do produto.
         */
        blocks.push(kv('DESCOBERTOS EM', catalog.root || '—'));

        const secao = (titulo, itens, desligados) => {
          const off = new Set(desligados || []);
          blocks.push(el('div', 'controls-group', `${titulo} · ${itens.length}`));
          if (!itens.length) {
            blocks.push(el('div', 'unit-sub', 'nenhum neste caminho'));
            return;
          }
          for (const item of itens) {
            const ligado = !off.has(item.id);
            const row = el('div', `unit ${ligado ? '' : 'down'}`);
            row.append(el('i', 'dot'), el('span', 'unit-name', item.label || item.id));
            row.querySelector('.dot').dataset.status = ligado ? 'on' : 'off';
            if (item.description) row.append(el('div', 'unit-sub', item.description));
            blocks.push(row);
          }
        };
        secao('SKILLS', catalog.skills || [], describe.state?.skills_off);
        secao('AGENTES', catalog.agents || [], describe.state?.agents_off);
        view.set(blocks);
      }
      return follow(draw, ctx);
    },
  });
}

// ---------------------------------------------------------------- ALCANCE

function registerReach() {
  listWidget({
    id: 'sec-reach',
    title: 'ALCANCE',
    hint: 'O QUE NENHUM TOGGLE DIZ',
    slot: 'right',
    grow: 1,
    render(view, ctx) {
      function draw() {
        if (!health) return view.empty(erro ? `indisponível: ${erro}` : 'carregando…');
        const brain = snapshot().brain;
        const blocks = [];

        /*
         * A lista de permissões cobre FERRAMENTAS; o dano vive no ALCANCE.
         *
         * `Read` com a raiz no próprio projeto e `Read` com a raiz no workspace inteiro são a
         * mesma marca de seleção ligada e duas autoridades incomparáveis. Nenhum dos toggles
         * diz qual das duas está em vigor.
         */
        blocks.push(kv('RAIZ DO AGENTE', health.agent_cwd || '—'));
        const roots = health.exposure?.file_roots || [];
        blocks.push(kv('RAÍZES DE ARQUIVO', roots.length ? plural(roots.length, 'raiz', 'raízes') : 'só o projeto'));
        for (const root of roots) blocks.push(el('div', 'unit-sub', root));

        /*
         * A LEITURA ERRADA QUE O PAINEL INDUZ, corrigida com dois números lado a lado.
         *
         * Com `AGENT_ALLOWED_TOOLS` vazio não sai `--allowedTools` nenhum e o conjunto real é
         * TUDO o que o CLI tem; os toggles só sabem NEGAR. O painel mostra N ferramentas ligadas
         * e o operador conclui que o universo tem N. A diferença entre os dois números é
         * exatamente o que nenhum toggle controla.
         */
        blocks.push(el('div', 'controls-group', 'FERRAMENTAS: LISTADAS vs REAIS'));
        const listadas = (describe?.tools || []).length;
        if (brain?.tools) {
          blocks.push(kv('NA SESSÃO', brain.tools));
          blocks.push(kv('NA LISTA DE TOGGLES', listadas));
          if (brain.tools > listadas) {
            blocks.push(
              el(
                'div',
                'widget-error',
                `${brain.tools - listadas} ferramentas que nenhum toggle desta tela controla`
              )
            );
          }
        } else {
          blocks.push(kv('NA LISTA DE TOGGLES', listadas));
          blocks.push(el('div', 'unit-sub', 'o total real vem do agente: faça uma pergunta'));
        }

        blocks.push(el('div', 'controls-group', 'SERVIDORES MCP NA SESSÃO'));
        if (!brain?.mcp?.length) {
          blocks.push(el('div', 'unit-sub', 'nenhum reportado ainda'));
        } else {
          for (const name of brain.mcp) blocks.push(el('div', 'unit-sub', name));
          // MCP entra por outra porta e escapa inteiro da lista de ferramentas.
          blocks.push(
            el('div', 'widget-hint', 'ferramenta de MCP não é coberta por nenhum toggle desta tela')
          );
        }

        const online = (health.providers || []).filter((p) => p.online);
        blocks.push(el('div', 'controls-group', 'REDE ALCANÇÁVEL'));
        blocks.push(
          online.length
            ? kv('PROVEDORES PRONTOS', online.map((p) => p.label).join(', '))
            : el('div', 'unit-sub', 'nenhum provedor de busca configurado')
        );
        view.set(blocks);
      }
      return follow(draw, ctx);
    },
  });
}

// ---------------------------------------------------------------- EXPOSIÇÃO

function registerExposure() {
  listWidget({
    id: 'sec-exposure',
    title: 'EXPOSIÇÃO',
    slot: 'right',
    render(view, ctx) {
      function draw() {
        if (!health) return view.empty(erro ? `indisponível: ${erro}` : 'carregando…');
        const e = health.exposure || {};
        const blocks = [];

        /*
         * EM LETRA GRANDE, e primeiro: é o único momento em que a postura de segurança deste
         * sistema muda de categoria.
         *
         * `127.0.0.1` não recebe webhook da internet — ou o remetente é local, ou existe um
         * túnel. E havendo túnel, o bind em loopback deixou de ser a proteção que era: o
         * servidor não tem autenticação nenhuma e passou a ter endereço público. As outras
         * linhas desta tela continuam verdadeiras e deixam de bastar.
         */
        if (e.tunnel?.suspected) {
          blocks.push(
            el(
              'div',
              'widget-error',
              `⚠ ESTE PEDIDO ATRAVESSOU UM PROXY OU TÚNEL (Host ${e.tunnel.host}` +
                `${e.tunnel.forwarded_for ? ` · X-Forwarded-For ${e.tunnel.forwarded_for}` : ''}) — ` +
                'o bind em loopback não é mais a proteção, e não há autenticação'
            )
          );
        }

        blocks.push(kv('BIND', e.bind || '—'), kv('AUTENTICAÇÃO', e.auth || '—'));

        /*
         * A barreira contada, não afirmada.
         *
         * Uma defesa que nunca se vê agir é uma defesa em que se acredita, não uma que se
         * verifica — o mesmo argumento que faz `jr.denials` existir. O número vem do
         * `/metrics`, com o parser do `#/metrics`: publicá-lo também no `/api/health` daria
         * duas verdades sobre o mesmo fato.
         */
        const recusas = metrics ? prom.sum(metrics, 'espatial_crosssite_refused_total') : null;
        blocks.push(
          kv('BARREIRA Sec-Fetch-Site', e.same_site_guard ? 'ativa' : 'DESLIGADA'),
          kv('RECUSAS CROSS-SITE', recusas === null ? '—' : Math.round(recusas))
        );

        blocks.push(
          el(
            'div',
            'widget-hint',
            'sem usuários, papéis ou grupos: um operador, uma máquina, loopback sem autenticação'
          )
        );
        view.set(blocks);
      }
      return follow(draw, ctx);
    },
  });
}

// ---------------------------------------------------------------- ARGV

function registerEffective() {
  listWidget({
    id: 'sec-effective',
    title: 'O COMANDO QUE SAI DISSO',
    slot: 'strip',
    render(view, ctx) {
      function draw() {
        if (!describe) return view.empty(erro ? `indisponível: ${erro}` : 'carregando…');
        // A PROVA. Todo toggle desta tela existe para virar um destes argumentos; sem o argv
        // visível, a tela seria uma declaração de intenção.
        view.set([el('pre', 'chunk-text', `claude -p ${(describe.flags || []).join(' ')}`)]);
      }
      return follow(draw, ctx);
    },
  });
}
