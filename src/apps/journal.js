/**
 * DIÁRIO — o que o agente leu, rodou e chamou, com qual permissão em vigor.
 *
 * A fonte é o JSONL de `.cache/journal/`, não o widget de streams: aquele é volátil e some a
 * cada `query`, então uma execução que rodou `Bash` de madrugada não deixava rastro consultável.
 *
 * Arquivo próprio, e não mais uma seção do `apps/index.js`: são cinco widgets com um estado
 * comum (o dia carregado e a execução selecionada), e esse estado tem de sobreviver à troca de
 * fenda sem virar variável global de outro app.
 */
import { registerApp } from '../kernel/registry.js';
import { listWidget } from './widgets-core.js';
import { el, money, plural, shortPath } from '../hud/dom.js';
import { button } from '../hud/button.js';

const COLOR = 0xc9a0ff;

/*
 * O estado do app vive no módulo porque os cinco widgets o compartilham e nenhum é dono: a
 * tabela escolhe, o detalhe lê, a reprise reencena. Guardá-lo dentro de um deles faria a escolha
 * morrer junto com a fenda que o operador recolhesse.
 */
let index = null;
let day = null;
let runs = [];
let selectedId = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

const selected = () => runs.find((run) => run.id === selectedId) || null;

/** Assina o estado e já desenha uma vez — o par que todo widget daqui repete. */
function follow(draw) {
  listeners.add(draw);
  draw();
  return { destroy: () => listeners.delete(draw) };
}

async function loadIndex(api) {
  index = await api.journal();
  return index;
}

async function loadDay(api, target) {
  const payload = await api.journal(target);
  day = target;
  runs = payload.runs || [];
  index = { ...index, ...payload, runs: undefined };
  notify();
}

export function registerJournal() {
  registerRuns();
  registerDetail();
  registerReplay();
  registerDenials();
  registerSpend();

  registerApp({
    id: 'journal',
    name: 'DIÁRIO',
    tagline: 'execuções, permissões em vigor, custo',
    color: COLOR,
    key: '5',
    widgets: ['context', 'jr-spend', 'jr-denials', 'jr-runs', 'jr-detail', 'jr-replay', 'answer', 'sky-time', 'timeline'],
  });
}

// ---------------------------------------------------------------- TABELA

