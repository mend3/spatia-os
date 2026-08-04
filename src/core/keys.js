/**
 * Atalhos globais — com UMA regra sobre quando eles não valem.
 *
 * O problema que este módulo existe para matar: cada painel registrava seu próprio
 * `window.addEventListener('keydown')` com sua própria guarda, e nenhuma cobria todos os
 * casos. O resultado media assim:
 *
 * - digitar `p` na busca de arquivos abria o painel de permissões;
 * - digitar `v` na bancada de voz abria o painel de voz;
 * - digitar `1` na busca navegava para o primeiro app;
 * - crase abria a afinação em qualquer campo;
 * - espaço no prompt VAZIO ligava o microfone em vez de digitar um espaço.
 *
 * Cinco bugs, uma causa: a guarda era decidida por quem registra o atalho, e quem registra não
 * sabe onde o foco está. A regra certa é do sistema, não do painel — **atalho global não
 * dispara enquanto há entrada de texto com foco**, e ponto.
 *
 * `capture: true` de propósito: a supressão precisa acontecer antes de qualquer handler de
 * borbulhamento, senão um atalho já teria rodado quando a checagem chegasse.
 */

const bindings = [];

/** O foco está num lugar onde teclas são texto, não comando? */
export function isTyping(target = document.activeElement) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  // `range`, `checkbox` e `button` são controles, não campos de texto: setas e espaço neles
  // são interação legítima, mas não impedem um atalho global de existir.
  return !['range', 'checkbox', 'radio', 'button', 'submit', 'color'].includes(target.type);
}

/**
 * Registra um atalho.
 *
 * @param {object} spec
 * @param {string} [spec.code]        `event.code` (layout-independente) — preferir este
 * @param {string} [spec.key]         `event.key`, quando o caractere é o que importa
 * @param {RegExp} [spec.pattern]     testa `event.key` (ex.: dígitos)
 * @param {boolean} [spec.meta]       exige ⌘/Ctrl
 * @param {boolean} [spec.alt]        exige Alt
 * @param {boolean} [spec.whileTyping] dispara MESMO com foco em texto (só Escape e afins)
 * @param {string} spec.label         o que a barra de dicas mostra
 * @param {Function} handler
 */
export function bind(spec, handler) {
  bindings.push({ ...spec, handler });
  return () => {
    const index = bindings.findIndex((entry) => entry.handler === handler);
    if (index >= 0) bindings.splice(index, 1);
  };
}

function matches(spec, event) {
  if (spec.meta && !(event.metaKey || event.ctrlKey)) return false;
  if (!spec.meta && (event.metaKey || event.ctrlKey)) return false;
  if (spec.alt && !event.altKey) return false;
  if (!spec.alt && event.altKey) return false;
  if (spec.code) return event.code === spec.code;
  if (spec.key) return event.key === spec.key;
  if (spec.pattern) return spec.pattern.test(event.key);
  return false;
}

export function install() {
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat && !event.allowRepeat) {
        // Tecla mantida pressionada não deve reabrir painel a 30Hz. Quem precisa de repetição
        // (segurar espaço para falar) escuta o próprio evento, não este barramento.
      }
      const typing = isTyping(event.target) || isTyping();
      for (const spec of bindings) {
        if (!matches(spec, event)) continue;
        if (typing && !spec.whileTyping) continue;
        event.preventDefault();
        spec.handler(event);
        return;
      }
    },
    true
  );
}

/** A barra de dicas se monta a partir dos atalhos registrados, não de texto fixo. */
export function hints() {
  return bindings.filter((spec) => spec.label).map((spec) => spec.label);
}
