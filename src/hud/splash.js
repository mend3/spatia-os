/**
 * A camada de CHEGADA: **em que céu o operador acabou de entrar**, dito uma vez, sobre o céu.
 *
 * ## Por que ela existe, e por que não é a tela de boot outra vez
 *
 * O `#boot` responde *"os subsistemas respondem?"* com diagnóstico REAL e uma pergunta de duas
 * respostas legítimas (o som). Esta responde outra, que hoje não tem dono: **QUAL céu é este.**
 * A resposta já era produzida — `TOPOLOGIA CARREGADA · N CORPOS` sai na timeline — e era escrita
 * atrás de uma tela opaca, no único minuto em que ninguém pode lê-la. A splash não inventa
 * número: ela mostra, no instante em que dá para ler, o que já estava sendo afirmado.
 *
 * ⭑ E acrescenta o fato que mais custou a esta base: **de qual corpus veio esse céu.** Coleção,
 * raiz e prefixo saem de `/api/graph` — do servidor, que é quem lê o `.env`. Um censo contra o
 * corpus errado responde com convicção total sobre um céu que ninguém está vendo; a hora de
 * conferir isso é a hora em que não há mais nada na tela para disputar a atenção.
 * ⚠️ Corpus **não declarado** sai em vermelho, nunca em branco: carimbo ausente não é neutro.
 *
 * ## Ela não anima nada, e isso é a decisão
 *
 * *"Toda animação representa informação, atividade ou transformação real"* — e esta camada não
 * tem transformação própria para representar. O que se move atrás do vidro é a CENA, que já
 * estava desenhando antes de a splash existir e continua depois: nenhum passe novo, nenhum
 * quadro a mais, e o orçamento desta cena está todo no pós-processamento. **Fundo cinematográfico
 * aqui é o universo real, não um desenho dele.**
 * Nem fundo ela tem: a legibilidade sobre um disco de acreção claro sai da mesma sombra de 1px
 * que sustenta a HUD inteira (`index.html`, `#hud { text-shadow }`), que custa zero layout.
 *
 * ## Ela NÃO é um pedágio
 *
 * `pointer-events: none`, nenhum `preventDefault`, nenhum `stopPropagation`: o gesto que a
 * dissolve **atravessa** e faz o que ia fazer — girar a câmera, focar o prompt. Ela recua porque
 * o operador chegou, não porque ele pediu licença. É a diferença entre uma legenda e um
 * "PRESS ANY KEY TO START", que é uma pergunta de resposta única e está recusada por escrito.
 *
 * ⭑ **Ela nunca nomeia a camada que está por cima.** Arma-se quando a `tela` diz que ela é a da
 * frente e desarma-se quando não é — a palavra "boot" não aparece neste arquivo. É a pilha
 * fazendo o trabalho que o `if` fazia.
 */
import { el } from './dom.js';
import { on, off } from '../core/bus.js';
import { registrar, mostrar, sair, estado } from '../core/tela.js';

const CAMADA = 'splash';
/** Casa com a transição de `#splash` no `index.html`. */
const SAIDA_MS = 900;

/*
 * Os três caminhos de ENTRADA, e são os mesmos que o destravamento de áudio já reconhece:
 * ponteiro, teclado e roda. Um quarto caminho de entrada que aparecesse teria de entrar nas duas
 * listas, e é por isso que elas dizem a mesma coisa.
 */
const GESTOS = ['pointerdown', 'keydown', 'wheel'];

export function createSplash(root) {
  registrar({ id: CAMADA });
  mostrar(CAMADA);

  const log = root.querySelector('[data-splash-log]');
  let armado = false;
  let saiu = false;

  function linha(rotulo, valor, tom = '') {
    const row = el('div', `splash-line ${tom}`);
    row.append(el('span', 'splash-label', rotulo));
    row.append(el('span', 'splash-value', valor));
    return row;
  }

  function encerrar() {
    if (saiu) return;
    saiu = true;
    desarmar();
    off('ui.tela', seguirAPilha);
    root.classList.add('gone');
    // A camada de baixo reaparece sozinha; esta tela não precisa saber qual é.
    sair(CAMADA);
    // Só sai do DOM depois da transição, senão não há transição.
    setTimeout(() => root.remove(), SAIDA_MS + 200);
  }

  /*
   * ⚠️ `repeat` fica de fora, e não é detalhe: a tecla que entrou no boot pode continuar embaixo
   * do dedo quando esta camada assume, e a repetição do teclado dissolveria a splash com um
   * gesto que já foi gasto em outra tela. Só o toque NOVO conta.
   */
  const gesto = (event) => {
    if (event.repeat) return;
    encerrar();
  };

  function armar() {
    if (armado || saiu) return;
    armado = true;
    for (const nome of GESTOS) window.addEventListener(nome, gesto, { capture: true, passive: true });
  }

  function desarmar() {
    if (!armado) return;
    armado = false;
    for (const nome of GESTOS) window.removeEventListener(nome, gesto, { capture: true });
  }

  /** Armado ⟺ é a camada da frente. Quem decide isso é a pilha, e ela não precisa ser nomeada. */
  function seguirAPilha({ tela }) {
    if (tela.camada === CAMADA) armar();
    else desarmar();
  }

  on('ui.tela', seguirAPilha);
  if (estado().camada === CAMADA) armar();

  return {
    /**
     * O céu e a procedência dele, os dois do MESMO carregamento.
     *
     * `ceu` é a contagem que `scene.loadGraph` devolveu — a mesma que a nota da timeline publica.
     * `null` é *"não carregou"*, e `motivo` diz por quê: zero corpo com cara de céu vazio é
     * exatamente a leitura que não pode acontecer aqui.
     */
    anunciar({ ceu = null, corpus = null, motivo = '' } = {}) {
      const linhas = [
        ceu === null
          ? linha('CÉU', motivo ? `indisponível — ${motivo}` : 'indisponível', 'bad')
          : linha('CÉU', `${ceu.toLocaleString('pt-BR')} corpos`),
      ];

      if (corpus?.collection) {
        // A raiz pelo último segmento, como o boot já faz com o `agent_cwd`: o caminho inteiro
        // rouba a linha e a parte que identifica está no fim.
        const partes = [corpus.collection, corpus.cwd?.split('/').filter(Boolean).pop()];
        // Prefixo VAZIO é escolha declarada e não vira linha; prefixo presente vira, porque é
        // ele que decide se o `source` do índice casa com o do céu.
        if (corpus.prefix) partes.push(corpus.prefix);
        linhas.push(linha('CORPUS', partes.filter(Boolean).join(' · ')));
      } else {
        linhas.push(linha('CORPUS', 'não declarado', 'bad'));
      }

      log.replaceChildren(...linhas);
    },
  };
}
