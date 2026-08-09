/**
 * ATIVIDADE — o que está executando NESTE instante, e como eu interrompo.
 *
 * O buraco que ela fecha: a UI só conhece o stream da própria aba. Duas abas abertas são dois
 * subprocessos `claude` queimando a mesma janela de uso, e nada dizia isso. `Esc` aborta o stream
 * local; o subprocesso da outra aba continua até o fim, cobrando.
 *
 * ⚠️ **Só o que está VIVO.** O que terminou vai para `#/journal`. Vivo e morto na mesma lista é o
 * que transforma uma tela acionável numa tela de leitura.
 */
import { declararApp } from './residentes.js';
import { listWidget } from './widgets-core.js';
import { el, money, plural } from '../hud/dom.js';
import { button } from '../hud/button.js';
import { snapshot } from '../core/state.js';

const COLOR = 0x6bff9e;

let payload = null;
let erro = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

/*
 * Uma coleta por SEGUNDO para os três widgets.
 *
 * Esta é a única tela em que o intervalo curto se justifica: ela responde "agora", e um número de
 * cinco segundos atrás sobre uma execução que dura oito seria uma tela que se contradiz. O timer
 * morre com o último widget desmontado — pesquisar o servidor de uma rota que ninguém está vendo
 * é custo sem leitor.
 */
let timer = null;
let vivos = 0;

async function collect() {
  try {
    payload = await fetch('/api/running').then((r) => r.json());
    erro = null;
  } catch (error) {
    erro = error.message;
  }
  notify();
}