function registerRuns() {
  listWidget({
    id: 'jr-runs',
    title: 'EXECUÇÕES',
    hint: 'POR DIA',
    slot: 'stage',
    grow: 1,
    surface: true,
    render(view, ctx) {
      // `all` = sem filtro. Filtro por resultado e por ferramenta, que são as duas perguntas que
      // levam alguém a abrir o diário: "o que falhou" e "onde isso rodou".
      let outcome = 'all';
      let tool = 'all';

      function draw() {
        if (!index) return view.empty('carregando…');
        if (!index.days?.length) {
          return view.empty('nenhuma execução registrada ainda — o diário começa na primeira pergunta');
        }

        const blocks = [];

        const dias = el('div', 'config-choices');
        for (const nome of [...index.days].reverse()) {
          const b = button({ variant: 'select', size: 'sm', on: nome === day });
          b.textContent = nome;
          b.addEventListener('click', () => loadDay(ctx.api, nome).catch(() => notify()));
          dias.append(b);
        }
        blocks.push(dias);

        /*
         * A cadeia quebrada é a primeira linha da tela, não um detalhe no rodapé.
         *
         * O encadeamento por hash existe para que uma edição no meio APAREÇA; anunciá-la
         * discretamente seria construir a prova e depois escondê-la.
         */
        if (index.chain) {
          blocks.push(
            el(
              'div',
              'widget-error',
              `⚠ cadeia rompida em ${index.chain.file}:${index.chain.line} (${index.chain.problem})`
            )
          );
        }
        if (index.accepting === false) {
          blocks.push(el('div', 'widget-error', '⚠ teto de disco cruzado — execuções recusadas'));
        }

        if (!day) {
          blocks.push(el('div', 'widget-empty', 'escolha um dia'));
          return view.set(blocks);
        }

        const ferramentas = [...new Set(runs.flatMap((run) => (run.tools || []).map((t) => t.tool)))].sort();
        const filtros = el('div', 'config-choices');
        for (const [valor, rotulo] of [['all', 'TUDO'], ['success', 'OK'], ['error', 'FALHA']]) {
          const b = button({ variant: 'select', size: 'sm', on: outcome === valor });
          b.textContent = rotulo;
          b.addEventListener('click', () => { outcome = valor; draw(); });
          filtros.append(b);
        }
        for (const nome of ferramentas) {
          const b = button({ variant: 'select', size: 'sm', on: tool === nome });
          b.textContent = nome;
          b.addEventListener('click', () => { tool = tool === nome ? 'all' : nome; draw(); });
          filtros.append(b);
        }
        blocks.push(filtros);

        const visiveis = runs.filter((run) => {
          // Linha de vida do servidor (boot/shutdown): não é execução e não tem ferramenta, então
          // some assim que há filtro. Sem filtro ela aparece na ordem do tempo, que é onde a
          // ausência de um `shutdown` entre dois `boot` fica legível.
          if (run.kind) return outcome === 'all' && tool === 'all';
          const okOutcome = outcome === 'all' || (outcome === 'success' ? run.outcome === 'success' : run.outcome !== 'success');
          const okTool = tool === 'all' || (run.tools || []).some((t) => t.tool === tool);
          return okOutcome && okTool;
        });

        if (!visiveis.length) blocks.push(el('div', 'widget-empty', 'nada neste filtro'));

        for (const run of visiveis) {
          if (run.kind) {
            const linha = el('div', 'unit-sub');
            linha.append(el('span', 'row-time', (run.started || '').slice(11, 19)));
            linha.append(el('span', 'delivery-source', run.kind.toUpperCase()));
            linha.append(el('span', 'delivery-summary', run.question || ''));
            blocks.push(linha);
            continue;
          }
          const row = button({
            variant: 'row',
            size: 'row',
            data: { entry: 'run', on: run.id === selectedId ? '1' : '0' },
          });
          row.append(el('span', 'row-time', (run.started || '').slice(11, 19)));
          row.append(el('span', 'delivery-source', run.id));
          row.append(el('span', 'delivery-summary', run.question || '—'));
          row.append(el('span', 'unit-detail', plural((run.tools || []).length, 'ferramenta')));
          row.append(el('span', 'unit-detail', money(run.cost_usd || 0)));
          const marca = el('span', 'delivery-meta', run.outcome);
          if (run.outcome !== 'success') marca.classList.add('widget-error');
          row.append(marca);
          row.addEventListener('click', () => {
            selectedId = run.id;
            // A execução vira ENDEREÇO: `#/journal/r-2026-08-07-001` volta nela depois do F5 e
            // viaja num link, que é o motivo de a sub-rota existir.
            ctx.navigate(ctx.route, run.id);
            notify();
          });
          blocks.push(row);
        }
        view.set(blocks);
      }

      // A montagem resolve o endereço: sem ele, o último dia; com ele, o dia que contém a
      // execução pedida. O id carrega a data, então não é preciso varrer os arquivos.
      const alvo = ctx.arg || '';
      const diaDoAlvo = alvo.slice(2, 12);
      loadIndex(ctx.api)
        .then((payload) => {
          const escolhido = payload.days?.includes(diaDoAlvo)
            ? diaDoAlvo
            : payload.days?.[payload.days.length - 1];
          if (alvo) selectedId = alvo;
          if (escolhido) return loadDay(ctx.api, escolhido);
          notify();
          return null;
        })
        .catch((error) => view.empty(`diário indisponível: ${error.message}`));

      return follow(draw);
    },
  });
}

