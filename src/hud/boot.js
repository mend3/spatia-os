/**
 * A TELA DE ENTRADA — o único degrau entre abrir a aba e estar no céu.
 *
 * Ela responde DUAS perguntas, e por isso tem dois blocos com nome:
 *
 * | bloco | pergunta | fonte |
 * |---|---|---|
 * | `CÉU` | **de que corpus é este céu, e de que tamanho ele é** | `/api/graph` (o servidor é quem lê o `.env`) |
 * | `SUBSISTEMAS` | **quem responde agora** | `/api/health` |
 *
 * ☠️ **Uma sequência falsa de `SISTEMAS OK` ensinaria o operador a não ler a tela** — recusa por
 * escrito em `docs/OS-SCREENS.md` §1.1, junto com `PRESS ANY KEY TO START`. Toda linha daqui é o
 * resultado real de uma medida, e uma que falta sai em vermelho no lugar onde ela sairia.
 *
 * ⚠️ **`null` ≠ `0`.** Subsistema não medido não pode sair como zero, e corpus **não declarado**
 * sai em vermelho e nunca em branco: carimbo ausente não é carimbo neutro.
 *
 * ## O bloco CÉU existe porque a informação já era produzida e ninguém a lia
 *
 * `TOPOLOGIA CARREGADA`, as luas que não couberam e a leitura do disco são escritas na timeline
 * **enquanto esta tela a cobre**, no único minuto em que não há como lê-las. Elas não são número
 * novo: são o mesmo fato, mostrado na hora em que dá para ler.
 *
 * ☠️ **`corpos` aqui é ARQUIVO**, a mesma grandeza de `stats.files`, de `cena().corpos` e de todo
 * censo. O retorno de `scene.loadGraph` soma corpos **+ LUAS** e sob essa palavra dá **460 num
 * corpus de 72** — ele não entra nesta tela. As luas são um fato legítimo e têm linha própria,
 * com o nome delas.
 *
 * ## O gate é sobre SOM, não sobre entrar
 *
 * Esta tela já teve um botão ENGATAR e ele foi removido — mas o problema que ele resolvia era
 * real: o browser proíbe áudio sem gesto do usuário, e sem gesto o `AudioContext` nasce
 * `suspended`. Sem botão, a saída foi armar a primeira interação qualquer como destravamento —
 * o que liga o som numa hora que ninguém pediu, por um clique que era para fazer outra coisa.
 *
 * A volta do botão **não desfaz aquela decisão**: o que se reprovava era um gate que perguntava
 * "posso entrar?", uma pergunta sem alternativa e portanto sem valor. Agora a escolha é sobre o
 * SOM, que é a única coisa aqui que o browser não deixa decidir sozinho:
 *
 * - **ATIVAR O SOM AMBIENTE** — o clique É o gesto que a política de autoplay exige, então o
 *   áudio começa de fato, e não "tenta e falha em silêncio";
 * - **IGNORAR** — entra sem som, e a escolha fica registrada (`audio.muted`) para o sistema não
 *   ligar o som pelas costas no próximo clique.
 *
 * As duas entram. Uma pergunta com duas respostas legítimas não é pedágio.
 *
 * ## Ela sai INTEIRA, de uma vez
 *
 * A tentação é dissolver o fundo antes do texto e deixar a marca legível sobre a cena viva por um
 * instante. ☠️ **Essa imagem está refutada por uso** — marca por cima do céu é uma segunda parede,
 * mesmo durando um segundo. Aqui há uma superfície só, e ela recua de uma vez.
 */
import { el, set, plural } from './dom.js';
import { button } from './button.js';
import { registrar, mostrar, sair } from '../core/tela.js';

const STEP_DELAY_MS = 90;
const CAMADA = 'boot';
const CEU = 'CÉU';
const SUBSISTEMAS = 'SUBSISTEMAS';

/** O que a timeline chama de tom e o que esta tela pinta — `good` e vazio dizem a mesma coisa. */
const TOM = { good: 'ok', warn: 'warn', bad: 'bad', '': 'ok' };