function attach(draw) {
  vivos += 1;
  if (!timer) {
    collect();
    timer = setInterval(collect, 1000);
  }
  listeners.add(draw);
  draw();
  return {
    destroy: () => {
      listeners.delete(draw);
      vivos -= 1;
      if (vivos <= 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

const kv = (label, value) => {
  const row = el('div', 'kv');
  row.append(el('span', 'kv-label', label), el('span', 'kv-value', String(value)));
  return row;
};

export function registerActivity() {
  registerQueue();
  registerRunning();
  registerThrottle();
  registerProcesses();

  declararApp({
    id: 'activity',
    name: 'ATIVIDADE',
    tagline: 'o que roda agora, e como parar',
    color: COLOR,
    key: '8',
    widgets: ['context', 'act-queue', 'act-running', 'act-throttle', 'act-processes', 'answer', 'sky-time', 'timeline'],
  });
}

// ---------------------------------------------------------------- FILA

function registerQueue() {
  listWidget({
    id: 'act-queue',
    title: 'FILA DE ENTRADA',
    hint: 'EM DISCO',
    slot: 'left',
    grow: 1,
    render(view, ctx) {
      let fila = null;
      let falha = null;

      async function carregar() {
        try {
          fila = await ctx.api.integrations();
          falha = null;
        } catch (error) {
          falha = error.message;
        }
        draw();
      }

      function draw() {
        if (falha) return view.empty(`indisponível: ${falha}`);
        if (!fila) return view.empty('lendo…');
        const status = fila.queue || {};
        const blocks = [
          kv('RETIDAS', status.pending ?? 0),
          kv('JÁ DRENADAS', status.drained ?? 0),
        ];
        /*
         * A fila é o que separa "recebido" de uma promessa vazia.
         *
         * Em memória ela evaporava no restart: o remetente lia 202, o servidor reiniciava, e a
         * entrega deixava de existir sem que nenhum dos dois lados soubesse. Só entra aqui o
         * que a política do endpoint mandou reter (`enqueue`) — `draw` desenha e não guarda.
         */
        for (const item of (fila.pending || []).slice(-12).reverse()) {
          const linha = el('div', 'delivery');
          linha.append(el('span', 'row-time', new Date(item.at * 1000).toTimeString().slice(0, 8)));
          linha.append(el('span', 'delivery-source', item.source));
          linha.append(el('span', 'delivery-summary', item.summary || '—'));
          linha.append(el('span', 'delivery-meta', plural((item.events || []).length, 'evento')));
          blocks.push(linha);
        }
        if (!(fila.pending || []).length) {
          blocks.push(el('div', 'widget-empty', 'nada retido — só a política `enqueue` guarda'));
        }
        view.set(blocks);
      }

      carregar();
      const timer = setInterval(carregar, 5000);
      return { destroy: () => clearInterval(timer) };
    },
  });
}

// ---------------------------------------------------------------- VIVAS

function registerRunning() {
  listWidget({
    id: 'act-running',
    title: 'EXECUÇÕES VIVAS',
    hint: 'TODAS AS ABAS',
    slot: 'stage',
    grow: 1,
    surface: true,
    render(view) {
      function draw() {
        if (erro) return view.empty(`servidor não respondeu: ${erro}`);
        if (!payload) return view.empty('lendo…');
        const vivas = payload.running || [];
        if (!vivas.length) {
          return view.empty('nada executando — o que terminou está em #/journal');
        }

        const blocks = vivas.map((run) => {
          const linha = el('div', 'delivery');
          linha.append(el('span', 'row-time', `${(run.ms / 1000).toFixed(1)}s`));
          linha.append(el('span', 'delivery-source', run.id));
          linha.append(el('span', 'delivery-summary', run.question || '—'));
          linha.append(
            el(
              'span',
              'delivery-meta',
              [
                run.origin,
                run.stage || 'iniciando',
                plural(run.tools, 'ferramenta'),
                run.turns ? plural(run.turns, 'turno') : null,
                run.cost_usd ? money(run.cost_usd) : null,
              ]
                .filter(Boolean)
                .join(' · ')
            )
          );

          const encerrar = button({ variant: 'select', size: 'sm' });
          encerrar.textContent = run.cancelled ? 'ENCERRANDO…' : 'ENCERRAR';
          encerrar.disabled = run.cancelled;
          encerrar.addEventListener('click', async () => {
            encerrar.disabled = true;
            encerrar.textContent = 'ENCERRANDO…';
            /*
             * O pedido é COOPERATIVO, e a tela diz isso pelo rótulo.
             *
             * O servidor marca a execução; ela para no próximo evento, e é esse caminho que
             * fecha a métrica, o estágio e a linha do diário. Um botão que prometesse morte
             * instantânea mentiria pelo tempo em que o agente ainda está dentro de uma
             * ferramenta — e a execução tem de TERMINAR, não sumir.
             */
            try {
              await fetch('/api/kill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: run.id }),
              });
            } finally {
              collect();
            }
          });
          linha.append(encerrar);
          return linha;
        });
        view.set(blocks);
      }
      return attach(draw);
    },
  });
}

// ---------------------------------------------------------------- LIMITES

function registerThrottle() {
  listWidget({
    id: 'act-throttle',
    title: 'LIMITES',
    slot: 'right',
    render(view) {
      function draw() {
        if (!payload) return view.empty(erro ? `indisponível: ${erro}` : 'lendo…');
        const b = payload.budget || {};
        const rows = [
          kv('SIMULTÂNEAS', b.max_concurrent ? `${b.running} de ${b.max_concurrent}` : `${b.running} · sem limite`),
          kv('GASTO HOJE', money(b.spent_today || 0)),
          kv(
            'TETO DIÁRIO',
            b.max_daily_usd ? `${money(b.max_daily_usd)} · resta ${money(b.remaining_usd)}` : 'sem teto'
          ),
        ];

        // A janela de uso vem do evento `limit`, que é do agente e não do servidor: ela só existe
        // depois de uma pergunta, e dizer isso evita ler o vazio como "sem limite".
        const limit = snapshot().limit;
        if (limit?.resets_at) {
          const falta = Math.max(0, limit.resets_at * 1000 - Date.now());
          rows.push(
            kv(
              `JANELA ${String(limit.window || '').toUpperCase()}`,
              `${limit.status || '—'} · reseta em ${Math.floor(falta / 3_600_000)}h${String(
                Math.floor((falta % 3_600_000) / 60_000)
              ).padStart(2, '0')}`
            )
          );
        } else {
          rows.push(el('div', 'unit-sub', 'janela de uso: o agente ainda não reportou'));
        }
        view.set(rows);
      }
      return attach(draw);
    },
  });
}

// ---------------------------------------------------------------- PROCESSOS

function registerProcesses() {
  listWidget({
    id: 'act-processes',
    title: 'PROCESSOS',
    hint: 'O QUE ESTE SERVIDOR GEROU',
    slot: 'right',
    grow: 1,
    render(view) {
      function draw() {
        if (!payload) return view.empty(erro ? `indisponível: ${erro}` : 'lendo…');
        const comPid = (payload.running || []).filter((run) => run.pid);
        const blocks = comPid.map((run) => {
          const linha = el('div', 'unit');
          linha.append(el('i', 'dot'), el('span', 'unit-name', `claude · pid ${run.pid}`));
          linha.append(el('span', 'unit-detail', run.id));
          linha.querySelector('.dot').dataset.status = run.cancelled ? 'busy' : 'on';
          return linha;
        });
        if (!blocks.length) blocks.push(el('div', 'widget-empty', 'nenhum subprocesso em voo'));

        /*
         * O PID vem de quem CRIOU o processo, não de um `ps`.
         *
         * `brain.py` emite o pid junto com o Popen; descobri-lo por varredura acharia também os
         * `claude` que este servidor não gerou — e o botão ENCERRAR desta tela não fala por eles.
         */
        blocks.push(
          el('div', 'widget-hint', 'só os subprocessos que este servidor criou'),
          el('div', 'unit-sub', 'RSS e CPU por PID exigiriam psutil, que não é dependência daqui')
        );
        view.set(blocks);
      }
      return attach(draw);
    },
  });
}
