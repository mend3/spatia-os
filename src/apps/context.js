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
import { tipoDeCorpo } from '../core/cena-atual.js';
import { el, plural, shortPath } from '../hud/dom.js';
import { on, emit } from '../core/bus.js';
import * as attention from '../core/attention.js';
import { button } from '../hud/button.js';
import { classify, morphologyOf } from '../space/catalog.js';
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
      const pintar = ({ subject, dirty, origin, links, rede }) => {
        if (!subject) {
          view.empty(VAZIO);
          return;
        }
        view.set(desenhar(subject, dirty, origin, links || [], rede || null));
      };

      const off = on('ui.links', ({ subject, dirty, origin, nodes, rede }) =>
        pintar({ subject, dirty, origin, links: nodes, rede })
      );

      /*
       * Mount reads the STORE, not the last event — and this is the fix for a bug seen on screen.
       *
       * This widget is destroyed and rebuilt on every route change, and the notification that
       * would fill it already fired: the operator locked a star, navigated (clicking a body in the
       * sky navigates by itself, `kernel/router.js`), and the panel came back blank about a body
       * that was still in focus. Painting from `attention.snapshot()` makes remounting recover the
       * present instead of waiting for the operator to move the mouse again.
       */
      pintar(attention.snapshot());
      return { destroy: off };
    },
  });
}

function desenhar(node, dirty, origin, vizinhos, rede) {
  const linhas = [];
  const classe = classify(node, { dirty });

  const cabecalho = el('div', 'fs-title', node.source || node.label || node.id);
  cabecalho.title = node.source || node.id;
  linhas.push(cabecalho);

  /*
   * O NOME DO CORPO primeiro, e o gesto que o trouxe junto dele.
   *
   * "PLANETA COM ANEL" e "COMETA EXTINTO" não são rótulo decorativo: é a classe que decide quais
   * feições aquele corpo pode carregar, e é ela que responde "por que este tem anel e aquele
   * não". Sem isso o catálogo é uma regra que só o código conhece.
   *
   * ⚠️ Menos quando a classe é a PADRÃO — e aí ela passou a mentir. `estrela` é o nome do estado
   * "nada de especial aconteceu com este arquivo", e desde que a morfologia passou a rotear a
   * superfície (`solver.js`) o corpo desenhado nesse caso vem do `kind`: um `agent` aparece como
   * ESTAÇÃO na tela enquanto o painel dizia ESTRELA. Reportado exatamente assim, e é a mesma
   * classe de defeito do leitor que pedia um gesto já feito — duas afirmações sobre um só estado.
   *
   * Quando o ESTADO produz um corpo próprio (sujo, dormente, lua, agregado) a classe continua
   * sendo a resposta certa, porque ali ela é que decide o que a tela desenha.
   */
  const meta = el('div', 'hover-meta');
  /*
   * ⚠️ A CENA responde primeiro. Na UNIVERSO o corpo vem da ontologia nova (`entity-physics`), e
   * ignorá-la fazia a HUD anunciar `GALÁXIA · dir · AGREGADO` sobre um agregado que aquela cena
   * chama de SISTEMA — o modelo velho falando por cima do novo. `null` significa "a cena não tem
   * opinião", e aí o catálogo antigo continua sendo a resposta certa.
   */
  const daCena = tipoDeCorpo(node.source);
  const corpo = daCena
    ?? (classe.id === 'estrela' ? morphologyOf(node.kind).body.toUpperCase() : classe.name);
  meta.textContent = [
    corpo,
    origin === 'focus' ? 'TRAVADO' : null,
    node.kind,
    node.type === 'file' || daCena ? null : 'AGREGADO',
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
  linhas.push(...vinculos(vizinhos, rede));

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
function vinculos(vizinhos, rede) {
  const linhas = [titulo(vizinhos.length ? `VÍNCULOS · ${vizinhos.length}` : 'VÍNCULOS')];
  if (rede?.indisponivel) {
    // ⚠️ "Não materializei" ≠ "não tem vizinho". A frase é diferente de propósito: um snapshot
    // ausente não pode ser lido como um corpo periférico — é o `null` ≠ `0` do lado do texto.
    linhas.push(el('div', 'widget-empty', `rede não medida — ${rede.indisponivel}`));
    return linhas;
  }
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
    /*
     * O TIPO do vínculo no lugar da massa, quando ele existe.
     *
     * A cena UNIVERSO desenha vínculos de tipos diferentes ao mesmo tempo, com cores diferentes —
     * e cor sem nome é decoração. `SIMILAR_TO` e `CO_EDITED` não afirmam a mesma coisa
     * (`integracao-neo4j.md` §3.2.2), e a linha tem de dizer qual das duas está na tela junto com
     * o número BRUTO que a sustenta: "3 commits" é verificável, "0,10" não é nada.
     */
    linha.append(el('span', 'fs-meta', vizinho.vinculo ? forcaDe(vizinho.vinculo) : String(vizinho.chunks ?? '')));
    if (vizinho.vinculo) linha.dataset.vinculo = vizinho.vinculo.tipo;
    linhas.push(linha);
  }
  linhas.push(...legenda(rede));
  return linhas;
}

/** Como se lê cada tipo — a legenda do §3.2.2, que é o que impede a cor de ser enfeite. */
const LEITURA = {
  SIMILAR_TO: 'afinidade semântica',
  CO_EDITED: 'afinidade de trabalho',
  REFERENCES: 'dependência documental',
  IMPORTS: 'dependência estrutural',
  TOUCHED: 'uso por agentes',
};

const forcaDe = (v) => (v.tipo === 'CO_EDITED' ? `${v.valor}×` : v.valor.toFixed(2));

/**
 * O que a rede desenhou, o que ela CORTOU, e quando mediu.
 *
 * ⚠️ Sem a contagem cortada, um corpo de 113 vínculos mostra 28 e a tela afirma que são todos —
 * truncamento silencioso lê como "isto é tudo o que existe". O teto está no snapshot e a legenda
 * sai do mesmo lugar que o desenho, então as duas nunca discordam.
 */
function legenda(rede) {
  if (!rede?.total) return [];
  const linhas = [];
  const total = Object.values(rede.total).reduce((a, b) => a + b, 0);
  for (const [tipo, n] of Object.entries(rede.total).sort()) {
    const linha = el('div', 'vital');
    linha.append(el('span', 'vital-label', LEITURA[tipo] || tipo), el('strong', 'vital-value', String(n)));
    linha.dataset.vinculo = tipo;
    linhas.push(linha);
  }
  if (total > (rede.desenhados ?? 0)) {
    linhas.push(el('div', 'widget-hint', `${total - rede.desenhados} não desenhados — o teto é ${rede.teto ?? '?'} arcos`));
  }
  if (rede.recusados) {
    // Vizinho que não é corpo desta cena. Some do desenho por não ter onde aterrissar, e some
    // dito — descartar em silêncio faria a soma da legenda não fechar sem explicação.
    linhas.push(el('div', 'widget-hint', `${rede.recusados} vizinho(s) fora desta cena`));
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
