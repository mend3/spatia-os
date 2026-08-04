/**
 * Painel de permissões, skills e agentes.
 *
 * Cada linha mostra o que o agente pode fazer, e cada toggle vira flag real no próximo
 * `claude -p`. Por isso o painel exibe **o comando resultante** no pé: é a prova de que o
 * interruptor mexeu em algo, e o lugar onde uma configuração impossível fica óbvia.
 *
 * O catálogo de skills e agentes é descoberto no repo pelo servidor, não mantido aqui — item
 * novo aparece sozinho, item removido desaparece.
 */
import { el, set } from './dom.js';
import { button } from './button.js';
import * as prefs from '../core/prefs.js';
import { on } from '../core/bus.js';
import { bind } from '../core/keys.js';

const TOGGLE_KEY = 'KeyP';

// Duração do sinal de reversão. Curto o bastante para não virar decoração, longo o bastante para
// ser visto por quem estava olhando o próprio clique.
const REVERT_FLASH_MS = 1200;

export function createPermissions(root, { onChange } = {}) {
  const panel = el('div', 'perms');
  const header = el('div', 'controls-head');
  header.append(el('span', 'controls-title', 'PERMISSÕES'));
  const status = el('span', 'perms-status', '');
  header.append(status);
  panel.append(header);

  const body = el('div', 'perms-body');
  panel.append(body);

  const flags = el('code', 'perms-flags');
  const flagsBox = el('div', 'perms-flagsbox');
  flagsBox.append(el('div', 'controls-group', 'COMANDO RESULTANTE'), flags);
  panel.append(flagsBox);
  panel.append(el('div', 'perms-hint', 'P FECHA · APLICA NA PRÓXIMA PERGUNTA'));
  root.append(panel);

  let current = null;
  // Último estado CONFIRMADO pelo servidor. É para onde o painel volta quando um POST falha —
  // `current` pode estar otimista, então ele não serve de âncora.
  let confirmed = null;
  // Número de sequência da requisição. Sem ele, dois toggles rápidos podem ter as respostas
  // chegando fora de ordem e a mais VELHA sobrescreveria a escolha mais nova na tela.
  let seq = 0;

  async function fetchConfig() {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error(`config: ${response.status}`);
    return response.json();
  }

  /**
   * Manipulação direta pinta PRIMEIRO; a persistência reconcilia depois e **reverte visivelmente
   * se falhar**.
   *
   * O que havia antes: cada toggle esperava o round-trip antes de redesenhar, então clicar tinha
   * latência visível e o interruptor parecia emperrado. O que a versão anterior também fazia de
   * errado: em caso de falha ela só escrevia o motivo no cabeçalho e deixava a marca de seleção
   * onde o operador a pôs — a tela passava a afirmar um estado que o servidor não tem.
   *
   * A regra do DESIGN.md do hermes-agent: *"direct manipulation updates the view first. Network
   * or disk persistence reconciles afterward and rolls back visibly on failure."*
   */
  async function patch(body) {
    const mine = ++seq;
    // Pinta na hora com o estado que o operador acabou de pedir. `pending: true` faz o painel
    // marcar o COMANDO RESULTANTE como provisório: as flags são calculadas pelo servidor, e
    // exibi-las como definitivas antes da confirmação seria inventar a resposta.
    render({ ...current, state: { ...current.state, ...body }, pending: true });
    set(status, 'aplicando…');

    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || `HTTP ${response.status}`);
      }
      const fresh = await response.json();
      // Resposta atrasada de um clique anterior não pode voltar no tempo.
      if (mine !== seq) return;
      confirmed = fresh;
      render(fresh);
      set(status, 'aplicado');
      onChange?.(current);
    } catch (error) {
      if (mine !== seq) return;
      // Reversão VISÍVEL: o estado volta ao confirmado, o painel pisca em vermelho e o motivo
      // fica na tela. Reverter em silêncio é o mesmo defeito, só mais difícil de notar.
      if (confirmed) render(confirmed);
      set(status, `revertido: ${error.message}`);
      panel.dataset.reverted = 'true';
      setTimeout(() => delete panel.dataset.reverted, REVERT_FLASH_MS);
    }
  }

  /** Lista de desligados como fonte da verdade: item novo no repo nasce ativo. */
  function toggleOff(key, id, enabled) {
    const off = new Set(current.state[key]);
    if (enabled) off.delete(id);
    else off.add(id);
    patch({ [key]: [...off] });
  }

  function switchRow(label, description, enabled, handler, tone) {
    const row = el('label', `perm ${enabled ? '' : 'off'}`);
    const box = el('input', 'perm-box');
    box.type = 'checkbox';
    box.checked = enabled;
    box.addEventListener('change', () => handler(box.checked));
    row.append(box);

    const text = el('span', 'perm-text');
    const name = el('span', 'perm-name', label);
    if (tone) name.dataset.kind = tone;
    text.append(name);
    if (description) text.append(el('span', 'perm-desc', description));
    row.append(text);
    return row;
  }

  function render(data) {
    current = data;
    body.replaceChildren();

    // ---- modo de permissão ----
    body.append(el('div', 'controls-group', 'MODO'));
    const modes = el('div', 'perm-modes');
    for (const mode of data.modes) {
      // Modo de permissão é escolha exclusiva: variante `select`, preenchimento sólido.
      modes.append(
        button({
          variant: 'select',
          size: 'xs',
          label: mode,
          on: mode === data.state.mode,
          onClick: () => patch({ mode }),
        })
      );
    }
    body.append(modes);

    // ---- ferramentas ----
    body.append(el('div', 'controls-group', 'FERRAMENTAS'));
    const off = new Set(data.state.tools_off);
    for (const tool of data.tools) {
      body.append(
        switchRow(tool.id, tool.label, !off.has(tool.id), (on) => toggleOff('tools_off', tool.id, on), tool.kind)
      );
    }

    /*
     * ---- fontes de settings ----
     *
     * Era um toggle só ("carregar .claude do repo"), e ele escondia que existem TRÊS fontes.
     * A consequência foi um bug real: `hub-board` e `graphiti` vivem no escopo `local`, que
     * nenhum controle desta tela alcançava — o painel de MCP simplesmente não os listava.
     *
     * O custo de cada fonte fica na própria linha porque é o que faz a escolha ser uma
     * escolha. `user` traz as regras globais do usuário e ~9,1k tokens de cache por execução;
     * dizer isso na tela é a diferença entre um toggle e uma pegadinha.
     */
    body.append(el('div', 'controls-group', 'FONTES DE SETTINGS'));
    const active = new Set(data.state.setting_sources);
    for (const source of data.sources) {
      const row = switchRow(
        source.label,
        `${source.effect} · ${source.cost}`,
        active.has(source.id),
        (on) => {
          const next = new Set(active);
          if (on) next.add(source.id);
          else next.delete(source.id);
          patch({ setting_sources: [...next] });
        }
      );
      body.append(row);
    }
    // Acoplamento que não dá para esconder: não existe flag que carregue skills e agentes do
    // projeto sem trazer os hooks dele junto.
    body.append(el('div', 'perm-empty', 'PROJETO traz os hooks do repo junto — não há flag que separe'));

    // ---- skills e agentes ----
    section('SKILLS', data.catalog.skills, 'skills_off', data.state.skills_off);
    section('AGENTES', data.catalog.agents, 'agents_off', data.state.agents_off);

    /*
     * As flags são calculadas pelo SERVIDOR, então num render otimista elas ainda são as do
     * estado anterior. Marcar como provisório é a única saída honesta: exibi-las como definitivas
     * transformaria o "comando resultante" — que existe justamente para ser prova — em palpite.
     */
    set(flags, ['claude', '-p', '…', ...data.flags].join(' '));
    flagsBox.dataset.pending = String(Boolean(data.pending));
    set(status, `${data.catalog.skills.length} skills · ${data.catalog.agents.length} agentes`);
  }

  function section(title, items, key, offList) {
    const group = el('div', 'controls-group', `${title} · ${items.length}`);
    body.append(group);
    if (!items.length) {
      body.append(el('div', 'perm-empty', 'nenhum encontrado no repo'));
      return;
    }
    const off = new Set(offList);
    for (const item of items) {
      body.append(
        switchRow(item.id, item.description, !off.has(item.id), (on) => toggleOff(key, item.id, on))
      );
    }
  }

  function setOpen(open) {
    panel.classList.toggle('open', open);
    document.body.classList.toggle('perms-open', open);
    prefs.set('panel.permissions', open);
    if (open) document.activeElement?.blur?.();
  }

  bind({ code: TOGGLE_KEY, label: 'P PERMISSÕES' }, () => setOpen(!panel.classList.contains('open')));

  const trigger = root.querySelector('[data-perms-toggle]');
  trigger?.addEventListener('click', () => setOpen(!panel.classList.contains('open')));

  // O painel mostra quantas ferramentas o agente de fato recebeu na última execução — é a
  // confirmação de que a configuração chegou do outro lado.
  on('brain', (event) => set(status, `${event.tools} ferramentas na sessão`));

  fetchConfig()
    .then((data) => {
      confirmed = data;
      render(data);
    })
    .catch((error) => set(status, `indisponível: ${error.message}`));

  return {
    toggle: () => setOpen(!panel.classList.contains('open')),
    reload: () =>
      fetchConfig().then((data) => {
        confirmed = data;
        render(data);
      }),
  };
}
