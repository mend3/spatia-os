/**
 * As colunas laterais: timeline, plano, ferramentas, memória e web.
 *
 * A timeline é o perfil real da execução, não decoração. Cada linha carrega a hora e, quando
 * o evento traz `ms`, a duração medida — é assim que se vê que a recuperação custou 8ms e o
 * núcleo 10s, sem abrir o Grafana.
 *
 * Ferramenta aparece com a cor da família (`tool.kind`), a mesma do wormhole na cena. O
 * operador aprende a associação uma vez e passa a ler a cena sem ler o texto.
 *
 * ## O que acontece SOZINHO — `notice`
 *
 * A timeline conta o ciclo, que só existe porque alguém perguntou. O `notice` é o contrário: o
 * sistema mudou sem pergunta. Ele entra por aqui, e não numa superfície própria, porque a
 * pergunta *"o que o sistema fez enquanto eu não olhava"* já tem dono — este widget.
 *
 * O que ele acrescenta é VIDA, não lugar. Uma linha de timeline é um instante e rola embora; um
 * `warn`/`alert` é uma CONDIÇÃO que continua verdadeira, e some quando um `info` do mesmo tópico
 * a apaga. Por isso os avisos de pé são um bloco à parte no topo do mesmo nó (`.avisos`), e as
 * linhas passam a viver em `.timeline-rows` — o `feed` poda pelo ÚLTIMO filho, e um aviso de pé
 * como irmão das linhas seria podado pela poda da timeline.
 *
 * ⚠️ **`warn`/`alert` NÃO escrevem linha de timeline.** O `/api/system-events` repõe os avisos
 * de pé a cada assinatura, e `api.watchSystem` reconecta com backoff: uma linha por entrega
 * transformaria toda queda de rede numa repetição do mesmo aviso — que é exatamente o que ensina
 * o operador a não ler a tela. A reentrega é reconhecida pelo par (`topic`, `at`): mesmo fato,
 * zero pixel novo. Quem escreve linha é o `info`, que não tem aviso de pé para representá-lo.
 *
 * ☠️ **Uma reconexão não sabe o que foi APAGADO enquanto ela esteve fora.** A reposição só
 * carrega os de pé; um `info` emitido durante a queda não é reentregue, e o aviso correspondente
 * fica na tela envelhecendo. Fechar isso exige que a assinatura se ANUNCIE no barramento
 * (`core/api.js`), para o bloco ser reconstruído a partir da reposição em vez de acumulado.
 */
import { on } from '../core/bus.js';
import { el, set, feed, shortPath, clock } from './dom.js';
import { causaDe } from '../core/upstream.js';

const TIMELINE_LIMIT = 26;
const MEMORY_LIMIT = 8;
const WEB_LIMIT = 8;
const TOOL_LIMIT = 12;

// Só o que merece uma linha. Token e thought passam por aqui centenas de vezes e virariam
// ruído — eles têm canais próprios (o texto da resposta e a trilha de partículas).
const TIMELINE_LABELS = {
  query: () => 'PERGUNTA RECEBIDA',
  plan: (e) => `PLANO · ${e.steps?.length ?? 0} PASSOS`,
  memory: (e) => `MEMÓRIA · ${e.hits?.length ?? 0} CHUNKS`,
  /*
   * ⚠️ A LINHA DO NÚCLEO CARREGA A SESSÃO, e sem ela não havia como cruzar uma execução da tela
   * com o log do CLI — o `session_id` viajava desde sempre e morria aqui.
   *
   * Oito caracteres bastam para grepar e cabem na régua da HUD; o id inteiro, mais o modelo e o
   * diretório de trabalho, vão no `title` da linha, que é copiável. O modelo entra visível porque
   * "qual cérebro respondeu isto" é a segunda pergunta de quem está lendo a timeline.
   */
  brain: (e) => [
    'NÚCLEO ONLINE',
    e.model,
    `${e.tools ?? 0} FERRAMENTAS`,
    e.session ? e.session.slice(0, 8) : null,
  ].filter(Boolean).join(' · '),
  answer: (e) => `RESPOSTA · ${e.turns ?? 1} TURNO(S)`,
  // A causa entra aqui porque `FALHA · TTS` sozinho não diz se a chave está errada ou se o
  // serviço caiu — e o operador trata os dois de formas diferentes. Ver `core/upstream.js`.
  error: (e) => [`FALHA · ${(e.service || '').toUpperCase()}`, causaDe(e)].filter(Boolean).join(' · '),
  done: () => 'CICLO ENCERRADO',
};

