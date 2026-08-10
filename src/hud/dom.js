/**
 * Utilitários de DOM para a HUD.
 *
 * A HUD é feita de texto e linhas finas, sem componente e sem framework — o custo de um
 * runtime de UI aqui seria pago em orçamento de quadro, e é o canvas que precisa dele.
 *
 * `set()` só escreve quando o valor muda: a HUD atualiza a cada token e reescrever
 * `textContent` idêntico força layout à toa, dezenas de vezes por segundo.
 */

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function set(node, value) {
  const next = String(value ?? '');
  if (node.textContent !== next) node.textContent = next;
}

/** Mantém uma lista limitada, reciclando os nós já existentes em vez de recriar tudo. */
export function feed(container, limit) {
  return {
    push(node) {
      container.prepend(node);
      while (container.children.length > limit) container.lastElementChild.remove();
    },
    clear() {
      container.replaceChildren();
    },
  };
}

export function clock() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return {
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    seconds: pad(now.getSeconds()),
    date: now
      .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
      .toUpperCase()
      .replace('.', ''),
  };
}

/** Caminho longo encurtado pelo fim, que é a parte informativa de um path. */
export function shortPath(source, max = 42) {
  if (!source) return '';
  if (source.length <= max) return source;
  return `…${source.slice(-(max - 1))}`;
}

export function money(value) {
  return `$${(value || 0).toFixed(4)}`;
}

/**
 * Contagem grande em forma curta — `9,1k` em vez de `9.148`.
 *
 * A HUD é hairline e monoespaçada: uma linha de metadados com três contagens de milhares vira
 * uma régua de dígitos que ninguém lê. Abaixo de mil o número sai inteiro, porque aí a precisão
 * cabe e informa. Vírgula decimal porque o resto da tela já é `pt-BR` (`toLocaleString`).
 */
export function compact(value) {
  const n = value || 0;
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
}

/**
 * Plural sem `(s)` colado no fim.
 *
 * `${n} chunk(s)` e `${n} ARQUIVO(S)` são o único ponto do cliente que TRAVA uma tradução
 * futura: plural não é sufixo em quase nenhuma língua, e um catálogo de strings não resolve
 * uma frase montada por concatenação. Isto é o passo barato que não se desfaz — e, de quebra,
 * o português fica melhor hoje: "1 chunk" em vez de "1 chunk(s)".
 *
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]  o default é `singular + 's'`, que cobre o caso regular
 */
export function plural(count, singular, plural) {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