// ---------------------------------------------------------------- DETALHE

function registerDetail() {
  listWidget({
    id: 'jr-detail',
    title: 'EXECUÇÃO',
    hint: 'INTEIRA',
    slot: 'right',
    grow: 1,
    render(view) {
      function draw() {
        const run = selected();
        if (!run) return view.empty('escolha uma execução');

        const blocks = [el('div', 'fs-title', run.id)];
        const kv = (label, value) => {
          const row = el('div', 'kv');
          row.append(el('span', 'kv-label', label), el('span', 'kv-value', String(value)));
          return row;
        };
        blocks.push(kv('QUANDO', run.started));
        blocks.push(kv('ORIGEM', run.origin));
        blocks.push(kv('RESULTADO', run.outcome));
        blocks.push(kv('CUSTO', money(run.cost_usd || 0)));
        blocks.push(kv('TURNOS', run.turns || '—'));
        const tokens = Object.entries(run.tokens || {});
        if (tokens.length) {
          blocks.push(kv('TOKENS', tokens.map(([k, v]) => `${k} ${v}`).join(' · ')));
        }

        /*
         * As FLAGS são o motivo de esta tela ser auditoria e não histórico: elas dizem o que
         * estava permitido no instante do disparo. "Rodou Bash" sem isso é só um registro.
         */
        blocks.push(el('div', 'controls-group', 'PERMISSÃO EM VIGOR NO DISPARO'));
        blocks.push(el('pre', 'chunk-text', (run.flags || []).join(' ')));

        blocks.push(el('div', 'controls-group', 'FERRAMENTAS'));
        if (!(run.tools || []).length) blocks.push(el('div', 'widget-empty', 'nenhuma'));
        for (const call of run.tools || []) {
          const row = el('div', `unit ${call.ok ? '' : 'down'}`);
          row.append(el('i', 'dot'), el('span', 'unit-name', call.tool));
          row.append(el('span', 'unit-detail', `${call.kind} · ${call.ms ?? '—'} ms`));
          row.querySelector('.dot').dataset.status = call.ok ? 'on' : 'off';
          if (call.detail) row.append(el('div', 'unit-sub', call.detail));
          blocks.push(row);
        }

        if ((run.sources || []).length) {
          blocks.push(el('div', 'controls-group', 'FONTES'));
          for (const source of run.sources) {
            blocks.push(el('div', 'unit-sub', `${source.n ?? '·'} ${shortPath(source.label || '', 44)}`));
          }
        }

        if (run.answer) {
          blocks.push(el('div', 'controls-group', 'RESPOSTA'));
          const bloco = el('div', 'chunk');
          bloco.append(el('pre', 'chunk-text', run.answer));
          blocks.push(bloco);
        }
        view.set(blocks);
      }
      return follow(draw);
    },
  });
}

// ---------------------------------------------------------------- REPRISE

function registerReplay() {
  listWidget({
    id: 'jr-replay',
    title: 'REPRISE',
    hint: 'NO ESPAÇO',
    slot: 'right',
    render(view, ctx) {
      function draw() {
        const run = selected();
        if (!run) return view.empty('escolha uma execução');

        const b = button({ variant: 'select', size: 'sm' });
        b.textContent = 'REENCENAR';
        b.addEventListener('click', () => replay(ctx.bus, run));

        view.set([
          b,
          /*
           * Honestidade sobre o que a reprise É.
           *
           * O diário guarda uma linha por DECISÃO, não o stream de eventos: a reprise reencena a
           * partir do registro (fontes, chamadas, resposta), não reproduz byte a byte o que
           * passou no fio. Prometer o segundo faria o operador ler a cena como gravação.
           */
          el('div', 'unit-sub', 'reencena do registro: fontes, chamadas e resposta'),
          el('div', 'unit-sub', 'os eventos saem marcados REPRISE e não entram na métrica'),
        ]);
      }
      return follow(draw);
    },
  });
}