/*
 * A FAMÍLIA DO FATO, como `tool.kind` é a família da ferramenta (`docs/EVENTS.md`).
 *
 * O tópico é o que dá ao aviso de pé a sua unicidade: um tópico tem no máximo UM aviso de pé, e
 * é por ele que o `info` sabe o que apagar. Tópico que o cliente não conhece cai em `other` em
 * vez de sumir — um aviso sem casa ainda tem um `action` para o operador seguir.
 */
const NOTICE_TOPICOS = {
  corpus: 'CORPUS',
  topology: 'TOPOLOGIA',
  index: 'ÍNDICE',
  graphdb: 'GRAFO',
  credential: 'CREDENCIAL',
  other: 'SISTEMA',
};

// A rampa de idade é a MESMA da célula ÍNDICE do cabeçalho (`hud/frame.js`): o operador aprende
// uma vez o que 3 dias e 7 dias significam nesta tela.
const IDADE_AMBAR_D = 3;
const IDADE_VERMELHA_D = 7;
const IDADE_MS = 1000;

/**
 * A idade do FATO, tirada do `at` do evento — nunca do instante da entrega.
 *
 * Um aviso de pé é reposto a quem assina depois com o `at` original, e é ele que impede um aviso
 * de ontem de parecer recém-nascido. A escala é grossa de propósito: o que decide o que fazer é a
 * ordem de grandeza, não o segundo.
 */
function idadeDe(at) {
  const segundos = Math.max(0, Date.now() / 1000 - (at || 0));
  const dias = Math.floor(segundos / 86_400);
  if (segundos < 60) return { texto: `HÁ ${Math.floor(segundos)}S`, dias };
  if (segundos < 3_600) return { texto: `HÁ ${Math.floor(segundos / 60)}MIN`, dias };
  if (segundos < 86_400) return { texto: `HÁ ${Math.floor(segundos / 3_600)}H`, dias };
  return { texto: `HÁ ${dias}D`, dias };
}

/** O que a linha não mostra e o hover revela. Vazio = sem `title`. */
const TIMELINE_TITLES = {
  brain: (e) => [
    e.session && `sessão ${e.session}`,
    e.model && `modelo ${e.model}`,
    e.cwd && `cwd ${e.cwd}`,
    e.mcp?.length && `mcp ${e.mcp.join(', ')}`,
  ].filter(Boolean).join('\n'),
};

