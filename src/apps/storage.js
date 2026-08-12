/**
 * ARMAZENAMENTO — o corpus é confiável, e o que este sistema escreveu em disco.
 *
 * Não é `#/files`. Lá se pergunta *o que o núcleo sabe sobre X*; aqui, *dá para confiar no que
 * ele sabe*. Por isso não há leitor, editor nem busca nesta tela.
 *
 * ⚠️ **O SpatIA NÃO INDEXA.** Ele lê uma coleção que outro pipeline escreveu, então não existe
 * botão REINDEXAR. Reconstruir a TOPOLOGIA, sim, é deste sistema — e esse botão é real.
 */
import { declararApp } from './residentes.js';
import { listWidget } from './widgets-core.js';
import { el, plural } from '../hud/dom.js';
import { button } from '../hud/button.js';
import { KIND_COLORS as SKY_COLORS } from '../space/graph.js';
import { explicarVazio } from '../core/estado-do-indice.js';

const COLOR = 0xffd166;

let storage = null;
let graph = null;
let erro = null;
/** O que dizer quando falta topologia — resolvido por `estado-do-indice`, nunca colado à mão. */
let vazioDoCeu = 'lendo…';
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

/*
 * ☠️ **`Promise.all` fazia UMA falha apagar TRÊS painéis.** `/api/storage` e `/api/graph` são
 * independentes — o primeiro responde 200 com a política de admissão, os excludes e a raiz mesmo
 * sem índice nenhum. Com `all`, a rejeição do segundo descartava o primeiro junto, e a tela de
 * armazenamento ficava inteira em branco anunciando um erro de Qdrant. `allSettled` mantém cada
 * painel vivo pelo que ELE depende.
 */
