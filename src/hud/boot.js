/**
 * Sequência de boot — e o gesto que autoriza o áudio.
 *
 * O browser proíbe áudio sem interação do usuário. Em vez de esconder isso num botão de
 * mudo, o requisito virou a primeira cena: uma tela de engate com checagem de subsistemas.
 * O clique obrigatório passa a fazer parte da experiência em vez de brigar com ela.
 *
 * As linhas do boot mostram o resultado **real** de `/api/health`. Uma sequência falsa de
 * "SISTEMAS OK" seria mais bonita e ensinaria o operador a não ler a tela.
 */
import { el, set } from './dom.js';

const STEP_DELAY_MS = 90;

export function createBoot(root, { onEngage }) {
  const log = root.querySelector('[data-boot-log]');
  const button = root.querySelector('[data-boot-engage]');
  const status = root.querySelector('[data-boot-status]');

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
      button.disabled = false;
      button.textContent = 'ENGATAR';
      return missing;
    },

    /** Resolve quando o usuário engata — é dentro deste gesto que o áudio pode iniciar. */
    engage() {
      return new Promise((resolve) => {
        button.addEventListener(
          'click',
          async () => {
            button.disabled = true;
            button.textContent = 'ENGATANDO…';
            await onEngage();
            root.classList.add('gone');
            // Só remove do DOM depois da transição, senão o fade não acontece.
            setTimeout(() => root.remove(), 1400);
            resolve();
          },
          { once: true }
        );
      });
    },

    fail(message) {
      line('FALHA CRÍTICA', message, 'bad');
      set(status, 'não foi possível inicializar o observatório');
      button.textContent = 'INDISPONÍVEL';
    },
  };
}
