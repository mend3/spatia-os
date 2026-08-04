/**
 * Scrubber de tempo do céu — navegar a história do conhecimento arrastando.
 *
 * A base já existia: cada arquivo tem `changed_at` (epoch do último commit, `server/recency.py`)
 * e `recency` (posição no ranking dessa data), e o raio orbital em `space/graph.js` JÁ é a
 * recência. Faltava o controle.
 *
 * **A propriedade que este arquivo existe para não quebrar:** o eixo do scrubber é o mesmo
 * `recency` que posiciona o nó. É o que o Starmap do hermes-agent enuncia no próprio código
 * ("so a node's ring distance and its ignite time agree"). Se aqui houvesse um segundo modelo
 * de tempo — normalizar `changed_at` linearmente, por exemplo — o rótulo diria uma data e a
 * geometria mostraria outra, e a interface passaria a mentir com dado verdadeiro.
 *
 * **Por que a pista é RANK e o rótulo é DATA.** O `recency.py` mediu e registrou: neste corpus a
 * recência é exponencial (310 dos 397 arquivos no decil mais novo). Rank espalha, e é o que faz
 * a geometria ser legível; mas rank não diz que dia é. Então:
 *
 *   - a POSIÇÃO na pista é rank — arrastar metade da pista revela metade dos arquivos;
 *   - o RÓTULO é a data real do arquivo naquela posição do ranking;
 *   - as MARCAS de mês mostram a distorção em vez de esconder: um mês agitado ocupa um trecho
 *     longo da pista, um mês parado quase nada. A não-linearidade fica visível, não implícita.
 *
 * Um histograma de barras foi descartado por medição, não por gosto: como `recency` é rank, a
 * distribuição por bucket é uniforme POR CONSTRUÇÃO e as barras sairiam todas do mesmo tamanho —
 * ornamento com aparência de dado, que é exatamente o que este projeto não faz.
 */
import { listWidget } from './widgets-core.js';
import { el, set } from '../hud/dom.js';
import { button } from '../hud/button.js';
import { ui } from '../core/bus.js';
import { isSkyNode } from '../core/corpus.js';
import * as api from '../core/api.js';

// Passo do teclado: 1/40 da pista. Fino o bastante para achar um mês, grosso o bastante para
// atravessar o corpus em algumas dezenas de toques.
const KEY_STEP = 0.025;

// Separação mínima entre rótulos de mês, em fração da pista. Abaixo disso o texto se sobrepõe.
const LABEL_GAP = 0.06;

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

