/**
 * A moldura: identidade, relógio, estado dos serviços e os medidores de consumo.
 *
 * Regra do briefing que vale repetir aqui porque é o que define a estética: **nada de
 * cards**. Só rótulo minúsculo, valor grande, linha de 1px e muito vazio. O que separa
 * seções é espaço, não borda.
 *
 * Os indicadores de serviço mostram três estados, não dois — `online`, `offline` e
 * `não configurado`. Um provedor de busca sem chave não é uma falha, e pintá-lo de vermelho
 * ensinaria o operador a ignorar vermelho.
 *
 * ## A AFERIÇÃO — de quando é o que os pontos afirmam
 *
 * Os pontos afirmam no presente (*"MEMORY está online"*), e quem os escreve é `applyHealth`.
 * Uma leitura sozinha faz a afirmação envelhecer sem que nada na tela mude: o ponto continua
 * verde sobre um serviço que caiu depois dela. **`null` ≠ `0` aplicado ao TEMPO** — *"não
 * aferi agora"* e *"aferi agora e está online"* são fatos diferentes e tinham o mesmo pixel.
 *
 * A idade da aferição é o leitor que faltava: enquanto ela for recente, o ponto vale como
 * presente; passada `AFERICAO_VENCIDA_MS`, o grupo inteiro declara `data-afericao="vencida"`
 * e para de afirmar agora. Nada é apagado — o que o sistema mediu continua na tela, com a
 * idade ao lado dizendo de quando é.
 *
 * ⚠️ **TRÊS IDADES NESTA TELA, e nenhuma é a outra.** A célula `ÍNDICE` mede há quantos DIAS
 * o corpus foi indexado; a `.aviso-age` da timeline mede há quanto tempo aconteceu o FATO de
 * um aviso de pé; esta mede há quanto tempo o cliente OLHOU. Unidades e rampas diferentes de
 * propósito — uma condição de pé envelhece em dias, uma leitura envelhece em segundos.
 */
import { on } from '../core/bus.js';
import { snapshot } from '../core/state.js';
import { el, set, clock, money } from './dom.js';

const REFRESH_MS = 1000;

/**
 * O período da aferição, e ele é TRANSCRITO de `server/ambient.py` (`SCAN_SECONDS`).
 *
 * O vigia do servidor declara de quanto em quanto tempo o sistema olha para si mesmo. Um
 * cliente que aferisse mais fino afirmaria um frescor que não existe em lugar nenhum do
 * sistema; mais grosso, seria ele o atrasado. Um número escolhido aqui seria um segundo dono
 * do mesmo ritmo — e dois ritmos divergem na primeira vez que um deles muda.
 *
 * ⚠️ Transcrição é cópia: mudou lá, muda aqui. `scripts/lei-afericao.mjs` compara os dois e
 * reprova a divergência.
 */
export const AFERICAO_MS = 30_000;

/*
 * Quando a leitura deixa de valer como presente. DERIVADO do período, nunca escolhido: são
 * duas aferições perdidas — uma pode ser atraso, duas são ausência. Um limiar independente
 * expiraria sozinho no dia em que o período mudasse.
 */
const AFERICAO_VENCIDA_MS = 3 * AFERICAO_MS;

