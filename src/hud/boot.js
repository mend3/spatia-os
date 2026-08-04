/**
 * Sequência de boot — diagnóstico real e o gate do som.
 *
 * As linhas do boot mostram o resultado **real** de `/api/health`. Uma sequência falsa de
 * "SISTEMAS OK" seria mais bonita e ensinaria o operador a não ler a tela.
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
 */
import { el, set } from './dom.js';
import { button } from './button.js';

const STEP_DELAY_MS = 90;

export function createBoot(root, { onEngage }) {
  const log = root.querySelector('[data-boot-log]');
  const status = root.querySelector('[data-boot-status]');
  let failed = false;

  function line(label, value, tone = '') {
    const row = el('div', `boot-line ${tone}`);
    row.append(el('span', 'boot-label', label));
    row.append(el('span', 'boot-value', value));
    log.append(row);
    return row;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    /** Escreve o diagnóstico real. Devolve o que faltou, para o resumo. */
    async report(health, graphCount) {
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
        ['TOPOLOGIA', graphCount ? `${graphCount} corpos` : 'VAZIA', !graphCount],
        ['MODELO LOCAL', health.ollama?.online ? `${health.ollama.models.length} modelos` : 'offline', false],
        ...health.providers.map((provider) => [
          `SATÉLITE ${provider.label}`,
          provider.online ? 'pronto' : `requer ${provider.needs}`,
          false,
        ]),
      ];

      for (const [label, value, bad] of steps) {
        line(label, value, bad ? 'bad' : 'ok');
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
      line('FALHA CRÍTICA', message, 'bad');
      set(status, 'não foi possível inicializar o observatório');
    },
  };
}
