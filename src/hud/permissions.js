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
import * as prefs from '../core/prefs.js';
import { on } from '../core/bus.js';
import { bind } from '../core/keys.js';

const TOGGLE_KEY = 'KeyP';

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
  let busy = false;

  async function fetchConfig() {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error(`config: ${response.status}`);
    return response.json();
  }

  async function patch(body) {
    if (busy) return;
    busy = true;
    set(status, 'aplicando…');
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`${response.status}`);
      render(await response.json());
      set(status, 'aplicado');
      onChange?.(current);
    } catch (error) {
      set(status, `falhou: ${error.message}`);
    } finally {
      busy = false;
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
      const button = el('button', `perm-mode ${mode === data.state.mode ? 'on' : ''}`, mode);
      button.addEventListener('click', () => patch({ mode }));
      modes.append(button);
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

    // ---- config do repo ----
    body.append(el('div', 'controls-group', 'CONFIG DO REPO'));
    body.append(
      switchRow(
        'CARREGAR .claude DO REPO',
        // Acoplamento que não dá para esconder: não existe flag que carregue skills e
        // agentes do projeto sem trazer os hooks dele junto.
        'traz skills, agentes E hooks do projeto — não há como separar',
        data.state.load_repo_config,
        (on) => patch({ load_repo_config: on })
      )
    );

    // ---- skills e agentes ----
    section('SKILLS', data.catalog.skills, 'skills_off', data.state.skills_off);
    section('AGENTES', data.catalog.agents, 'agents_off', data.state.agents_off);

    set(flags, ['claude', '-p', '…', ...data.flags].join(' '));
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
    .then(render)
    .catch((error) => set(status, `indisponível: ${error.message}`));

  return { toggle: () => setOpen(!panel.classList.contains('open')), reload: () => fetchConfig().then(render) };
}