async function load(api) {
  const [s, g] = await Promise.allSettled([api.storage(), api.graph()]);
  storage = s.status === 'fulfilled' ? s.value : null;
  graph = g.status === 'fulfilled' ? g.value : null;
  erro = s.status === 'rejected' ? s.reason?.message : null;
  const erroDoCeu = g.status === 'rejected' ? g.reason?.message : null;
  vazioDoCeu = await explicarVazio(erroDoCeu);
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

/** Bytes em unidade legível. Zero é `—`: um arquivo de 0 bytes e um ausente não são a mesma coisa. */
function bytes(total) {
  if (!total) return '—';
  const unidades = ['B', 'KiB', 'MiB', 'GiB'];
  let valor = total;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  return `${valor.toFixed(i ? 1 : 0)} ${unidades[i]}`;
}

function idade(segundos) {
  if (segundos === null || segundos === undefined) return '—';
  if (segundos < 90) return `${segundos}s`;
  if (segundos < 5400) return `${Math.round(segundos / 60)} min`;
  if (segundos < 172800) return `${(segundos / 3600).toFixed(1)} h`;
  return `${(segundos / 86400).toFixed(1)} dias`;
}

export function registerStorage() {
  registerSetup();
  registerCollection();
  registerCoverage();
  registerCaches();

  declararApp({
    id: 'storage',
    name: 'ARMAZENAMENTO',
    tagline: 'o corpus é confiável?',
    color: COLOR,
    key: '9',
    widgets: ['context', 'st-setup', 'st-collection', 'st-coverage', 'st-caches', 'answer', 'sky-time', 'timeline'],
  });
}

// ---------------------------------------------------------------- SETUP DO CORPUS

/*
 * A ESCOLHA DA RAIZ, e o seletor é do SERVIDOR.
 *
 * ☠️ Nenhuma API de navegador serve: `showDirectoryPicker()` esconde o caminho absoluto do JS por
 * projeto, então não há o que entregar a quem vai indexar; e a permissão "apps no dispositivo"
 * (Local Network Access) governa origem PÚBLICA alcançando loopback — esta tela já é servida de
 * `127.0.0.1`, e mesmo assim ela governaria rede, não arquivo. `/api/setup/dirs` lista.
 *
 * ⚠️ A ORIGEM de cada chave aparece ao lado do valor. Três camadas decidindo a mesma chave sem a
 * ordem legível é como esta base já perdeu um dia, com o `.env` dizendo uma coisa e a tela outra.
 */
let ambiente = null;
let navegando = null;
let previa = null;
let ocupado = false;

let relogioDoTrabalho = null;

function pararRelogio() {
  if (relogioDoTrabalho) {
    clearInterval(relogioDoTrabalho);
    relogioDoTrabalho = null;
  }
}

async function lerAmbiente() {
  try {
    ambiente = await fetch('/api/setup').then((r) => r.json());
  } catch (e) {
    // ⚠️ O relógio é liberado no ERRO também: sem isto um `fetch` que falha deixa um
    // `setInterval` batendo para sempre contra um servidor que não responde.
    pararRelogio();
    erro = e.message;
    notify();
    return;
  }
  notify();
  /*
   * ⚠️ Enquanto indexa, a tela RELÊ sozinha. Progresso que só aparece se o operador recarregar a
   * página é a mesma tela travada com outra roupa.
   */
  if (ambiente?.trabalho?.estado === 'correndo') {
    if (!relogioDoTrabalho) relogioDoTrabalho = setInterval(lerAmbiente, 1200);
  } else {
    pararRelogio();
  }
}

async function indexarAgora() {
  // ⚠️ A recusa do servidor (400) é MOSTRADA. Descartar a resposta faria o botão parecer que
  // funcionou enquanto nada acontece.
  const r = await fetch('/api/setup/indexar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    erro = corpo.error || `indexação recusada (${r.status})`;
    notify();
    return;
  }
  lerAmbiente();
}

async function navegar(caminho) {
  navegando = await fetch(`/api/setup/dirs?path=${encodeURIComponent(caminho ?? '')}`).then((r) => r.json());
  previa = null;
  notify();
}

async function prever(caminho) {
  previa = { caminho, carregando: true };
  notify();
  const r = await fetch(`/api/setup/prever?path=${encodeURIComponent(caminho)}`).then((x) => x.json());
  previa = { caminho, ...r };
  notify();
}

const ORIGEM_ROTULO = { ui: 'TELA', env: '.env', default: 'PADRÃO' };

function registerSetup() {
  listWidget({
    id: 'st-setup',
    title: 'CORPUS',
    hint: 'a pasta que este céu serve',
    slot: 'left',
    render(view) {
      function draw() {
        if (!ambiente) return view.empty('lendo…');
        const blocks = [];
        const raiz = ambiente.raiz;

        /*
         * ⭑ **O ESTADO VAZIO ENSINA O PRÓXIMO PASSO.** Quem chega não pergunta "o corpus é
         * confiável?" — pergunta o que fazer agora, e a resposta é UMA.
         */
        if (!raiz) {
          blocks.push(el('div', 'widget-hint', 'PASSO 1 · escolha a pasta que o SpatIA vai conhecer'));
        } else {
          blocks.push(kv('RAIZ', raiz));
          const col = ambiente.chaves?.QDRANT_COLLECTION;
          if (col?.valor) blocks.push(kv('COLEÇÃO', col.valor));
        }

        const t = ambiente.trabalho || {};
        if (t.estado === 'correndo') {
          const pct = t.total ? Math.round((t.feitos / t.total) * 100) : 0;
          blocks.push(kv('INDEXANDO', `${t.feitos}/${t.total} · ${pct}%`));
          blocks.push(el('div', 'widget-hint', t.detalhe || ''));
        } else if (t.estado === 'falhou') {
          blocks.push(el('div', 'widget-error', `indexação falhou: ${t.erro}`));
        } else if (t.resumo) {
          blocks.push(kv('INDEXADO', `${t.resumo.arquivos} arquivos · ${t.resumo.pontos} pontos`));
        }
        if (raiz && t.estado !== 'correndo') {
          blocks.push(
            button({
              label: t.resumo ? 'REINDEXAR' : 'INDEXAR AGORA',
              variant: 'select',
              onClick: indexarAgora,
            })
          );
        }
        blocks.push(kv('ADMITE', `${ambiente.admite.length} tipos · teto ${ambiente.teto_kb} KB`));
        blocks.push(
          el('div', 'widget-hint', `código-fonte fora (fase 2) · ${ambiente.nunca.length} padrões de segredo nunca entram`)
        );

        // A precedência, VISÍVEL: quem decidiu cada chave.
        for (const [chave, info] of Object.entries(ambiente.chaves)) {
          if (info.origem === 'default' && !info.valor) continue;
          const linha = kv(chave, info.valor || '(vazio)');
          linha.append(el('span', 'widget-hint', ORIGEM_ROTULO[info.origem] ?? info.origem));
          blocks.push(linha);
        }

        blocks.push(
          button({
            label: navegando ? 'FECHAR SELETOR' : 'ESCOLHER PASTA',
            onClick: () => (navegando ? ((navegando = null), (previa = null), notify()) : navegar(raiz || '')),
          })
        );

        /*
         * ☠️ **A AÇÃO VEM ANTES DA LISTA, e a ordem inversa tornava o seletor inutilizável.**
         * `PRÉ-VER ESTA PASTA` é o único caminho até `USAR ESTA PASTA`, e ele era empurrado para
         * depois de até 40 botões de pasta. Medido no DOM: a fenda tem 503 px para 1176 px de
         * conteúdo — o operador navegava, a lista empurrava a ação para fora da caixa, e ele
         * concluía que dá para navegar mas não dá para escolher. A lista é para DESCER; a decisão
         * é sobre onde já se está, e ela não pode depender de rolar o que a soterra.
         *
         * ⚠️ A prévia continua OBRIGATÓRIA antes de escolher — apontar uma pasta e descobrir o
         * tamanho depois custa uma indexação inteira. O que mudou é a ordem na tela, nunca o passo.
         */
        if (navegando) {
          blocks.push(kv('EM', navegando.caminho));
          if (navegando.erro) blocks.push(el('div', 'widget-error', navegando.erro));
          blocks.push(
            button({ label: 'PRÉ-VER ESTA PASTA', variant: 'select', onClick: () => prever(navegando.caminho) })
          );
        }

        if (previa) {
          if (previa.carregando) blocks.push(el('div', 'widget-hint', 'contando…'));
          else if (previa.error) blocks.push(el('div', 'widget-error', previa.error));
          else {
            blocks.push(kv('RENDERIA', `${previa.admitidos} arquivos · ${previa.mb} MB`));
            blocks.push(kv('DESCARTA', `${previa.descartados}`));
            blocks.push(
              el('div', 'widget-hint', Object.entries(previa.por_tipo).map(([e, n]) => `${e} ${n}`).join(' · '))
            );
            blocks.push(
              button({
                label: ocupado ? 'APLICANDO…' : 'USAR ESTA PASTA',
                variant: 'select',
                onClick: async () => {
                  if (ocupado) return;
                  ocupado = true;
                  notify();
                  await fetch('/api/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ CORPUS_ROOT: previa.raiz }),
                  });
                  ocupado = false;
                  navegando = null;
                  previa = null;
                  await lerAmbiente();
                },
              })
            );
            /*
             * ⚠️ Escolher a raiz NÃO indexa, e dizer isso é o ponto: a indexação é longa e o
             * operador precisa saber que o céu só muda depois dela. `make indexar` constrói a
             * coleção nova e troca o apelido no fim — até lá, o céu velho continua servindo.
             */
            /*
             * ⚠️ A tela nomeia a AÇÃO que ela mesma oferece, nunca um comando de terminal: exigir
             * que o operador conheça o procedimento interno é o Princípio 3 invertido.
             */
            blocks.push(el('div', 'widget-hint', 'escolher grava a raiz — depois é só INDEXAR'));
          }
        }

        // A NAVEGAÇÃO, por último: ela é o que faz descer, e quem desce rola de propósito.
        if (navegando) {
          if (navegando.pai) {
            blocks.push(button({ label: '↑ ACIMA', onClick: () => navegar(navegando.pai) }));
          }
          for (const e of navegando.entradas.slice(0, 40)) {
            blocks.push(
              button({
                label: `${e.ruido ? '· ' : ''}${e.nome}`,
                title: e.legivel ? e.caminho : `sem permissão: ${e.caminho}`,
                onClick: () => navegar(e.caminho),
              })
            );
          }
          // ⚠️ O corte em 40 é MUDO hoje: uma pasta com 200 subpastas mostra 40 e não diz que
          // cortou, e o operador conclui que a pasta que ele procura não existe.
          if (navegando.entradas.length > 40) {
            blocks.push(
              el('div', 'widget-hint', `mostrando 40 de ${navegando.entradas.length} — desça por uma delas`)
            );
          }
        }
        view.set(blocks);
      }
      listeners.add(draw);
      draw();
      lerAmbiente();
      return { destroy: () => listeners.delete(draw) };
    },
  });
}

