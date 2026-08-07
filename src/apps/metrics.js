/**
 * INSTRUMENTOS — as quatro perguntas que o `METRICS.md` já declara.
 *
 * A tela não inventa pergunta: renderiza um catálogo que já as declarou. Demorou onde, o índice
 * apodreceu, quanto custou, a tela aguenta.
 *
 * ⚠️ **O PROCESSO É O ARMAZENAMENTO.** São contadores em memória desde o boot, sem série
 * temporal — por isso não há seletor de janela, consulta arbitrária nem alerta. Um eixo do tempo
 * mentiria sobre dados que não existem. Quem quer histórico aponta um Prometheus para
 * `/metrics`, e a resposta honesta desta tela é dizer isso.
 */
import { registerApp } from '../kernel/registry.js';
import { listWidget } from './widgets-core.js';
import { el, money, plural } from '../hud/dom.js';
import * as prom from '../core/promtext.js';
import { TOOL_COLORS } from '../space/satellites.js';

const COLOR = 0x8fd6ff;
const P = 'espatial_';

let families = null;
let erro = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

function follow(draw) {
  listeners.add(draw);
  draw();
  return { destroy: () => listeners.delete(draw) };
}

/*
 * Uma coleta para os cinco widgets, num intervalo só.
 *
 * Cinco widgets com um `setInterval` cada dariam cinco leituras do mesmo `/metrics` por ciclo —
 * e, pior, cinco fotos de instantes diferentes na mesma tela: o custo de um painel discordaria
 * do contador do vizinho por causa da ordem em que os timers dispararam.
 */
let timer = null;
let vivos = 0;

