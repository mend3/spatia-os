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
 *
 * ## A SEGUNDA pergunta: "esta tecla está pressionada AGORA?"
 *
 * `keydown` responde *aconteceu um gesto*, e isso basta para um atalho, que é instantâneo. Não
 * basta para movimento contínuo (voo, pan sustentado), que precisa do ESTADO da tecla a cada
 * quadro. Auto-repeat não substitui: ele chega na taxa do sistema operacional, com meio segundo
 * de espera antes da primeira repetição, e um movimento montado sobre ele anda aos solavancos.
 *
 * ☠️ **Estado de tecla exige `blur`, não só `keyup`.** O `keyup` da tecla que estava no dedo
 * quando a janela perdeu o foco acontece FORA da página, e ninguém o vê: a tecla fica pressionada
 * para sempre, e quem voltar à aba encontra a nave voando sozinha. O ⌘ do macOS produz o mesmo
 * efeito sem trocar de janela — enquanto ele está pressionado o navegador **não entrega o `keyup`
 * das outras teclas**.
 *
 * A invariante é uma só: **nenhuma tecla sobrevive a perder o foco.** Declarar não a implementa —
 * `scripts/lei-teclado.mjs` a prova por simulação de eventos, e sai 0.
 */

const bindings = [];

/**
 * O fato físico: os `event.code` que estão para baixo agora.
 *
 * Guardado mesmo durante digitação, porque ele descreve o TECLADO e não a autorização — quem
 * decide se aquilo vale como comando é o `isHeld`, e ter os dois separados é o que permite
 * distinguir "ninguém está segurando nada" de "está segurando, mas o foco está num campo".
 */
const held = new Set();

/*
 * Como uma tecla vira TEXTO — e por que isso não pode ser escrito à mão.
 *
 * Os rótulos eram `'⌘G AFINAR'`, `'P PERMISSÕES'`, `'TAB CINEMA'`: a tecla escrita dentro da
 * string. Trocar a tecla no `bind` não trocava o texto, e a barra de dicas passou meses
 * anunciando `G` depois de o atalho ter virado ⌘G. O `label` agora é só a AÇÃO; a tecla é
 * DERIVADA do próprio spec, então não existe mais um segundo lugar para envelhecer.
 */
const KEY_NAMES = {
  Escape: 'ESC', Tab: 'TAB', Home: 'HOME', Backquote: '`', Space: 'ESPAÇO', Enter: '⏎',
};

/** O texto da tecla, a partir do spec que a registra. */
export function render(spec) {
  if (spec.keys) return spec.keys; // padrões (1–4) não têm tecla única para derivar
  const base =
    KEY_NAMES[spec.code] ||
    KEY_NAMES[spec.key] ||
    (spec.code?.startsWith('Key') ? spec.code.slice(3) : null) ||
    (spec.code?.startsWith('Digit') ? spec.code.slice(5) : null) ||
    spec.key ||
    spec.code ||
    '?';
  return `${spec.meta ? '⌘' : ''}${spec.alt ? '⌥' : ''}${base}`;
}

/**
 * Assinatura da combinação. Duas iguais são conflito.
 *
 * O `matches` percorre a lista e retorna no PRIMEIRO acerto: dois componentes pedindo a mesma
 * tecla nunca deu erro — o segundo simplesmente não disparava, em silêncio, e o sintoma
 * aparecia como "o atalho parou de funcionar" longe da causa. O registro de apps já falha alto
 * em id duplicado (`kernel/registry.js`); aqui é a mesma disciplina.
 */
const signature = (spec) =>
  `${spec.meta ? 'M' : ''}${spec.alt ? 'A' : ''}:${spec.code || spec.key || spec.pattern?.source || '?'}`;

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
  reivindicar(spec);
  bindings.push({ ...spec, handler });
  return () => {
    const index = bindings.findIndex((entry) => entry.handler === handler);
    if (index >= 0) bindings.splice(index, 1);
  };
}

/** Recusa alta a combinação já tomada. Vale igual para quem despacha aqui e para quem reserva. */
function reivindicar(spec) {
  const taken = bindings.find((entry) => signature(entry) === signature(spec));
  if (taken) {
    throw new Error(
      `atalho duplicado: ${render(spec)} já está em "${taken.label || taken.action || 'sem rótulo'}"`
    );
  }
}