function stamp(epoch) {
  const date = new Date(epoch * 1000);
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

const monthKey = (epoch) => {
  const date = new Date(epoch * 1000);
  return `${date.getFullYear()}-${date.getMonth()}`;
};

/**
 * O eixo: os arquivos do céu ordenados por data, com a recência que o servidor já calculou.
 *
 * Guarda o par (recency, changed_at) porque a conversão entre os dois é o serviço inteiro deste
 * módulo — dado o playhead em rank, qual data é aquela.
 */
function buildAxis(nodes) {
  const files = nodes
    .filter((node) => isSkyNode(node) && node.type === 'file' && node.changed_at)
    .map((node) => ({ recency: node.recency ?? 0.5, at: node.changed_at }))
    .sort((a, b) => a.at - b.at);

  const undated = nodes.filter(
    (node) => isSkyNode(node) && node.type === 'file' && !node.changed_at
  ).length;

  /*
   * Uma marca por virada de mês, na posição de rank onde ela acontece.
   *
   * A MARCA sempre aparece; o RÓTULO só quando há espaço. Medido na pista real: `SET·25`,
   * `OUT·25` e `JUN·26` caem em 11,4% / 12,1% / 12,4% e os três textos se imprimiram um sobre o
   * outro, ilegíveis. Suprimir a marca esconderia que houve virada de mês ali (o que é o dado);
   * suprimir o rótulo só admite que a pista é estreita naquele trecho.
   */
  const ticks = [];
  let seen = null;
  let lastLabelAt = -1;
  for (const entry of files) {
    const key = monthKey(entry.at);
    if (key === seen) continue;
    seen = key;
    const date = new Date(entry.at * 1000);
    const room = entry.recency - lastLabelAt >= LABEL_GAP;
    if (room) lastLabelAt = entry.recency;
    ticks.push({
      at: entry.recency,
      label: room ? `${MONTHS[date.getMonth()]}·${String(date.getFullYear()).slice(2)}` : '',
      title: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
    });
  }

  return { files, ticks, undated };
}

/** Data do arquivo na posição `reveal` do ranking. Null quando não há eixo. */
function dateAt(axis, reveal) {
  if (!axis.files.length) return null;
  // Busca pelo último arquivo cuja recência já entrou na janela: é literalmente "o nó que o
  // playhead acabou de passar", e não uma interpolação entre datas que ninguém tem.
  let found = null;
  for (const entry of axis.files) {
    if (entry.recency > reveal) break;
    found = entry;
  }
  return found ? found.at : axis.files[0].at;
}

const revealedCount = (axis, reveal) => axis.files.filter((entry) => entry.recency <= reveal).length;

export function registerSkyTime() {
  listWidget({
    id: 'sky-time',
    title: 'JANELA DO TEMPO',
    hint: 'ÚLTIMO COMMIT',
    slot: 'strip',
    render(view) {
      let axis = { files: [], ticks: [], undated: 0 };
      let reveal = 1;
      let dragging = false;

      const track = el('div', 'scrub-track');
      track.tabIndex = 0;
      track.setAttribute('role', 'slider');
      track.setAttribute('aria-label', 'janela temporal do céu');
      const ticksLayer = el('div', 'scrub-ticks');
      const front = el('div', 'scrub-front');
      const head = el('div', 'scrub-head');
      track.append(ticksLayer, front, head);

      const readout = el('div', 'scrub-readout');
      const date = el('span', 'scrub-date', '—');
      const count = el('span', 'scrub-count', '');
      const note = el('span', 'scrub-note', '');
      readout.append(date, count, note);

      const row = el('div', 'scrub');
      const reset = button({
        variant: 'outline',
        size: 'sm',
        label: 'TUDO',
        title: 'devolve a janela ao presente (todo o corpus revelado)',
        onClick: () => apply(1),
      });
      row.append(track, reset);

      function paint() {
        const percent = `${(reveal * 100).toFixed(2)}%`;
        front.style.width = percent;
        head.style.left = percent;
        track.setAttribute('aria-valuenow', String(Math.round(reveal * 100)));

        const when = dateAt(axis, reveal);
        set(date, when ? stamp(when) : 'sem eixo temporal');
        const shown = revealedCount(axis, reveal);
        set(count, axis.files.length ? `${shown}/${axis.files.length} arquivos` : '');
        // A tela diz o que está fora do eixo em vez de silenciar: nó sem data não é filtrado
        // por data nenhuma, e o operador precisa saber que ele continua no céu.
        set(
          note,
          axis.undated
            ? `${axis.undated} sem data · sempre visível`
            : reveal >= 1
              ? 'presente'
              : 'pista = ranking · rótulo = data real'
        );
      }

      /** Aplica a janela: pinta o rótulo e manda a cena reencenar. Um caminho só. */
      function apply(next) {
        reveal = Math.max(0, Math.min(1, next));
        paint();
        // A cena não conhece este widget: o valor viaja pelo barramento, como todo o resto.
        ui('sky-reveal', { reveal });
      }

      const ratioAt = (clientX) => {
        const rect = track.getBoundingClientRect();
        if (!rect.width) return reveal;
        return (clientX - rect.left) / rect.width;
      };

      track.addEventListener('pointerdown', (event) => {
        dragging = true;
        // Aplica ANTES de capturar. `setPointerCapture` lança `NotFoundError` para um
        // `pointerId` que não corresponde a um ponteiro ativo, e capturar primeiro fazia o
        // clique inteiro ser descartado pela exceção. Sem ele o arraste ainda funciona; sem o
        // `apply` não funciona nada.
        apply(ratioAt(event.clientX));
        try {
          // Sem a captura, arrastar para fora da pista solta o controle no meio do gesto e o
          // playhead congela onde o cursor saiu.
          track.setPointerCapture(event.pointerId);
        } catch {
          // Ponteiro sintético (teste) ou já liberado: o arraste segue pelos eventos na pista.
        }
      });
      track.addEventListener('pointermove', (event) => {
        if (dragging) apply(ratioAt(event.clientX));
      });
      const release = (event) => {
        dragging = false;
        try {
          if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
        } catch {
          // Mesma razão do `pointerdown`: liberar um ponteiro que não está capturado lança.
        }
      };
      track.addEventListener('pointerup', release);
      track.addEventListener('pointercancel', release);

      // Setas com foco na pista. Não passa pelo `keys.js` de propósito: ali é atalho GLOBAL, e
      // seta global brigaria com o histórico do terminal.
      track.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowRight' ? KEY_STEP : event.key === 'ArrowLeft' ? -KEY_STEP : 0;
        if (!step) return;
        event.preventDefault();
        apply(reveal + step);
      });

      view.set([row, readout]);
      paint();

      api
        .graph()
        .then((payload) => {
          axis = buildAxis(payload.nodes || []);
          ticksLayer.replaceChildren(
            ...axis.ticks.map((tick) => {
              const mark = el('i', 'scrub-tick');
              mark.style.left = `${tick.at * 100}%`;
              mark.dataset.label = tick.label;
              // O mês suprimido do rótulo continua alcançável pelo cursor.
              mark.title = tick.title;
              return mark;
            })
          );
          paint();
        })
        .catch((error) => set(note, `eixo indisponível: ${error.message}`));

      return null;
    },
  });
}