// ---------------------------------------------------------------- COLEÇÃO

function registerCollection() {
  listWidget({
    id: 'st-collection',
    title: 'COLEÇÃO VETORIAL',
    hint: 'ESPERADO vs PRESENTE',
    slot: 'left',
    render(view, ctx) {
      function draw() {
        if (!storage) return view.empty(erro ? `indisponível: ${erro}` : 'lendo…');
        const c = storage.collection;
        if (!c.online) {
          return view.set([
            el('div', 'widget-error', `coleção inalcançável: ${c.error}`),
            kv('ESPERAVA', `${c.expected.dense} + ${c.expected.sparse}`),
          ]);
        }

        const blocks = [];

        /*
         * A DIVERGÊNCIA DE NOME DE VETOR É O PRIMEIRO ITEM DA TELA.
         *
         * É o acoplamento mais traiçoeiro do sistema: nome divergente devolve resultado VAZIO em
         * vez de erro. A busca não levanta exceção, não loga, e o sintoma é "não achou nada" —
         * indistinguível de um corpus que realmente não tem a resposta. Esta comparação é a
         * única defesa contra um modo de falha que não avisa.
         */
        if (c.mismatch.length) {
          blocks.push(
            el(
              'div',
              'widget-error',
              `⚠ vetor esperado e AUSENTE: ${c.mismatch.join(', ')} — a busca devolve vazio sem erro`
            )
          );
        }

        blocks.push(kv('COLEÇÃO', c.name));
        blocks.push(kv('PONTOS', (c.points || 0).toLocaleString('pt-BR')));
        blocks.push(el('div', 'controls-group', 'VETORES'));
        for (const [rotulo, esperado, presentes] of [
          ['DENSO', c.expected.dense, c.present.dense],
          ['ESPARSO', c.expected.sparse, c.present.sparse],
        ]) {
          const ok = presentes.includes(esperado);
          const row = el('div', `unit ${ok ? '' : 'down'}`);
          row.append(el('i', 'dot'), el('span', 'unit-name', rotulo));
          row.append(el('span', 'unit-detail', ok ? esperado : `esperava ${esperado}`));
          row.querySelector('.dot').dataset.status = ok ? 'on' : 'off';
          // Os presentes entram mesmo quando batem: é o que permite ver um vetor EXTRA, que não
          // quebra nada hoje mas explica uma coleção maior do que se esperava.
          if (presentes.length) row.append(el('div', 'unit-sub', `presentes: ${presentes.join(', ')}`));
          blocks.push(row);
        }
        blocks.push(el('div', 'widget-hint', `derivado de ${c.model}`));
        view.set(blocks);
      }
      return follow(draw, ctx);
    },
  });
}