/**
 * Reemite a execução no barramento; a cena reencena sozinha, sem saber que é reprise.
 *
 * `replay: true` em todo evento é o que impede o `recorder` de recontar — sem ele, reencenar uma
 * execução de ontem faria o custo de hoje subir sem ninguém ter gasto nada.
 */
function replay(bus, run) {
  const mark = (event) => bus.emit({ ...event, replay: true });

  mark({ t: 'state', state: 'retrieving', label: 'REPRISE' });
  mark({ t: 'query', text: run.question, replayOf: run.id });
  if ((run.sources || []).length) mark({ t: 'sources', sources: run.sources });

  for (const call of run.tools || []) {
    const id = `${run.id}:${call.tool}:${run.tools.indexOf(call)}`;
    mark({ t: 'tool', phase: 'call', id, tool: call.tool, kind: call.kind, detail: call.detail });
    mark({ t: 'tool', phase: 'result', id, tool: call.tool, kind: call.kind, ok: call.ok });
  }

  mark({
    t: 'answer',
    text: run.answer,
    sources: run.sources || [],
    cost_usd: run.cost_usd,
    tokens: run.tokens,
    turns: run.turns,
  });
  mark({ t: 'state', state: 'idle', label: 'OCIOSO' });
}

// ---------------------------------------------------------------- NEGAÇÕES

function registerDenials() {
  listWidget({
    id: 'jr-denials',
    title: 'NEGADO',
    hint: 'O QUE NÃO PASSOU',
    slot: 'left',
    grow: 1,
    render(view) {
      function draw() {
        const negados = runs.flatMap((run) =>
          (run.tools || []).filter((call) => !call.ok).map((call) => ({ run, call }))
        );
        const blocks = [];
        if (!negados.length) {
          blocks.push(el('div', 'widget-empty', day ? 'nada negado neste dia' : 'escolha um dia'));
        }
        for (const { run, call } of negados) {
          const row = button({ variant: 'row', size: 'row', data: { entry: 'run' } });
          row.append(el('span', 'row-time', (run.started || '').slice(11, 19)));
          row.append(el('span', 'delivery-source', call.tool));
          row.append(el('span', 'delivery-summary', call.detail || run.question || '—'));
          row.addEventListener('click', () => { selectedId = run.id; notify(); });
          blocks.push(row);
        }
        /*
         * ⚠️ Só o que o DIÁRIO viu. Recusa de cross-site (403), arquivo fora da raiz e web sem
         * opt-in acontecem fora de uma execução e ainda não viram registro — dizer isso na tela
         * é o que separa "não houve negação" de "não sei".
         */
        blocks.push(el('div', 'unit-sub', 'só ferramentas: 403 cross-site e arquivo fora da raiz ainda não são registrados'));
        view.set(blocks);
      }
      return follow(draw);
    },
  });
}

// ---------------------------------------------------------------- GASTO

function registerSpend() {
  listWidget({
    id: 'jr-spend',
    title: 'GASTO POR DIA',
    hint: 'SOBREVIVE AO RESTART',
    slot: 'left',
    render(view) {
      function draw() {
        const dias = index?.spend || [];
        if (!dias.length) return view.empty('sem gasto registrado');
        const total = dias.reduce((soma, entry) => soma + (entry.cost_usd || 0), 0);
        const blocks = dias
          .slice()
          .reverse()
          .map((entry) => {
            const row = el('div', 'kv');
            row.append(el('span', 'kv-label', entry.day));
            const valor = `${money(entry.cost_usd)} · ${plural(entry.runs, 'execução', 'execuções')}`;
            row.append(el('span', 'kv-value', entry.errors ? `${valor} · ${entry.errors} com falha` : valor));
            return row;
          });
        blocks.push(el('div', 'widget-hint', `total registrado ${money(total)}`));
        view.set(blocks);
      }
      return follow(draw);
    },
  });
}
