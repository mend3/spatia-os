/**
 * Sequência de boot — diagnóstico real e entrada automática.
 *
 * As linhas do boot mostram o resultado **real** de `/api/health`. Uma sequência falsa de
 * "SISTEMAS OK" seria mais bonita e ensinaria o operador a não ler a tela.
 *
 * Havia um botão ENGATAR aqui, e ele existia por um motivo técnico: o browser proíbe áudio sem
 * gesto do usuário, e o clique era o gesto. Ele saiu por pedido — a tela entra sozinha quando
 * o diagnóstico termina.
 *
 * A consequência NÃO desapareceu junto com o botão: sem gesto, o `AudioContext` nasce
 * `suspended` e o som ambiente não pode começar. Quem trata isso é o `main.js`, armando a
 * primeira interação real como destravamento e dizendo na tela que o áudio está aguardando.
 * Fingir que o áudio ligou seria o pior dos três caminhos.
 */
import { el, set } from './dom.js';

const STEP_DELAY_MS = 90;

/*
 * Pausa entre o fim do diagnóstico e a entrada.
 *
 * Não é enfeite: o boot é a única tela que mostra o estado de cada subsistema, e entrar no
 * mesmo quadro em que a última linha aparece torna o diagnóstico ilegível. Tempo de ler o
 * resumo, não mais que isso.
 */
const AUTO_ENTER_MS = 900;

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
     * Entra sozinho. Resolve quando a tela de boot já saiu de cena.
     *
     * `failed` trava a entrada: subsistema degradado ainda entra (o observatório opera parcial,
     * e é o que o resumo diz), mas falha CRÍTICA não — entrar numa interface que não tem
     * servidor atrás esconderia o erro justamente na tela feita para mostrá-lo.
     */
    engage() {
      if (failed) return Promise.resolve();
      return new Promise((resolve) => {
        setTimeout(async () => {
          /*
           * `onEngage` NÃO pode bloquear a entrada.
           *
           * Ele liga o áudio, e áudio é opcional — entrar não é. Sem este try/catch, uma exceção
           * ali dentro matava o resto do callback: a tela de boot ficava para sempre exibindo
           * "todos os subsistemas respondendo", com o diagnóstico todo verde e nenhum erro na
           * tela. Foi o que aconteceu ao remover o botão ENGATAR — a aba recém-carregada não tem
           * gesto do usuário, e é exatamente aí que a política de autoplay faz `enable()` falhar.
           *
           * Regra: nada que seja acessório ao boot pode ficar entre o diagnóstico e a interface.
           */
          try {
            await onEngage();
          } catch (error) {
            console.error('[boot] engate falhou; entrando sem ele', error);
          }
          root.classList.add('gone');
          // Só remove do DOM depois da transição, senão o fade não acontece.
          setTimeout(() => root.remove(), 1400);
          resolve();
        }, AUTO_ENTER_MS);
      });
    },

    fail(message) {
      failed = true;
      line('FALHA CRÍTICA', message, 'bad');
      set(status, 'não foi possível inicializar o observatório');
    },
  };
}