export function createBoot(root, { onEngage }) {
  /*
   * Esta tela está NA FRENTE de tudo, e quem sabe disso é ela. Sem o anúncio, "o boot ainda está
   * por cima" é um fato que só existe como classe de CSS num nó do DOM — e quem precisar dele
   * (o launcher, uma sonda) teria de perguntar ao DOM de outra camada.
   *
   * `fail()` de propósito não sai: a tela continua em cena com o diagnóstico, e o estado tem de
   * dizer a mesma coisa que os olhos.
   */
  registrar({ id: CAMADA });
  mostrar(CAMADA);
  const log = root.querySelector('[data-boot-log]');
  const status = root.querySelector('[data-boot-status]');
  let failed = false;

  const grupos = new Map();
  const linhas = new Map();

  /**
   * O bloco nasce com a primeira linha dele.
   *
   * Cabeçalho sobre nada é moldura: um `CÉU` vazio durante a espera afirmaria uma seção que
   * ainda não tem resposta, que é a mesma doença do cabeçalho cheio com a carga vazia.
   */
  function grupo(nome) {
    const existente = grupos.get(nome);
    if (existente) return existente;
    const bloco = el('section', 'boot-group');
    bloco.append(el('h2', 'boot-group-title', nome));
    const corpo = el('div', 'boot-group-lines');
    bloco.append(corpo);
    log.append(bloco);
    grupos.set(nome, corpo);
    return corpo;
  }

  /**
   * Escreve — ou REESCREVE — a resposta de um rótulo.
   *
   * A leitura do disco chega tarde e volta a cada sondagem: sem a reescrita, a mesma pergunta
   * viraria uma pilha de respostas e a mais velha ficaria no topo.
   */
  function linha(nome, rotulo, valor, tom = 'ok') {
    const chave = `${nome} / ${rotulo}`;
    const anterior = linhas.get(chave);
    if (anterior) {
      anterior.row.className = `boot-line ${tom}`;
      set(anterior.valor, valor);
      return anterior.row;
    }
    const row = el('div', `boot-line ${tom}`);
    const celula = el('span', 'boot-value', valor);
    row.append(el('span', 'boot-label', rotulo), celula);
    grupo(nome).append(row);
    linhas.set(chave, { row, valor: celula });
    return row;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    /**
     * De que céu se trata — e o CORPUS vem primeiro porque é ele que dá sentido aos números
     * abaixo dele. Um censo contra o corpus errado responde com convicção total.
     *
     * `corpos` é ARQUIVO e `luas` é lua: duas grandezas, dois nomes, nunca somadas.
     * `corpos === null` é *"não carregou"* e `motivo` diz por quê — zero corpo com cara de céu
     * vazio é exatamente a leitura que não pode acontecer aqui.
     */
    ceu({ corpos = null, luas = null, corpus = null, motivo = '' } = {}) {
      if (corpus?.collection) {
        // A raiz pelo último segmento, como o `agent_cwd` logo abaixo: o caminho inteiro rouba a
        // linha e a parte que identifica está no fim. O prefixo só entra quando existe — ele é
        // quem decide se o `source` do índice casa com o do céu.
        const partes = [corpus.collection, corpus.cwd?.split('/').filter(Boolean).pop()];
        if (corpus.prefix) partes.push(corpus.prefix);
        linha(CEU, 'CORPUS', partes.filter(Boolean).join(' · '));
      } else {
        linha(CEU, 'CORPUS', 'NÃO DECLARADO', 'bad');
      }

      if (corpos === null) {
        linha(CEU, 'TOPOLOGIA', motivo ? `indisponível — ${motivo}` : 'indisponível', 'bad');
      } else {
        linha(CEU, 'TOPOLOGIA', corpos ? plural(corpos, 'corpo') : 'VAZIA', corpos ? 'ok' : 'bad');
      }

      /*
       * Seção que não coube na janela Roche→Hill é informação perdida do céu, e quem corta avisa.
       * Sem luas medidas a linha não existe: `moonReport` ausente é "não medi", não "não há".
       */
      if (luas) {
        linha(
          CEU,
          'LUAS',
          luas.dropped
            ? `${luas.shown} em órbita · ${plural(luas.dropped, 'seção sem espaço', 'seções sem espaço')}`
            : `${luas.shown} em órbita`,
          luas.dropped ? 'warn' : 'ok'
        );
      }
    },

    /**
     * O disco, que chega depois do resto e volta a cada sondagem.
     *
     * O texto é o MESMO que a timeline recebe: duas superfícies afirmando o mesmo fato com
     * palavras diferentes é como um número passa a depender de onde se lê.
     */
    disco(texto, tom = '') {
      linha(CEU, 'DISCO', texto, TOM[tom] ?? 'ok');
    },

    /** Escreve o diagnóstico real dos subsistemas. Devolve o que faltou, para o resumo. */
    async report(health) {
      const missing = [];
      const steps = [
        ['NÚCLEO COGNITIVO', health.brain === 'claude'
          ? health.claude_cli ? `claude · ${health.agent_cwd.split('/').pop()}` : 'CLI AUSENTE'
          : `ollama · ${health.ollama?.models?.[0] ?? '—'}`,
          health.brain === 'claude' && !health.claude_cli],
        ['MEMÓRIA VETORIAL', health.qdrant?.online
          ? `${health.qdrant.points.toLocaleString('pt-BR')} chunks`
          : 'OFFLINE', !health.qdrant?.online],
        ['VETORIZADOR LOCAL', health.embed_ready ? 'onnx · cpu' : 'carregando', false],
        ['MODELO LOCAL', health.ollama?.online ? `${health.ollama.models.length} modelos` : 'offline', false],
        ...health.providers.map((provider) => [
          `SATÉLITE ${provider.label}`,
          provider.online ? 'pronto' : `requer ${provider.needs}`,
          false,
        ]),
      ];

      for (const [label, value, bad] of steps) {
        linha(SUBSISTEMAS, label, value, bad ? 'bad' : 'ok');
        if (bad) missing.push(label);
        await wait(STEP_DELAY_MS);
      }

      set(
        status,
        missing.length
          ? `${missing.length} subsistema(s) degradado(s) — o observatório opera parcial`
          : 'todos os subsistemas respondendo'
      );
      return missing;
    },

    /**
     * Oferece a escolha do som e entra na resposta. Resolve quando a tela já saiu de cena.
     *
     * `failed` trava a entrada e nem oferece a escolha: subsistema degradado ainda entra (o
     * observatório opera parcial, e é o que o resumo diz), mas falha CRÍTICA não — entrar numa
     * interface que não tem servidor atrás esconderia o erro justamente na tela feita para
     * mostrá-lo.
     */
    engage() {
      if (failed) return Promise.resolve();

      return new Promise((resolve) => {
        const actions = el('div', 'boot-actions');

        /*
         * `onEngage` NÃO pode bloquear a entrada.
         *
         * Ele liga o áudio, e áudio é opcional — entrar não é. Sem este try/catch, uma exceção
         * ali dentro mata o resto do callback e a tela de boot fica para sempre exibindo "todos
         * os subsistemas respondendo", com o diagnóstico todo verde e nenhum erro visível. Já
         * aconteceu uma vez, exatamente por causa da política de autoplay.
         *
         * Regra: nada que seja acessório ao boot pode ficar entre o diagnóstico e a interface.
         */
        const enter = async (ambient) => {
          // O primeiro clique manda. Dois cliques rápidos não podem disparar dois engates.
          actions.remove();
          set(status, ambient ? 'ativando o som ambiente…' : 'entrando em silêncio…');
          try {
            await onEngage({ ambient });
          } catch (error) {
            console.error('[boot] engate falhou; entrando sem ele', error);
          }
          root.classList.add('gone');
          // A camada de baixo reaparece sozinha; esta tela não precisa saber qual é.
          sair(CAMADA);
          // Só remove do DOM depois da transição, senão o fade não acontece.
          setTimeout(() => root.remove(), 1400);
          resolve();
        };

        const sound = button({ variant: 'select', size: 'lg' });
        sound.textContent = 'ATIVAR O SOM AMBIENTE';
        sound.addEventListener('click', () => enter(true));

        const silent = button({ variant: 'outline', size: 'lg' });
        silent.textContent = 'IGNORAR';
        silent.addEventListener('click', () => enter(false));

        actions.append(sound, silent);
        root.append(actions);
        // Foco no som: `Enter` entra com áudio sem tirar a mão do teclado, e a tecla também é
        // gesto do usuário para efeito da política de autoplay.
        sound.focus();
      });
    },

    fail(message) {
      failed = true;
      linha(SUBSISTEMAS, 'FALHA CRÍTICA', message, 'bad');
      set(status, 'não foi possível inicializar o observatório');
    },
  };
}