export function createStreams(root, { toolColor }) {
  /*
   * Dois containers dentro do MESMO nó adotado pelo widget: os avisos de pé em cima, as linhas
   * embaixo. O `feed` remove o último filho ao passar do limite — com os dois misturados, a 27ª
   * linha apagaria um aviso de pé, e o sintoma seria um alerta sumindo sozinho sem causa.
   */
  const trilho = root.querySelector('[data-timeline]');
  const avisos = el('div', 'avisos');
  const linhas = el('div', 'timeline-rows');
  trilho.append(avisos, linhas);
  const timeline = feed(linhas, TIMELINE_LIMIT);
  const memory = feed(root.querySelector('[data-memory]'), MEMORY_LIMIT);
  const tools = feed(root.querySelector('[data-tools]'), TOOL_LIMIT);
  const web = feed(root.querySelector('[data-web]'), WEB_LIMIT);
  const plan = root.querySelector('[data-plan]');
  const openTools = new Map();

  function stamp(text, { tone = '', duration = null } = {}) {
    const row = el('div', `row ${tone}`);
    row.append(el('span', 'row-time', clock().time));
    row.append(el('span', 'row-text', text));
    if (duration !== null) row.append(el('span', 'row-meta', `${duration}ms`));
    timeline.push(row);
    return row;
  }

  on('*', (event) => {
    const label = TIMELINE_LABELS[event.t];
    if (!label) return;
    const row = stamp(label(event), {
      tone: event.t === 'error' ? 'bad' : event.t === 'answer' ? 'good' : '',
      duration: event.ms ?? null,
    });
    // O que não cabe na linha vai para o `title`: hover mostra, e dá para copiar. É o único lugar
    // onde um id de 36 caracteres pode existir sem quebrar a régua da HUD.
    const detalhe = TIMELINE_TITLES[event.t]?.(event);
    if (detalhe) row.title = detalhe;
  });

  on('state', (event) => stamp(`› ${event.label || event.state}`, { tone: 'dim' }));

  on('plan', (event) => {
    plan.replaceChildren();
    for (const step of event.steps || []) {
      const row = el('div', 'plan-step');
      row.append(el('i', 'plan-mark'), el('span', 'plan-label', step.label));
      row.append(el('span', 'plan-target', step.target || ''));
      plan.append(row);
    }
  });

  on('memory', (event) => {
    memory.clear();
    for (const hit of event.hits || []) {
      const row = el('div', 'hit');
      row.dataset.source = hit.source;
      const head = el('div', 'hit-head');
      head.append(el('span', 'hit-score', (hit.score ?? 0).toFixed(3)));
      head.append(el('span', 'hit-path', shortPath(hit.source, 46)));
      row.append(head);
      if (hit.section) row.append(el('div', 'hit-section', `§ ${hit.section}`));
      row.append(el('div', 'hit-text', (hit.text || '').slice(0, 150)));
      memory.push(row);
    }
  });

  on('tool', (event) => {
    if (event.phase === 'call') {
      const row = el('div', 'tool');
      const dot = el('i', 'tool-dot');
      dot.style.background = `#${toolColor(event.kind).toString(16).padStart(6, '0')}`;
      row.append(dot, el('span', 'tool-name', event.tool), el('span', 'tool-meta', '···'));
      tools.push(row);
      if (event.id) openTools.set(event.id, row);
      return;
    }

    if (event.phase === 'args') {
      const row = openTools.get(event.id);
      if (row && event.detail) {
        row.append(el('div', 'tool-detail', event.detail));
      }
      return;
    }

    const row = openTools.get(event.id);
    openTools.delete(event.id);
    if (!row) return;
    row.classList.add(event.ok === false ? 'bad' : 'done');
    set(row.querySelector('.tool-meta'), event.ms !== undefined ? `${event.ms}ms` : 'ok');
    /*
     * O QUE A FERRAMENTA DEVOLVEU, e até 2026-08-07 isto era descartado aqui.
     *
     * O servidor já mandava: `agent._tool_result` põe "6 chunks"/"1200 caracteres"/a mensagem do
     * erro, e `brain._tool_results` corta o conteúdo real do `tool_result` em `RESULT_CHARS`
     * (220) e manda no mesmo campo. O `phase: 'args'` logo acima desenhava o `detail` de ENTRADA
     * e o de SAÍDA morria — a tela dizia que a ferramenta rodou e em quantos ms, nunca o que veio.
     *
     * `→` distingue os dois na mesma linha de grade, e a saída é um tom mais clara que a entrada
     * de propósito: o retorno é a metade que informa. Em falha o texto é a mensagem do erro, e aí
     * ele vale mais ainda — era ela que sumia junto.
     */
    if (event.detail) row.append(el('div', 'tool-detail out', `→ ${event.detail}`));
    stamp(`${event.tool} · ${event.ok === false ? 'FALHOU' : 'OK'}`, {
      tone: event.ok === false ? 'bad' : 'dim',
      duration: event.ms ?? null,
    });
  });

  /*
   * OS AVISOS DE PÉ.
   *
   * `dePe` é tópico → aviso na tela, e é o mapa que faz valer o contrato do protocolo: um tópico
   * tem no máximo UM aviso de pé. Levantar o segundo aviso do mesmo tópico substitui o primeiro;
   * o `info` do mesmo tópico o apaga.
   */
  const dePe = new Map();
  let relogio = null;

  function pintarIdade(aviso) {
    const { texto, dias } = idadeDe(aviso.at);
    set(aviso.idade, texto);
    const tom = dias >= IDADE_VERMELHA_D ? 'bad' : dias >= IDADE_AMBAR_D ? 'warn' : '';
    if (tom) aviso.idade.dataset.tone = tom;
    else delete aviso.idade.dataset.tone;
  }

  /*
   * O tique existe SÓ enquanto há aviso de pé, e é o único movimento deste bloco.
   *
   * Ele não é enfeite nem repetição do aviso: o que anda é a IDADE, que é o fato de a condição
   * continuar de pé. `set()` só escreve quando o texto muda, então na escala grossa quase todo
   * tique é uma comparação e nenhum layout.
   */
  function tiquetaquear() {
    if (dePe.size && !relogio) {
      relogio = setInterval(() => dePe.forEach(pintarIdade), IDADE_MS);
    } else if (!dePe.size && relogio) {
      clearInterval(relogio);
      relogio = null;
    }
  }

  function baixar(topic) {
    dePe.get(topic)?.node.remove();
    dePe.delete(topic);
  }

  function levantar(topic, event) {
    baixar(topic);
    const node = el('div', 'aviso');
    node.dataset.severity = event.severity;
    const cabeca = el('div', 'aviso-head');
    const idade = el('span', 'aviso-age');
    cabeca.append(
      el('i', 'aviso-mark'),
      el('span', 'aviso-topic', NOTICE_TOPICOS[topic]),
      el('span', 'aviso-label', event.label),
      idade
    );
    node.append(cabeca);
    if (event.detail) node.append(el('div', 'aviso-detail', event.detail));
    // `→` é o mesmo sinal que a linha de ferramenta usa para o RETORNO: o que vem depois do fato.
    node.append(el('div', 'aviso-action', `→ ${event.action}`));
    avisos.append(node);

    const aviso = { at: event.at, node, idade };
    dePe.set(topic, aviso);
    pintarIdade(aviso);
    tiquetaquear();
  }

  on('notice', (event) => {
    /*
     * ⚠️ Nomeie o que a tela ACEITA — `Object.hasOwn`, nunca `NOTICE_TOPICOS[t]` sozinho: um
     * `topic: 'constructor'` acha a cadeia de protótipos e desenha uma função como rótulo.
     * E `warn`/`alert` sem `action` é a definição de ruído — o servidor já recusa, e a tela
     * recusa de novo em vez de desenhar `→ undefined`, que é ruído com cara de instrução.
     */
    const topic = Object.hasOwn(NOTICE_TOPICOS, event.topic) ? event.topic : 'other';
    if (!['info', 'warn', 'alert'].includes(event.severity)) {
      console.error(`[notice] severity ${event.severity} fora do catálogo — nada a desenhar`, event);
      return;
    }
    if (event.severity !== 'info' && !event.action) {
      console.error(`[notice] ${event.severity} sem action: diga o que o operador faz`, event);
      return;
    }

    if (event.severity === 'info') {
      // "Mudou, e não há o que fazer" — a tela para de afirmar o que afirmava, e a linha registra
      // o instante. Sem `action` de propósito: o protocolo recusa `info` que traga um.
      baixar(topic);
      tiquetaquear();
      stamp([NOTICE_TOPICOS[topic], event.label, event.detail].filter(Boolean).join(' · '));
      return;
    }

    // Reentrega do MESMO fato: mesmo tópico e mesmo `at`. O aviso já está na tela com a idade
    // certa, e repô-lo seria apagar e redesenhar (a animação anunciaria um aviso novo).
    if (dePe.get(topic)?.at === event.at) return;
    levantar(topic, event);
  });

  on('web', (event) => {
    if (event.phase === 'start') {
      stamp(`SATÉLITE ${event.provider.toUpperCase()} ATIVADO`, { tone: 'dim' });
      return;
    }
    if (event.phase === 'error') {
      stamp(`SATÉLITE ${event.provider.toUpperCase()} SEM RESPOSTA`, { tone: 'bad' });
      return;
    }
    for (const result of event.results || []) {
      const row = el('div', 'web-item');
      const link = el('a', 'web-title', result.title || result.url);
      link.href = result.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      row.append(el('span', 'web-provider', event.provider), link);
      row.append(el('div', 'web-snippet', result.snippet || ''));
      web.push(row);
    }
  });

  return {
    /** Provedores no boot: satélite apagado aparece como offline, não como ausente. */
    showProviders(providers) {
      web.clear();
      for (const provider of providers) {
        const row = el('div', `web-item ${provider.online ? '' : 'off'}`);
        row.append(el('span', 'web-provider', provider.label));
        row.append(
          el('span', 'web-title', provider.online ? 'pronto' : `requer ${provider.needs}`)
        );
        web.push(row);
      }
    },
    note: (text, tone) => stamp(text, { tone }),
  };
}