export function createFrame(root) {
  const time = root.querySelector('[data-clock-time]');
  const seconds = root.querySelector('[data-clock-seconds]');
  const date = root.querySelector('[data-clock-date]');
  const stateLabel = root.querySelector('[data-state-label]');
  const stateDot = root.querySelector('[data-state-dot]');
  const services = root.querySelector('[data-services]');
  const headstat = root.querySelector('[data-headstat]');
  const context = root.querySelector('[data-context]');
  const vitals = root.querySelector('[data-vitals]');

  const indicators = new Map();
  const meters = new Map();
  // Último /api/health recebido: o tique de 1s redesenha o cabeçalho com ele sem refazer a
  // chamada. Declarado aqui porque o `setInterval` abaixo o lê.
  let lastHealth = null;
  // Instante da última aferição BEM-SUCEDIDA. `null` é "nunca aferi", e não se desenha como
  // idade zero: a tela nasceria afirmando uma leitura que não houve.
  let aferidoEm = null;

  /*
   * Os subsistemas são PONTOS, e o nome vem no hover.
   *
   * Eles são o batimento do sistema — a única coisa na tela que diz "isto está vivo agora", e
   * por isso ficam no topo-centro, que é para onde o olho volta. Mas cinco rótulos em caixa
   * alta ocupavam a faixa inteira com texto que não muda: CORE continua CORE. O que muda é a
   * COR do ponto, e é só isso que precisa de pixel permanente.
   *
   * O rótulo não sumiu, mudou de gatilho: `title` para o mouse, `aria-label` para quem não
   * usa mouse. Um quarto da tinta, a mesma informação — e a faixa liberada passa a mostrar o
   * CONTEXTO, que é o que de fato muda a cada gesto.
   */
  function service(id, label, fonte) {
    const node = el('span', 'svc');
    node.title = label;
    node.setAttribute('aria-label', label);
    const dot = el('i', 'dot');
    // A FONTE viaja no pixel porque é ela que decide se o vencimento da aferição alcança este ponto.
    dot.dataset.fonte = fonte;
    node.append(dot);
    services.append(node);
    indicators.set(id, { node, dot, fonte });
  }

  /*
   * ☠️ **A IDADE DA AFERIÇÃO DESCREVE TRÊS PONTOS, e emprestá-la aos cinco erra nos DOIS sentidos.**
   *
   * `applyHealth` carimba `aferidoEm` e marca `brain`, `qdrant` e `ollama`. Os outros dois nunca
   * passaram por ali:
   *
   * - `stream` sai do store LOCAL, reescrito a cada tique — apagá-lo como vencido é apagar um fato
   *   que acabou de ser escrito, no mesmo tique em que foi escrito;
   * - `graph` sai da CARGA da topologia, e "carregou com N corpos" não expira como "responde
   *   agora" expira. Emprestar-lhe a idade de uma aferição fresca o faz afirmar presente sobre uma
   *   leitura que ninguém refez.
   *
   * ⭑ É `null` ≠ `0` por ponto: a idade qualifica a leitura que a produziu, e só ela. Quem decide
   * quanto do vencimento alcança cada ponto é o CSS, por `[data-fonte]`.
   */
  const FONTE = Object.freeze({
    /** `/api/health`, e a idade de `pintarAfericao` é exatamente a deles. */
    AFERICAO: 'afericao',
    /** o store desta aba, reescrito no tique — não há o que vencer. */
    LOCAL: 'local',
    /** a carga da topologia; verdade desde o `applyGraph`, e não uma afirmação sobre agora. */
    CARGA: 'carga',
  });

  for (const [id, label, fonte] of [
    ['brain', 'CORE', FONTE.AFERICAO],
    ['qdrant', 'MEMORY', FONTE.AFERICAO],
    ['ollama', 'LOCAL', FONTE.AFERICAO],
    ['graph', 'GRAPH', FONTE.CARGA],
    ['stream', 'LINK', FONTE.LOCAL],
  ]) {
    service(id, label, fonte);
  }

  /*
   * A idade da aferição mora COLADA nos pontos, e não numa célula própria do `.headstat`.
   *
   * O que ela qualifica são exatamente eles: sozinha, a idade não diz nada; ao lado da coisa
   * que afirma no presente, ela é a diferença entre *"está vivo"* e *"estava vivo quando eu
   * olhei"*. Um valor solto do outro lado do cabeçalho vira mais um número para reconciliar.
   */
  const afericao = el('span', 'svc-afericao', '—');
  afericao.title = 'ÚLTIMA AFERIÇÃO DOS SUBSISTEMAS';
  services.append(afericao);

  /**
   * A idade da LEITURA, na escala em que uma leitura envelhece.
   *
   * Grossa de propósito, como a das outras idades desta tela: o que decide se o ponto ainda
   * vale é a ordem de grandeza, não o segundo. Ela anda no tique de 1 s que já existia — nenhum
   * temporizador novo — e `set()` só escreve quando o texto muda, então quase todo tique é uma
   * comparação e nenhum layout.
   */
  function pintarAfericao() {
    if (aferidoEm === null) {
      set(afericao, '—');
      delete afericao.dataset.tone;
      delete services.dataset.afericao;
      return;
    }
    /*
     * Sem piso em zero, e é medido: relógio que anda para trás dá idade negativa, e negativo cai
     * no primeiro degrau (`< 1000` → AGORA) por construção. Um `max(0, …)` aqui seria guarda que
     * não guarda nada — passa verde em qualquer mutação, que é a definição de teste inútil. O que
     * PRECISA ser verdade é que idade negativa não vire `HÁ 5S` (um `abs` faria isso), e é essa a
     * lei do oráculo.
     */
    const idade = Date.now() - aferidoEm;
    set(
      afericao,
      idade < 1000 ? 'AGORA'
        : idade < 60_000 ? `HÁ ${Math.floor(idade / 1000)}S`
          : `HÁ ${Math.floor(idade / 60_000)}MIN`
    );
    if (idade >= AFERICAO_VENCIDA_MS) {
      afericao.dataset.tone = 'bad';
      services.dataset.afericao = 'vencida';
    } else {
      delete afericao.dataset.tone;
      delete services.dataset.afericao;
    }
  }

  function meter(id, label, unit = '') {
    const row = el('div', 'vital');
    const value = el('strong', 'vital-value', '—');
    row.append(el('span', 'vital-label', label), value, el('span', 'vital-unit', unit));
    vitals.append(row);
    meters.set(id, value);
  }

  meter('cost', 'CUSTO DA SESSÃO');
  meter('turns', 'TURNOS');
  meter('cog', 'CARGA COGNITIVA', 'tk');
  meter('window', 'JANELA 5H');
  meter('corpus', 'CORPUS', 'arq');

  /*
   * Estado residente do cabeçalho.
   *
   * Cada célula responde uma pergunta que o operador tem em QUALQUER app, e nenhuma delas é
   * repetição de widget: os vitais só existem na vista de sistema, e a idade do índice não
   * existia em lugar nenhum.
   *
   * A idade tem tom: verde hoje, amarelo a partir de 3 dias, vermelho a partir de 7. É o único
   * jeito de uma métrica que decai devagar ser notada — número cinza envelhece sem ninguém ver.
   */
  const cells = new Map();

  function headCell(id, label) {
    const value = el('strong', 'hs-value', '—');
    headstat.append(el('span', 'hs-label', label), value);
    cells.set(id, value);
  }

  headCell('cost', 'CUSTO');
  headCell('window', 'JANELA');
  // CHUNKS, não CORPUS. As duas células diziam CORPUS e mostravam números DIFERENTES na mesma
  // tela: aqui os chunks do Qdrant (3.554), no medidor lateral os nós do céu (459). Dois
  // números com o mesmo rótulo ensinam o operador a não confiar em nenhum dos dois.
  headCell('corpus', 'CHUNKS');
  headCell('index', 'ÍNDICE');

  function tone(node, value) {
    if (value) node.dataset.tone = value;
    else delete node.dataset.tone;
  }

  function drawHead(health) {
    const store = snapshot();
    set(cells.get('cost'), money(store.cost));

    if (store.limit?.resets_at) {
      const remaining = Math.max(0, store.limit.resets_at * 1000 - Date.now());
      const hours = Math.floor(remaining / 3_600_000);
      set(cells.get('window'), `${hours}h${String(Math.floor((remaining % 3_600_000) / 60_000)).padStart(2, '0')}`);
      tone(cells.get('window'), store.limit.status === 'allowed' ? '' : 'bad');
    }

    if (!health) return;
    set(cells.get('corpus'), (health.qdrant?.points ?? 0).toLocaleString('pt-BR'));
    tone(cells.get('corpus'), health.qdrant?.online ? '' : 'bad');

    const age = health.index_age_days;
    if (age === null || age === undefined) {
      set(cells.get('index'), '?');
      tone(cells.get('index'), 'warn');
    } else {
      set(cells.get('index'), age === 0 ? 'HOJE' : `${age}d`);
      tone(cells.get('index'), age >= 7 ? 'bad' : age >= 3 ? 'warn' : 'good');
    }
  }

  function mark(id, status) {
    const indicator = indicators.get(id);
    if (indicator) indicator.dot.dataset.status = status;
  }

  on('ui.state-changed', ({ state, label }) => {
    set(stateLabel, label || state.toUpperCase());
    stateDot.dataset.state = state;
  });

  on('brain', () => mark('brain', 'on'));
  on('error', (event) => {
    if (event.service === 'stream') mark('stream', 'off');
    if (event.service === 'qdrant') mark('qdrant', 'off');
  });
  on('memory', () => mark('qdrant', 'on'));

  setInterval(() => {
    const now = clock();
    set(time, now.time);
    set(seconds, now.seconds);
    set(date, now.date);

    drawHead(lastHealth);

    const store = snapshot();
    set(meters.get('cost'), money(store.cost));
    set(meters.get('turns'), store.turns || '—');
    set(meters.get('cog'), store.cogTokens ? store.cogTokens.toLocaleString('pt-BR') : '—');

    if (store.limit?.resets_at) {
      const remaining = Math.max(0, store.limit.resets_at * 1000 - Date.now());
      const hours = Math.floor(remaining / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);
      set(meters.get('window'), `${hours}h${String(minutes).padStart(2, '0')}`);
    }
    mark('stream', store.streaming ? 'busy' : 'on');
    pintarAfericao();
  }, REFRESH_MS);

  /*
   * O CONTEXTO se escreve sozinho, pelo barramento — não por quem o provoca.
   *
   * `ui.node-focus` já era emitido por `scene.focusNode` e não tinha nenhum assinante além do
   * log; `ui.open-file` já é o caminho único do leitor central. Assinar os dois aqui é ligar
   * informação que o sistema JÁ publica a um lugar onde ela é útil — nenhum emissor novo, e
   * nenhuma chance de a faixa discordar do que está travado, porque ela lê o mesmo evento que
   * trava.
   *
   * Só o último trecho do caminho: a faixa é do topo-centro e o caminho inteiro empurraria o
   * relógio. O caminho completo está no `title`.
   */
  const shortTail = (path) => (path || '').split('/').slice(-2).join('/');

  function showContext(rotulo, valor, completo) {
    if (!context) return;
    if (!valor) {
      context.hidden = true;
      context.replaceChildren();
      return;
    }
    context.hidden = false;
    context.title = completo || valor;
    context.replaceChildren(el('i', null, rotulo), el('b', null, valor));
  }

  let travado = null;
  let aberto = null;
  const paintContext = () => {
    if (travado) showContext('TRAVADO', shortTail(travado), travado);
    else if (aberto) showContext('ABERTO', shortTail(aberto), aberto);
    else showContext('', null);
  };

  on('ui.node-focus', ({ source }) => {
    travado = source || null;
    paintContext();
  });
  on('ui.open-file', ({ source }) => {
    aberto = source || null;
    paintContext();
  });

  return {
    /**
     * Estado real dos serviços, vindo de `/api/health`.
     *
     * ☠️ **Só quem AFERIU chama isto.** Uma aferição que falhou não tem estado a entregar, e
     * chamar com o `health` velho carimbaria uma leitura que não aconteceu — a idade voltaria a
     * zero e a tela afirmaria no presente sobre um servidor que não respondeu.
     */
    applyHealth(health) {
      lastHealth = health;
      aferidoEm = Date.now();
      drawHead(health);
      mark('brain', health.claude_cli || health.brain === 'ollama' ? 'on' : 'off');
      mark('qdrant', health.qdrant?.online ? 'on' : 'off');
      mark('ollama', health.ollama?.online ? 'on' : 'off');
      pintarAfericao();
      /*
       * O medidor CORPUS não recebe mais os chunks.
       *
       * Ele é declarado com a unidade `arq` (arquivos) e era escrito aqui com
       * `qdrant.points` — chunks — e logo depois SOBRESCRITO por `applyGraph` com a contagem de
       * nós. Na prática ficava certo por acidente, na ordem do boot; e ficava errado por alguns
       * segundos, exibindo 3.554 sob o rótulo "arq". Quem tem chunk é a célula do cabeçalho.
       */
    },

    applyGraph(count) {
      mark('graph', count > 0 ? 'on' : 'off');
      set(meters.get('corpus'), `${count}`);
    },
  };
}
