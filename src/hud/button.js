/**
 * O primitivo de botão. UM.
 *
 * Antes existiam SEIS botões com CSS próprio — `.toggle`, `.perm-mode`, `.icon-btn`,
 * `.dock-item`, `.fs-row`, `.chip-drop` — e a consequência não era estética: eram seis lugares
 * onde `padding`, `letter-spacing` e a cor do estado ligado divergiam sozinhos. O painel de voz
 * já usava `.perm-mode` para um botão que não é modo de permissão nenhum, porque era o fork mais
 * parecido com o que ele precisava. É assim que um sistema perde a própria linguagem.
 *
 * A regra vem do `DESIGN.md` do hermes-agent: *"Style lives in the primitive. Variants and sizes
 * own padding, radius, color, chrome. Call sites pass a `variant`/`size`, not `className`
 * overrides that re-specify those."*
 *
 * ## Variantes (a razão de cada uma existir separada)
 *
 * | `variant` | Quando | Estado ligado |
 * |---|---|---|
 * | `outline` | interruptor INDEPENDENTE (VOZ, WEB, AFINAR) | tinta e borda acentuadas |
 * | `select` | UMA opção de um conjunto exclusivo (modo, formato, rota) | preenchimento sólido |
 * | `icon` | ação de glifo, quadrada (anexar, enviar) | borda/preenchimento acentuados |
 * | `row` | linha de lista clicável (arquivo, pasta, voz) | nome em destaque |
 * | `bare` | ação sem moldura nenhuma (descartar anexo) | — |
 *
 * `outline` e `select` não são o mesmo botão com dois enfeites. Num conjunto exclusivo, a opção
 * escolhida tem que ser inconfundível — se ela só ficasse com a tinta mais clara, "modo atual" e
 * "modo sob o cursor" leriam igual. Num interruptor independente, preencher sólido gritaria: são
 * cinco deles lado a lado no rodapé.
 *
 * ## Acento
 *
 * A cor do estado ligado vem de `--btn-accent` (âmbar por default). É o que faz a dock — onde
 * cada app tem cor própria — usar a MESMA variante `select` em vez de virar o sétimo fork.
 */
import { el } from './dom.js';

const VARIANTS = new Set(['outline', 'select', 'icon', 'row', 'bare']);
/*
 * `md` é o quadrado de GLIFO (30×26), não um tamanho de texto — pedir `md` para um rótulo longo
 * espreme a frase num botão de ícone. `lg` é o tamanho de texto grande, para o botão que é a
 * ação principal de uma tela (o gate do boot).
 */
const SIZES = new Set(['xs', 'sm', 'md', 'lg', 'row']);

/**
 * @param {object} spec
 * @param {string} [spec.variant]        uma de VARIANTS
 * @param {string} [spec.size]           uma de SIZES
 * @param {string} [spec.label]          texto; omita quando o conteúdo vem por `append`
 * @param {boolean} [spec.on]            estado ligado/selecionado
 * @param {string} [spec.title]          tooltip e rótulo acessível
 * @param {string} [spec.accent]         cor do acento (CSS color) — o default é âmbar
 * @param {string} [spec.tone]           `bad` para ação destrutiva/de parada
 * @param {string} [spec.emphasis]       `primary` para a ação que a tela está propondo
 * @param {object} [spec.data]           dataset extra: DADO (`kind`, `app`), nunca estilo
 * @param {Function} [spec.onClick]
 * @returns {HTMLButtonElement}
 */
export function button({
  variant = 'outline',
  size = 'sm',
  label,
  on = false,
  title,
  accent,
  tone,
  emphasis,
  data,
  onClick,
} = {}) {
  // Falha alto em variante inválida. Um `data-variant` que o CSS não conhece produz um botão sem
  // estilo NENHUM — invisível de tão discreto — e o sintoma não aponta para o erro de digitação.
  if (!VARIANTS.has(variant)) throw new Error(`variante de botão inválida: ${variant}`);
  if (!SIZES.has(size)) throw new Error(`tamanho de botão inválido: ${size}`);

  const node = el('button', 'btn', label);
  node.type = 'button';
  node.dataset.variant = variant;
  node.dataset.size = size;
  node.dataset.on = String(Boolean(on));
  if (tone) node.dataset.tone = tone;
  // Ênfase é ESTILO, então é parâmetro nomeado e não `data` — o `data` é para dado (`kind`,
  // `app`). A variante `icon` já lia `data-emphasis` vindo por `data`, o que contrariava a
  // regra do próprio primitivo; agora há um caminho só.
  if (emphasis) node.dataset.emphasis = emphasis;
  if (title) {
    node.title = title;
    // Botão só de glifo não tem texto para o leitor de tela ler.
    if (!label) node.setAttribute('aria-label', title);
  }
  if (accent) node.style.setProperty('--btn-accent', accent);
  for (const [key, value] of Object.entries(data || {})) node.dataset[key] = value;
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

/** Liga/desliga um botão já criado. Um caminho só para o estado, do lado do DOM. */
export function setOn(node, on) {
  const next = String(Boolean(on));
  if (node.dataset.on !== next) node.dataset.on = next;
}