// ---------------------------------------------------------------- COBERTURA

function registerCoverage() {
  listWidget({
    id: 'st-coverage',
    title: 'COBERTURA DO CORPUS',
    hint: 'POR TIPO E POR REPO',
    slot: 'stage',
    grow: 1,
    surface: true,
    render(view, ctx) {
      function draw() {
        if (!graph) return view.empty(vazioDoCeu);
        const stats = graph.stats || {};
        const blocks = [];

        /*
         * A RECONSTRUÇÃO DA TOPOLOGIA É O ÚNICO BOTÃO REAL DESTA TELA.
         *
         * Reindexar a coleção é de outro pipeline; prometer isso aqui seria um interruptor que
         * não controla nada. Refazer o grafo, sim, é deste servidor — `/api/graph?force=1` já
         * existia e não tinha quem o chamasse.
         */
        const refazer = button({ variant: 'select', size: 'sm' });
        refazer.textContent = 'RECONSTRUIR TOPOLOGIA';
        refazer.addEventListener('click', async () => {
          refazer.disabled = true;
          refazer.textContent = 'RECONSTRUINDO…';
          try {
            graph = await fetch('/api/graph?force=1').then((r) => r.json());
          } finally {
            notify();
          }
        });
        blocks.push(refazer);
        blocks.push(el('div', 'widget-hint', storage?.reindex_hint || ''));

        const secao = (titulo, mapa) => {
          const entradas = Object.entries(mapa || {}).sort((a, b) => b[1] - a[1]);
          if (!entradas.length) return;
          blocks.push(el('div', 'controls-group', titulo));
          const peak = entradas[0][1];
          for (const [nome, total] of entradas) {
            const linha = el('div', 'shape-row');
            linha.append(el('span', 'shape-name', nome));
            const trilho = el('div', 'shape-track');
            const barra = el('i', 'shape-bar');
            barra.style.width = `${Math.max(2, (total / peak) * 100)}%`;
            // Mesma cor que o céu usa para o tipo — o painel e a cena falam do mesmo dado.
            if (titulo.includes('TIPO')) {
              const cor = SKY_COLORS[nome] ?? SKY_COLORS.other;
              barra.style.background = `#${cor.toString(16).padStart(6, '0')}`;
            }
            trilho.append(barra);
            linha.append(trilho, el('span', 'shape-count', String(total)));
            blocks.push(linha);
          }
        };
        secao('POR TIPO DE CONHECIMENTO', stats.kinds);
        secao('POR REPOSITÓRIO', stats.repos);

        if (!stats.kinds && !stats.repos) {
          blocks.push(el('div', 'widget-empty', 'o payload da topologia não trouxe estatística'));
        }
        view.set(blocks);
      }
      return follow(draw, ctx);
    },
  });
}

