/**
 * CONTEXTO — o que está sob o cursor (ou travado), e para onde vão os arcos.
 *
 * ## A pergunta que hoje não tem resposta
 *
 * O vínculo virou desenho sob demanda (`space/links.js`): passar o cursor num astro acende
 * alguns arcos até os corpos ligados a ele. O desenho responde *existe relação* e não responde
 * *com QUEM* — na distância em que a cena vive, as duas pontas do arco são pixels iguais. Um
 * vínculo que não nomeia o destino é geometria bonita, não informação.
 *
 * ## Por que a legenda vem do MESMO evento que desenha
 *
 * Este painel não pergunta os vizinhos ao grafo: ele escuta `ui.links`, emitido dentro da rotina
 * que manda desenhar (`scene.paintLinks`), já cortado no número de arcos que o desenho aceitou.
 * Recalcular aqui daria uma SEGUNDA lista, e no dia em que o teto de `MAX_LINKS` mordesse ela
 * nomearia um vínculo ausente da tela — sem erro nenhum, só divergência silenciosa. É a regra
 * que este projeto já aplica às métricas: o que se lê nasce do mesmo lugar que o que se vê.
 *
 * ## O que ele mostra que o `fs-content` não mostra
 *
 * O leitor central já legenda o hover (nome, tipo, chunks, sujo, supernova) — mas só dentro do
 * app de ARQUIVOS, e o céu está visível em toda rota. Aqui, além de existir na vista de sistema,
 * entram três coisas que chegavam no fio e morriam:
 *
 * - a **classe celeste** (`space/catalog.js`), que é o que explica o anel, o envoltório ou a
 *   ausência dos dois naquele corpo — hoje o operador vê a feição e não tem onde ler a regra;
 * - o **`changed_at`**, a data real do último commit. O `server/recency.py` escreve, no próprio
 *   comentário que justifica usar rank em vez de tempo, que "a data exata continua no nó e é ela
 *   que a UI mostra ao inspecionar" — e nenhuma tela mostrava;
 * - as **seções** do arquivo indexado, ~23% do payload da topologia sem nenhum consumidor.
 *
 * ## Precedência
 *
 * Cursor vence foco enquanto existe, porque é assim que o ARCO se comporta. Painel e desenho
 * discordando sobre de quem estão falando seria pior que não ter painel.
 */
import { listWidget } from './widgets-core.js';
import { el, plural, shortPath } from '../hud/dom.js';
import { on, emit } from '../core/bus.js';
import { button } from '../hud/button.js';
import { classify } from '../space/catalog.js';
import { DIRTY_LABELS } from '../space/rings.js';

/**
 * Vazio que ENSINA o gesto, em vez de afirmar a ausência.
 *
 * A faixa de contexto do cabeçalho fica em branco quando não há nada — lá é uma tira de poucos
 * pixels e escrever "nenhum astro selecionado" gastaria espaço para dizer nada. Aqui a seção
 * existe montada de qualquer forma, e o custo de uma frase é zero: então ela paga o espaço
 * dizendo o que fazer para preenchê-la.
 */
const VAZIO = 'passe o cursor sobre um astro — ou clique para travar a câmera nele';

/** Teto de seções listadas. O servidor já corta em 12; aqui é o que cabe sem virar rolagem. */
const MAX_SECOES = 6;

const DIA_MS = 86_400_000;
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export function registerContextWidget() {
  listWidget({
    id: 'context',
    title: 'CONTEXTO',
    // Cabe na régua do rótulo. "O QUE ESTÁ SOB ATENÇÃO" saía como "O QUE ESTÁ SO…" na tela.
    hint: 'SOB ATENÇÃO',
    slot: 'right',
    render(view) {
      const off = on('ui.links', ({ subject, dirty, origin, nodes }) => {
        if (!subject) {
          view.empty(VAZIO);
          return;
        }
        view.set(desenhar(subject, dirty, origin, nodes || []));
      });
      view.empty(VAZIO);
      return { destroy: off };
    },
  });
}