/**
 * Declara uma tecla cujo DONO despacha por conta própria.
 *
 * A guarda de duplicidade e o `list()` só enxergam o que passa por `bind`. Um `keydown` cru
 * registrado por um componente ficava fora dos dois: o atalho existia na tela e não existia no
 * catálogo — a barra de dicas não o anunciava, e o próximo `bind` na mesma tecla era aceito para
 * depois nunca disparar. Reservar põe a tecla no catálogo **sem mover o despacho**.
 *
 * ⚠️ Reserva é DECLARAÇÃO, e declaração expira calada. Ela só é legítima **ao lado do listener que
 * despacha**, no mesmo arquivo e à vista; longe dele, vira afirmação sobre código que ninguém lê
 * junto — e o catálogo passa a mentir com a mesma cara de verdade.
 *
 * @param {object} spec o mesmo spec de `bind`, sem handler
 */
export function reserve(spec) {
  reivindicar(spec);
  const entry = { ...spec, reserved: true };
  bindings.push(entry);
  return () => {
    const index = bindings.indexOf(entry);
    if (index >= 0) bindings.splice(index, 1);
  };
}

/**
 * A tecla está pressionada AGORA **e vale como comando**?
 *
 * A mesma lei do despacho vale aqui: com foco em campo de texto nada é comando, senão segurar `W`
 * para voar continuaria voando enquanto o operador escreve — que é o quinto bug do cabeçalho em
 * forma contínua. O fato físico cru continua disponível em `heldCodes()`, e é ele que serve de
 * CONTROLE desta resposta: os dois discordando é supressão por digitação, não tecla solta.
 */
export function isHeld(code) {
  return held.has(code) && !isTyping();
}

/** O fato físico cru — o teclado, sem juízo sobre foco. */
export function heldCodes() {
  return [...held];
}

/*
 * Esvaziar é a única resposta correta a "não sei mais o que está pressionado".
 *
 * Soltar tecla por tecla exigiria um `keyup` que, por construção, não vai chegar. Esvaziar erra
 * para o lado barato: no pior caso o operador pressiona de novo a tecla que já estava no dedo; o
 * outro lado é a tecla presa para sempre, e ela não tem sintoma além do movimento que não para.
 */
function soltarTudo() {
  held.clear();
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
      // Antes de qualquer guarda: o dedo está na tecla mesmo quando o gesto não vale como comando.
      if (event.code) held.add(event.code);
      const typing = isTyping(event.target) || isTyping();
      for (const spec of bindings) {
        // Reservada é do dono, e o dono já escuta: despachar aqui faria a ação acontecer duas vezes.
        if (spec.reserved) continue;
        if (!matches(spec, event)) continue;
        if (typing && !spec.whileTyping) continue;
        /*
         * Tecla mantida pressionada não reabre painel a 30Hz.
         *
         * Esta guarda existia com o CORPO VAZIO — um `if` com um comentário dentro e nada mais
         * — e ainda lia `event.allowRepeat`, que não existe: a permissão é de quem registra o
         * atalho, não do evento. Segurar `P`, `V` ou a crase alternava o painel na taxa de
         * auto-repeat do sistema. Quem precisa de repetição (segurar espaço para falar) escuta
         * o próprio evento, não este barramento.
         */
        if (event.repeat && !spec.allowRepeat) return;
        event.preventDefault();
        spec.handler(event);
        return;
      }
    },
    true
  );

  window.addEventListener(
    'keyup',
    (event) => {
      held.delete(event.code);
      /*
       * ☠️ O ⌘ engole o `keyup` das teclas combinadas com ele (macOS/Chrome). Tudo o que foi
       * pressionado enquanto ele estava embaixo ficaria preso — e o sintoma aparece depois, longe:
       * o ⌘S de gravar órbita deixando o `S` "pressionado" para sempre.
       */
      if (event.key === 'Meta') soltarTudo();
    },
    true
  );

  /*
   * As duas perdas de foco, e são DUAS porque respondem coisas diferentes — a mesma distinção que
   * `docs/armadilhas.md` §A faz para medir: `blur` é a janela indo para trás (⌘Tab, outro app), onde o
   * `keyup` acontece em quem recebeu o foco; `visibilitychange` é a aba indo para o fundo, onde o
   * motor estrangula o `rAF` e nem o quadro que leria a tecla existe.
   */
  window.addEventListener('blur', soltarTudo);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) soltarTudo();
  });
}

/**
 * Os atalhos registrados, como DADO — a fonte única de qualquer superfície que os liste.
 *
 * `alias` fica de fora: a crase é um segundo caminho para a afinação, não um segundo comando, e
 * listar os dois faria a mesma ação aparecer duas vezes com nomes de tecla diferentes.
 */
export function list() {
  return bindings
    .filter((spec) => spec.label && !spec.alias)
    .map((spec) => ({
      keys: render(spec),
      label: spec.label,
      group: spec.group || 'GERAL',
      whileTyping: Boolean(spec.whileTyping),
    }));
}

/** A barra de dicas, derivada da mesma lista. Nunca texto fixo. */
export function hints() {
  return list().map((entry) => `${entry.keys} ${entry.label}`);
}