// ---------------------------------------------------------------- CACHES

function registerCaches() {
  listWidget({
    id: 'st-caches',
    title: 'O QUE ESTE PROCESSO ESCREVEU',
    slot: 'right',
    grow: 1,
    render(view, ctx) {
      function draw() {
        if (!storage) return view.empty(erro ? `indisponível: ${erro}` : 'lendo…');
        const blocks = [];
        for (const item of storage.caches) {
          const row = el('div', `unit ${item.exists ? '' : 'down'}`);
          row.append(el('i', 'dot'), el('span', 'unit-name', item.path));
          row.append(
            el(
              'span',
              'unit-detail',
              item.exists ? `${bytes(item.bytes)} · ${idade(item.age_seconds)}` : 'não existe'
            )
          );
          row.querySelector('.dot').dataset.status = item.exists ? 'on' : 'off';
          row.append(el('div', 'unit-sub', item.note));
          blocks.push(row);
        }

        /*
         * A METADE QUE TODO PAINEL DE "LIMPAR DADOS" ESQUECE.
         *
         * A afinação, as seções recolhidas e as preferências vivem no `localStorage` do
         * NAVEGADOR, não no servidor. Apagar `.cache/` e achar que voltou ao estado de fábrica é
         * a expectativa que esta linha existe para desfazer — reset tem duas metades.
         */
        blocks.push(el('div', 'controls-group', 'A OUTRA METADE'));
        const chaves = Object.keys(localStorage).filter((k) => k.startsWith('espatial.'));
        blocks.push(
          el('div', 'unit-sub', `${plural(chaves.length, 'chave', 'chaves')} no localStorage deste navegador`)
        );
        for (const chave of chaves) blocks.push(el('div', 'unit-sub', `  ${chave}`));
        blocks.push(
          el('div', 'widget-hint', 'reset de fábrica tem duas metades: o disco do servidor e este navegador')
        );
        view.set(blocks);
      }
      return follow(draw, ctx);
    },
  });
}