function desenhar(node, dirty, origin, vizinhos) {
  const linhas = [];
  const classe = classify(node, { dirty });

  const cabecalho = el('div', 'fs-title', node.source || node.label || node.id);
  cabecalho.title = node.source || node.id;
  linhas.push(cabecalho);

  /*
   * A CLASSE primeiro, e o gesto que a trouxe junto dela.
   *
   * "ESTRELA" e "PLANETA COM ANEL" não são rótulo decorativo: é a classe que decide quais
   * feições aquele corpo pode carregar, e é ela que responde "por que este tem anel e aquele
   * não". Sem isso o catálogo é uma regra que só o código conhece.
   */
  const meta = el('div', 'hover-meta');
  meta.textContent = [
    classe.name,
    origin === 'focus' ? 'TRAVADO' : null,
    node.kind,
    node.type === 'file' ? null : 'AGREGADO',
  ]
    .filter(Boolean)
    .join(' · ');
  linhas.push(meta);

  linhas.push(vital('MASSA', String(node.chunks ?? 0), 'chunks'));

  if (node.type === 'file') {
    const quando = quandoMudou(node.changed_at);
    if (quando) linhas.push(vital('ÚLTIMO COMMIT', quando.data, quando.idade));
    // Sem `??`, churn 0 escreveria a linha para dizer que não houve reescrita — ruído com custo
    // de espaço numa seção que muda a cada gesto.
    if (node.churn) linhas.push(vital('REESCRITAS', `${node.churn}×`, 'em 30d'));
    if (dirty) linhas.push(vital('DISCO', DIRTY_LABELS[dirty] ?? dirty.toUpperCase()));
    if (node.indexed_at) linhas.push(vital('INDEXADO', node.indexed_at));
  }

  /*
   * VÍNCULOS antes de SEÇÕES, e a ordem foi corrigida OLHANDO.
   *
   * Com as seções em cima, um arquivo de 12 títulos empurrava a lista de vínculos para baixo da
   * dobra do trilho — o painel existe para nomear os arcos e justamente isso ficava escondido
   * atrás do detalhe de um documento. O que responde à pergunta vem primeiro; o resto rola.
   */
  linhas.push(...vinculos(vizinhos));

  const secoes = node.sections || [];
  if (secoes.length) {
    linhas.push(titulo(`SEÇÕES · ${secoes.length}`));
    for (const secao of secoes.slice(0, MAX_SECOES)) {
      /*
       * Só a ÚLTIMA folha do caminho de títulos.
       *
       * O indexador grava a seção como breadcrumb completo ("§ Review Board — … § Juízes §
       * Divergências"), e num trilho de 250px isso quebra em três linhas onde as seis entradas
       * começam iguais — o que distingue uma da outra está no fim. Mesma regra da faixa de
       * contexto do cabeçalho: o trecho final na tela, o caminho inteiro no `title`.
       */
      const folha = secao.split('§').pop().trim() || secao;
      const linha = el('div', 'source-section', `§ ${folha}`);
      linha.title = secao;
      linhas.push(linha);
    }
    if (secoes.length > MAX_SECOES) {
      linhas.push(el('div', 'widget-hint', `+${secoes.length - MAX_SECOES} não listadas`));
    }
  }

  return linhas;
}

/**
 * A lista de vínculos — e é ela que faz o painel deixar de ser legenda e virar navegação.
 *
 * `ui.focus-node` (não `ui.select`): a câmera voa até o vizinho e os arcos se repintam a partir
 * DELE, que é o gesto de percorrer o grafo. `ui.select` abriria o inspetor de conteúdo por cima,
 * e ler o arquivo é outra intenção, com outro caminho.
 */
function vinculos(vizinhos) {
  const linhas = [titulo(vizinhos.length ? `VÍNCULOS · ${vizinhos.length}` : 'VÍNCULOS')];
  if (!vizinhos.length) {
    linhas.push(el('div', 'widget-empty', 'nenhum arco desenhado para este corpo'));
    return linhas;
  }
  for (const vizinho of vizinhos) {
    const alvo = vizinho.source || vizinho.id;
    const linha = button({
      variant: 'row',
      size: 'row',
      title: alvo,
      data: { entry: vizinho.type === 'file' ? 'file' : 'dir', kind: vizinho.kind },
      onClick: () => emit({ t: 'ui.focus-node', source: alvo }),
    });
    linha.append(el('span', 'fs-glyph', vizinho.type === 'file' ? '·' : '▸'));
    linha.append(el('span', 'fs-name', vizinho.label || shortPath(alvo)));
    linha.append(el('span', 'fs-meta', String(vizinho.chunks ?? '')));
    linhas.push(linha);
  }
  return linhas;
}

/** Linha rótulo/valor no mesmo desenho dos medidores da esquerda — mesma língua, zero CSS novo. */
function vital(rotulo, valor, unidade = '') {
  const linha = el('div', 'vital');
  linha.append(el('span', 'vital-label', rotulo), el('strong', 'vital-value', valor));
  linha.append(el('span', 'vital-unit', unidade));
  return linha;
}

const titulo = (texto) => el('div', 'fs-title', texto);

/**
 * Data do commit E há quantos dias — as duas, porque respondem perguntas diferentes.
 *
 * "14 JUL 2026" situa na história do repositório; "há 22 d" é o que o olho compara com o raio
 * orbital sem fazer conta. Mostrar só a data obrigaria o operador a calcular a idade toda vez.
 *
 * @param {number|null} epoch  segundos, como o `server/recency.py` escreve
 */
function quandoMudou(epoch) {
  if (!epoch) return null;
  const quando = new Date(epoch * 1000);
  const dias = Math.max(0, Math.floor((Date.now() - quando.getTime()) / DIA_MS));
  return {
    // `toLocaleDateString('pt-BR', {month:'short'})` devolve "31 de jul. de 2026" — dois "de" e
    // um ponto numa coluna de valor que tem a largura de um número. A tabela é literal porque o
    // formato aqui é de INSTRUMENTO, não de prosa; o relógio do cabeçalho, que é frase, segue
    // usando o locale.
    data: `${String(quando.getDate()).padStart(2, '0')} ${MESES[quando.getMonth()]} ${quando.getFullYear()}`,
    idade: dias === 0 ? 'hoje' : `há ${plural(dias, 'dia')}`,
  };
}