async function collect() {
  try {
    const text = await fetch('/metrics').then((r) => r.text());
    families = prom.parse(text);
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
    timer = setInterval(collect, 5000);
  }
  const handle = follow(draw);
  return {
    destroy: () => {
      handle.destroy();
      vivos -= 1;
      if (vivos <= 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

const ms = (seconds) => (seconds === null ? '—' : `${(seconds * 1000).toFixed(seconds < 0.01 ? 1 : 0)} ms`);

function kv(label, value) {
  const row = el('div', 'kv');
  row.append(el('span', 'kv-label', label), el('span', 'kv-value', String(value)));
  return row;
}

/*
 * Paleta categórica dos tipos de token, em ORDEM FIXA e nunca ciclada.
 *
 * A cor segue a ENTIDADE, não a posição: quando um tipo some (nem toda resposta cria cache), os
 * que sobram mantêm a cor que tinham. Cor por ranking faria a mesma barra trocar de cor entre
 * duas coletas e o operador leria como se o dado tivesse mudado de natureza.
 *
 * Validada contra a superfície real do painel (`#04060a`) com o validador da skill dataviz:
 * faixa de luminosidade, piso de croma, separação CVD (pior par adjacente ΔE 8,4 protan),
 * piso de visão normal (19,8) e contraste ≥ 3:1 — os seis passam.
 */
const TOKEN_HUES = {
  input: '#3987e5',
  output: '#d95926',
  cache_read: '#199e70',
  cache_creation: '#c98500',
};
const TOKEN_ORDER = ['input', 'output', 'cache_read', 'cache_creation'];

/**
 * Composição em UMA barra empilhada de 100%.
 *
 * Barras lado a lado não servem aqui: `cache_read` costuma ser 15.000× o `input`, e numa escala
 * linear compartilhada três das quatro barras somem. A pergunta desta seção não é "quanto de
 * cada", é **o que dominou o gasto** — e proporção é exatamente o que uma barra empilhada diz.
 *
 * O valor absoluto vive na LEGENDA, não sobre o segmento: com uma fatia de 0,006% não há pixel
 * onde escrever, e um rótulo pendurado fora dela apontaria para o vizinho.
 */
function stackedBar(entries, total) {
  const barra = el('div', 'mx-stack');
  Object.assign(barra.style, {
    display: 'flex',
    gap: '2px',
    /*
     * `flex: 0 0 14px` e não `height: 14px`.
     *
     * O `.scroll` do widget é uma coluna flex, e quando o conteúdo passa da altura do painel
     * todo item encolhe. Com `height` sozinho a barra ia a ZERO — o `<i>` colorido continuava lá,
     * com a largura certa e nenhuma altura, e a tela mostrava a legenda sem o gráfico. As linhas
     * vizinhas não sofriam porque têm texto dentro segurando a altura.
     */
    flex: '0 0 14px',
    margin: '6px 0 10px',
    // Moldura fina como as réguas do HUD: o trilho existe mesmo onde o dado não chega.
    border: '1px solid var(--line)',
    padding: '1px',
  });

  for (const [index, { key, label, value }] of entries.entries()) {
    const share = value / total;
    const parte = el('i');
    Object.assign(parte.style, {
      /*
       * O piso é `min-width` e a base ENCOLHE (`0 1`), não `flex: 0 0 max(2%, …)`.
       *
       * Uma fatia real que arredondasse para zero desapareceria, e sumir é o que se faz com o
       * que não existe, não com o que é pequeno. Mas forçar 2% em cada sliver fazia a soma
       * passar de 100% (com três tipos: 2 + 2 + 99,4) e o segmento dominante era cortado no fim
       * da barra — a fatia de 99% aparecia menor que a realidade para caber a de 0,01%.
       */
      flex: `0 1 ${share * 100}%`,
      minWidth: '2px',
      backgroundColor: TOKEN_HUES[key] ?? TOKEN_HUES.input,
      /*
       * Preenchimento SEGMENTADO, no vocabulário dos medidores do HUD.
       *
       * A textura é decoração; a codificação continua sendo a largura, que não muda. Os traços
       * dão ao olho uma régua para comparar duas coletas — um bloco chapado só diz "grande".
       */
      backgroundImage:
        'repeating-linear-gradient(90deg, rgba(4,6,10,0.55) 0 1px, transparent 1px 4px)',
      borderRadius: index === 0 ? '2px 0 0 2px' : index === entries.length - 1 ? '0 2px 2px 0' : '0',
    });
    parte.title = `${label}: ${Math.round(value).toLocaleString('pt-BR')} tk · ${(share * 100).toFixed(2)}%`;
    barra.append(parte);
  }
  return barra;
}

/** Legenda: o quadrado carrega a identidade, o texto fica em tinta de texto — nunca colorido. */
function legend(entries, total) {
  return entries.map(({ key, label, value }) => {
    const linha = el('div', 'kv');
    const nome = el('span', 'kv-label');
    const marca = el('i');
    Object.assign(marca.style, {
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '2px',
      marginRight: '6px',
      background: TOKEN_HUES[key] ?? TOKEN_HUES.input,
    });
    nome.append(marca, document.createTextNode(label));
    linha.append(
      nome,
      el('span', 'kv-value', `${Math.round(value).toLocaleString('pt-BR')} tk · ${((value / total) * 100).toFixed(2)}%`)
    );
    return linha;
  });
}

/** Barra proporcional ao maior da lista — sem eixo: a pergunta é a ordem de grandeza. */
function bar(name, count, peak, color) {
  const linha = el('div', 'shape-row');
  linha.append(el('span', 'shape-name', name));
  const trilho = el('div', 'shape-track');
  const barra = el('i', 'shape-bar');
  barra.style.width = `${Math.max(2, (count / peak) * 100)}%`;
  if (color) barra.style.background = color;
  trilho.append(barra);
  linha.append(trilho, el('span', 'shape-count', String(count)));
  return linha;
}

export function registerMetrics() {
  registerStages();
  registerTools();
  registerCorpus();
  registerCost();
  registerClient();

  registerApp({
    id: 'metrics',
    name: 'INSTRUMENTOS',
    tagline: 'demorou onde, custou quanto, a tela aguenta',
    color: COLOR,
    key: '6',
    widgets: ['context', 'mx-corpus', 'mx-tools', 'mx-stages', 'mx-cost', 'mx-client', 'answer', 'sky-time', 'timeline'],
  });
}

// ---------------------------------------------------------------- ESTÁGIOS

function registerStages() {
  listWidget({
    id: 'mx-stages',
    title: 'A RESPOSTA DEMOROU — ONDE?',
    slot: 'stage',
    grow: 1,
    surface: true,
    render(view) {
      function draw() {
        if (erro) return view.empty(`/metrics indisponível: ${erro}`);
        if (!families) return view.empty('coletando…');

        const blocks = [];
        const estagios = prom.labelValues(families, `${P}ask_stage_duration_seconds_count`, 'stage');
        if (!estagios.length) {
          blocks.push(el('div', 'widget-empty', 'nenhuma pergunta ainda — os estágios nascem na primeira'));
        }

        for (const stage of estagios) {
          const where = { stage };
          const contagem = prom.sum(families, `${P}ask_stage_duration_seconds_count`, where);
          const linha = el('div', 'unit');
          linha.append(el('span', 'unit-name', stage.toUpperCase()));
          linha.append(
            el(
              'span',
              'unit-detail',
              `média ${ms(prom.average(families, `${P}ask_stage_duration_seconds`, where))}` +
                ` · p90 < ${ms(prom.quantile(families, `${P}ask_stage_duration_seconds`, 0.9, where))}` +
                ` · ${plural(contagem, 'vez', 'vezes')}`
            )
          );
          blocks.push(linha);
        }

        blocks.push(el('div', 'controls-group', 'ATÉ A PRIMEIRA LETRA'));
        for (const brain of prom.labelValues(families, `${P}ask_ttft_seconds_count`, 'brain')) {
          blocks.push(
            kv(
              brain.toUpperCase(),
              `média ${ms(prom.average(families, `${P}ask_ttft_seconds`, { brain }))} · p90 < ${ms(
                prom.quantile(families, `${P}ask_ttft_seconds`, 0.9, { brain })
              )}`
            )
          );
        }

        /*
         * Os dois avisos que o doc manda a tela carregar POR ESCRITO, porque ambos já estão
         * documentados como armadilha e um número sem eles convida à conclusão errada.
         */
        blocks.push(
          el('div', 'widget-hint', 'p90 é a BORDA do bucket, não interpolação: leia "abaixo de"'),
          el('div', 'widget-hint', '/api/ask fica fora do histograma de latência HTTP de propósito — é stream longo')
        );
        view.set(blocks);
      }
      return attach(draw);
    },
  });
}

// ---------------------------------------------------------------- FERRAMENTAS

function registerTools() {
  listWidget({
    id: 'mx-tools',
    title: 'FERRAMENTAS',
    hint: 'O HISTOGRAMA DO CÉU',
    slot: 'left',
    grow: 1,
    render(view) {
      function draw() {
        if (!families) return view.empty(erro ? `indisponível: ${erro}` : 'coletando…');
        const samples = families.get(`${P}tool_calls_total`)?.samples || [];
        if (!samples.length) return view.empty('nenhuma chamada ainda');

        // Agrega por ferramenta, guardando o `kind` para a cor e os erros para o rótulo.
        const porFerramenta = new Map();
        for (const sample of samples) {
          const nome = sample.labels.tool || '?';
          const atual = porFerramenta.get(nome) || { total: 0, erros: 0, kind: sample.labels.kind };
          atual.total += sample.value;
          if (sample.labels.outcome === 'error') atual.erros += sample.value;
          porFerramenta.set(nome, atual);
        }

        const ordenado = [...porFerramenta.entries()].sort((a, b) => b[1].total - a[1].total);
        const peak = ordenado[0][1].total;
        const blocks = ordenado.map(([nome, dado]) => {
          // A cor é a MESMA que a cena usa para aquele `kind` — o painel e o céu falam do mesmo
          // dado, e cor divergente faria parecerem dois assuntos.
          const cor = TOOL_COLORS[dado.kind] ?? TOOL_COLORS.other;
          const linha = bar(nome, dado.total, peak, `#${cor.toString(16).padStart(6, '0')}`);
          if (dado.erros) linha.append(el('span', 'widget-error', `${dado.erros} com erro`));
          return linha;
        });
        view.set(blocks);
      }
      return attach(draw);
    },
  });
}

// ---------------------------------------------------------------- CORPUS

function registerCorpus() {
  listWidget({
    id: 'mx-corpus',
    title: 'O ÍNDICE APODRECEU?',
    slot: 'left',
    render(view) {
      function draw() {
        if (!families) return view.empty(erro ? `indisponível: ${erro}` : 'coletando…');
        const g = (name) => prom.gauge(families, `${P}${name}`);
        const rows = [
          ['CHUNKS', g('index_points')?.toLocaleString('pt-BR') ?? '—'],
          ['ARQUIVOS', g('index_files')?.toLocaleString('pt-BR') ?? '—'],
          ['NÓS DO GRAFO', g('graph_nodes')?.toLocaleString('pt-BR') ?? '—'],
          ['ARESTAS', g('graph_edges')?.toLocaleString('pt-BR') ?? '—'],
        ];
        // A idade do índice é a métrica que responde "apodreceu?" — o nome da família diz
        // `seconds` e a pergunta é em dias, então a conversão é aqui e não na leitura.
        const idade = g('index_age_seconds');
        if (idade !== null) rows.push(['IDADE DO ÍNDICE', `${(idade / 86400).toFixed(1)} dias`]);
        const subiu = g('process_start_time_seconds');
        if (subiu) {
          const horas = (Date.now() / 1000 - subiu) / 3600;
          rows.push(['NO AR HÁ', horas < 1 ? `${Math.round(horas * 60)} min` : `${horas.toFixed(1)} h`]);
        }
        const rss = g('process_resident_memory_bytes');
        if (rss) rows.push(['MEMÓRIA', `${(rss / 1024 ** 3).toFixed(2)} GiB`]);

        const blocks = rows.map(([label, value]) => kv(label, value));
        const score = prom.average(families, `${P}retrieval_top_score`);
        if (score !== null) {
          blocks.push(kv('SCORE MÉDIO DO 1º', score.toFixed(4)));
          // Armadilha documentada: RRF não é comparável entre consultas em valor absoluto.
          blocks.push(el('div', 'widget-hint', 'score de fusão RRF: sinal de deriva, não medida de qualidade'));
        }
        view.set(blocks);
      }
      return attach(draw);
    },
  });
}

// ---------------------------------------------------------------- CUSTO

function registerCost() {
  listWidget({
    id: 'mx-cost',
    title: 'QUANTO CUSTOU?',
    hint: 'DESDE O BOOT',
    slot: 'right',
    grow: 1,
    render(view) {
      function draw() {
        if (!families) return view.empty(erro ? `indisponível: ${erro}` : 'coletando…');
        const blocks = [];

        const modelos = prom.labelValues(families, `${P}agent_cost_usd_total`, 'model');
        if (!modelos.length) {
          blocks.push(el('div', 'widget-empty', 'nenhuma resposta ainda'));
        } else {
          /*
           * O total é NÚMERO DE MANCHETE, não gráfico.
           *
           * "Quanto custou" tem uma resposta só, e um gráfico de uma barra é decoração em cima
           * de um número. O detalhe por modelo entra abaixo, e só quando há mais de um — com um
           * modelo ele repetiria a manchete.
           */
          const total = modelos.reduce(
            (soma, model) => soma + prom.sum(families, `${P}agent_cost_usd_total`, { model }),
            0
          );
          const manchete = el('div', 'mx-hero', money(total));
          Object.assign(manchete.style, { fontSize: '1.6em', lineHeight: '1.2', margin: '2px 0 8px' });
          blocks.push(manchete);
          if (modelos.length > 1) {
            for (const model of modelos) {
              blocks.push(kv(model, money(prom.sum(families, `${P}agent_cost_usd_total`, { model }))));
            }
          } else {
            blocks.push(el('div', 'widget-hint', modelos[0]));
          }
        }

        /*
         * A composição dos tokens é o que EXPLICA o número acima: cache lido não custa o mesmo
         * que token de saída, e ver que 99% da massa é cache é a diferença entre "gastei muito"
         * e "gastei muito relendo contexto".
         */
        const presentes = TOKEN_ORDER.map((kind) => ({
          key: kind,
          label: kind,
          value: prom.sum(families, `${P}agent_tokens_total`, { kind }),
        })).filter((entry) => entry.value > 0);

        if (presentes.length) {
          blocks.push(el('div', 'controls-group', 'COMPOSIÇÃO DOS TOKENS'));
          const totalTk = presentes.reduce((soma, entry) => soma + entry.value, 0);
          blocks.push(stackedBar(presentes, totalTk));
          // Legenda sempre presente com 2+ séries: a identidade nunca pode ser só a cor.
          blocks.push(...legend(presentes, totalTk));
        }

        const pensamento = prom.gauge(families, `${P}agent_thinking_tokens_total`);
        if (pensamento) blocks.push(kv('RACIOCÍNIO', `${Math.round(pensamento).toLocaleString('pt-BR')} tk`));
        const turnos = prom.average(families, `${P}agent_turns`);
        if (turnos !== null) blocks.push(kv('TURNOS (MÉDIA)', turnos.toFixed(1)));

        // O contador é do PROCESSO, desde o boot. O gasto que atravessa restart é o do diário —
        // dizer de onde o número vem impede que os dois sejam lidos como o mesmo.
        blocks.push(el('div', 'widget-hint', 'contadores em memória desde o boot · o gasto que sobrevive ao restart está em #/journal'));
        view.set(blocks);
      }
      return attach(draw);
    },
  });
}

// ---------------------------------------------------------------- CLIENTE

function registerClient() {
  listWidget({
    id: 'mx-client',
    title: 'A TELA AGUENTA?',
    slot: 'right',
    render(view) {
      function draw() {
        if (!families) return view.empty(erro ? `indisponível: ${erro}` : 'coletando…');
        const fps = prom.average(families, `${P}client_fps`);
        const longos = prom.gauge(families, `${P}client_long_frames_total`);
        const nos = prom.gauge(families, `${P}client_scene_nodes`);
        const rows = [];
        if (fps !== null) rows.push(['FPS MÉDIO', fps.toFixed(1)]);
        if (longos !== null) rows.push(['QUADROS LONGOS', Math.round(longos).toLocaleString('pt-BR')]);
        if (nos !== null) rows.push(['NÓS NA CENA', Math.round(nos).toLocaleString('pt-BR')]);

        const blocks = rows.map(([label, value]) => kv(label, value));
        if (!rows.length) {
          blocks.push(el('div', 'widget-empty', 'o cliente ainda não reportou — a telemetria sobe depois do boot da cena'));
        }
        /*
         * A resposta honesta sobre o que esta tela NÃO é.
         *
         * Sem série temporal, um eixo do tempo mentiria sobre dados que não existem. Em vez de
         * inventar o gráfico, a tela diz onde o histórico mora de verdade.
         */
        blocks.push(
          el('div', 'controls-group', 'HISTÓRICO'),
          el('div', 'unit-sub', 'o processo é o armazenamento: contadores desde o boot, sem série temporal'),
          el('div', 'unit-sub', 'para histórico, aponte um Prometheus para /metrics — o oracle já tem um')
        );
        view.set(blocks);
      }
      return attach(draw);
    },
  });
}
