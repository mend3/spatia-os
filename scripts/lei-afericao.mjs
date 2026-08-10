/**
 * O ORÁCULO DA AFERIÇÃO — prova que o cabeçalho para de afirmar o presente quando ele expira.
 *
 * O que ele guarda é uma coisa só, e ela é `null` ≠ `0` aplicado ao TEMPO: um ponto de
 * subsistema afirma *"isto está vivo agora"*, e sem a idade da leitura a afirmação envelhece
 * sozinha, com o mesmo pixel, sobre um serviço que já caiu.
 *
 * Roda em node, sem navegador e sem GPU: um DOM de mentira, e os módulos REAIS
 * (`hud/frame.js`, `hud/dom.js`, `core/bus.js`, `core/state.js`) importados por cima dele.
 *
 * Uso: node scripts/lei-afericao.mjs        (sai 0 quando as leis valem)
 */
import { readFileSync } from 'node:fs';

/*
 * ☠️ A raiz sai do PRÓPRIO arquivo, nunca de argumento, de env nem de caminho de máquina. Com
 * raiz externa o oráculo importa a árvore que lhe apontarem — passa ao ser rodado sobre uma
 * CÓPIA MUTADA, atestando guarda que a cópia não tem.
 */
const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const src = (p) => readFileSync(`${RAIZ}/${p}`, 'utf8');

const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

// ---------------------------------------------------------------- o DOM de mentira
class N {
  constructor(tag) {
    this.tag = tag;
    this.className = '';
    this._text = '';
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this.title = '';
    this.hidden = false;
    this.attrs = {};
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v ?? ''); }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...ns) { for (const n of ns) { n.parent = this; this.children.push(n); } }
  replaceChildren(...ns) { this.children = []; for (const n of ns) this.append(n); }
  querySelector(sel) {
    const alvo = sel.replace(/^\[|\]$/g, '');
    const busca = (n) => {
      if (n.attr === alvo) return n;
      for (const c of n.children) { const achado = busca(c); if (achado) return achado; }
      return null;
    };
    return busca(this);
  }
}

const raiz = new N('body');
for (const attr of ['data-clock-time', 'data-clock-seconds', 'data-clock-date', 'data-state-label',
  'data-state-dot', 'data-services', 'data-headstat', 'data-context', 'data-vitals']) {
  const n = new N('div');
  n.attr = attr;
  raiz.append(n);
}
globalThis.document = { createElement: (tag) => new N(tag) };

/*
 * ⚠️ O RELÓGIO É DE MENTIRA, e é ele que torna esta medida possível sem esperar 90 s.
 *
 * `Date.now` é substituído por um contador que só anda quando o oráculo manda. O tique de 1 s do
 * cabeçalho também é falso: nada aqui espera tempo de parede, então nenhuma lei depende da
 * máquina estar rápida.
 */
let agoraFalso = 1_700_000_000_000;
const DateReal = Date;
globalThis.Date = class extends DateReal {
  constructor(...args) { super(...(args.length ? args : [agoraFalso])); }
  static now() { return agoraFalso; }
};
const avancar = (ms) => { agoraFalso += ms; tiques.forEach((fn) => fn()); };

const tiques = [];
globalThis.setInterval = (fn) => { tiques.push(fn); return tiques.length; };
globalThis.clearInterval = () => {};

const { createFrame, AFERICAO_MS } = await import(`${RAIZ}/src/hud/frame.js`);
const frame = createFrame(raiz);

// ---------------------------------------------------------------- leitura da tela
const services = raiz.querySelector('[data-services]');
const afericao = () => services.children.find((c) => c.className === 'svc-afericao');
const pontos = () => services.children.filter((c) => c.className === 'svc');
const brilho = (i) => pontos()[i].children[0].dataset.status;
const idade = () => afericao().textContent;
const tom = () => afericao().dataset.tone;
const vencida = () => services.dataset.afericao;

const saude = (online = true) => ({
  claude_cli: true,
  brain: 'claude',
  qdrant: { online, points: 2514 },
  ollama: { online: true },
  index_age_days: 0,
});

// ---------------------------------------------------- §1 nunca aferido não é aferido agora
conferir('§1 ☠️ antes da primeira leitura a idade é travessão, não `AGORA`',
  idade() === '—', idade());
conferir('§1 e nada está vencido — não medi ≠ medi e venceu', vencida() === undefined);
conferir('§1 o tique de 1s não inventa idade sozinho',
  (() => { avancar(10 * AFERICAO_MS); return idade() === '—' && vencida() === undefined; })(),
  idade());

// ---------------------------------------------------- §2 a leitura chega ao pixel
frame.applyHealth(saude());
conferir('§2 a aferição zera a idade', idade() === 'AGORA', idade());
conferir('§2 o estado medido chega ao ponto', brilho(1) === 'on', String(brilho(1)));
conferir('§2 leitura recente não carrega tom', tom() === undefined);

// ---------------------------------------------------- §3 a idade sai do instante da LEITURA
avancar(12_000);
conferir('§3 doze segundos sem aferir lêem em segundos', idade() === 'HÁ 12S', idade());
avancar(48_000);
conferir('§3 passado o minuto a escala engrossa', idade() === 'HÁ 1MIN', idade());
conferir('§3 ⚠️ e o ponto NÃO mudou — quem envelheceu foi a leitura, não o serviço',
  brilho(1) === 'on');

// ---------------------------------------------------- §4 a leitura vence, e a tela declara
conferir('§4 (controle) uma aferição perdida ainda não vence',
  (() => { agoraFalso = 1_700_000_000_000; frame.applyHealth(saude());
    avancar(AFERICAO_MS + 1000); return tom() === undefined && vencida() === undefined; })(),
  `${idade()} tom=${tom()} vencida=${vencida()}`);
avancar(2 * AFERICAO_MS);
conferir('§4 ☠️ passadas três aferições a idade vira vermelha', tom() === 'bad', String(tom()));
conferir('§4 ☠️ e o GRUPO declara que parou de afirmar o presente',
  vencida() === 'vencida', String(vencida()));
conferir('§4 ⚠️ o que foi medido NÃO é apagado — sai a certeza, não o fato',
  brilho(1) === 'on', String(brilho(1)));

// ---------------------------------------------------- §5 a falha não repinta
const antes = { idade: idade(), tom: tom(), vencida: vencida(), ponto: brilho(1) };
avancar(1000);
conferir('§5 ☠️ sem aferição bem-sucedida a idade não volta a zero', idade() !== 'AGORA', idade());
conferir('§5 o vencimento persiste enquanto ninguém aferir',
  tom() === antes.tom && vencida() === antes.vencida && brilho(1) === antes.ponto);

// ---------------------------------------------------- §6 aferir de novo devolve o presente
frame.applyHealth(saude(false));
conferir('§6 a nova aferição zera a idade', idade() === 'AGORA', idade());
conferir('§6 e levanta o vencimento', tom() === undefined && vencida() === undefined);
conferir('§6 ☠️ e o serviço que caiu aparece SEM ninguém ter perguntado',
  brilho(1) === 'off', String(brilho(1)));

/*
 * ---------------------------------------------------- §7 relógio para trás não vira idade
 *
 * ⚠️ Aqui NÃO se confere um piso em zero: negativo já cai no primeiro degrau, e um `max(0, …)`
 * passaria verde em toda mutação. O que se confere é que a idade não é distância ABSOLUTA — um
 * `abs` transformaria relógio atrasado em cinco segundos de leitura velha que nunca houve.
 */
agoraFalso -= 5_000;
avancar(0);
conferir('§7 ⚠️ relógio para trás lê AGORA, e não a distância absoluta',
  idade() === 'AGORA', idade());
conferir('§7 e não declara vencida uma leitura que acabou de acontecer',
  tom() === undefined && vencida() === undefined);

// ---------------------------------------------------- §8 o período tem UM dono
const fonteFrame = src('src/hud/frame.js');
const fonteMain = src('src/main.js');
conferir('§8 `AFERICAO_MS` é exportado por `hud/frame.js`',
  /export const AFERICAO_MS/.test(fonteFrame));
conferir('§8 ☠️ `main.js` IMPORTA o período em vez de repetir o número',
  /import \{[^}]*AFERICAO_MS[^}]*\} from '\.\/hud\/frame\.js'/.test(fonteMain));
conferir('§8 ☠️ e o laço de saúde não tem número literal',
  /setInterval\(poll, AFERICAO_MS\)/.test(fonteMain)
  && !/setInterval\(poll, *[0-9_]+\)[\s\S]{0,80}api\.health/.test(fonteMain));
conferir('§8 o vencimento é DERIVADO do período, não escolhido',
  /AFERICAO_VENCIDA_MS = 3 \* AFERICAO_MS/.test(fonteFrame));

// ---------------------------------------------------- §9 a transcrição do período do vigia
const ambiente = src('server/ambient.py');
const scanSeconds = Number(/^SCAN_SECONDS = (\d+)$/m.exec(ambiente)?.[1]);
conferir('§9 `server/ambient.py` continua declarando `SCAN_SECONDS`',
  Number.isFinite(scanSeconds), String(scanSeconds));
conferir('§9 ⚠️ o período do cliente é o do vigia — transcrição em dia',
  AFERICAO_MS / 1000 === scanSeconds, `${AFERICAO_MS / 1000}s aqui × ${scanSeconds}s no vigia`);

// ---------------------------------------------------- §10 três idades, e nenhuma é a outra
const fonteStreams = src('src/hud/streams.js');
conferir('§10 ☠️ a rampa do AVISO continua em DIAS, e é dele',
  /IDADE_AMBAR_D = 3/.test(fonteStreams) && /IDADE_VERMELHA_D = 7/.test(fonteStreams));
conferir('§10 ☠️ a rampa da AFERIÇÃO não usa aqueles símbolos',
  !/IDADE_AMBAR_D|IDADE_VERMELHA_D/.test(fonteFrame));
conferir('§10 a célula ÍNDICE continua medindo DIAS do corpus, não a leitura',
  /headCell\('index', 'ÍNDICE'\)/.test(fonteFrame)
  && /const age = health\.index_age_days/.test(fonteFrame));
conferir('§10 e o rótulo da aferição não empresta a palavra ÍNDICE',
  !/AFERIÇÃO[\s\S]{0,40}ÍNDICE/.test(fonteFrame));

// ---------------------------------------------------- §11 o laço afere, e não remonta
const laco = /function watchHealth\(frame\) \{[\s\S]*?\n\}/.exec(fonteMain)?.[0] ?? '';
conferir('§11 o laço existe e é chamado', Boolean(laco) && /watchHealth\(frame\);/.test(fonteMain));
for (const remonta of ['installProviders', 'showProviders', 'voice.applyHealth', 'api.units']) {
  conferir(`§11 ⚠️ o laço não remonta \`${remonta}\` — remontar não é aferir`,
    !laco.includes(remonta));
}
conferir('§11 ☠️ o laço não emite no barramento — aviso repetido é o que ensina a não ler a tela',
  !/emit\(/.test(laco));
conferir('§11 ☠️ e não escreve linha de timeline', !/streams\.note|\.note\(/.test(laco));
conferir('§11 aba escondida não afere', /if \(document\.hidden\) return;/.test(laco));
conferir('§11 ☠️ o `catch` NÃO chama `applyHealth` — falha não carimba leitura',
  !/catch[\s\S]*applyHealth/.test(laco), laco.slice(laco.indexOf('catch'), laco.indexOf('catch') + 90));

// ---------------------------------------------------- §12 nada disso escreve na tela
conferir('§12 a moldura não importa `core/tela.js`', !/core\/tela\.js/.test(fonteFrame));
conferir('§12 e não há camada, cena nem rota nova — a aferição não é um MODO',
  !/tela\.(entrar|sair|cena|rota)/.test(fonteFrame));

// ---------------------------------------------------- §13 o CSS existe para o que o JS escreve
const html = src('index.html');
conferir('§13 `.svc-afericao` tem regra no CSS', /\.svc-afericao *\{/.test(html));
conferir('§13 o tom vencido tem cor própria', /\.svc-afericao\[data-tone="bad"\]/.test(html));
conferir('§13 ☠️ e o grupo vencido tem regra — senão o atributo não vira pixel',
  /\.status-services\[data-afericao="vencida"\]/.test(html));

// ------------------------------------- §14 a idade qualifica QUEM ela mediu, e mais ninguém

/*
 * ☠️ **A idade descreve TRÊS pontos e era emprestada aos CINCO, errando nos DOIS sentidos.**
 *
 * `applyHealth` carimba `aferidoEm` e marca `brain`, `qdrant` e `ollama`. Os outros dois nunca
 * passam por ali: `stream` é reescrito do store local no tique — e apagado como vencido no MESMO
 * tique — e `graph` sai da carga da topologia, cuja verdade não expira do jeito que "responde
 * agora" expira; com aferição fresca ele afirmava presente sobre uma leitura que ninguém refez.
 *
 * ⚠️ **Um ponto de fonte `afericao` PODE ser refrescado por evento** (`memory` acende `qdrant`), e
 * apagá-lo junto continua certo: a idade é o PISO da certeza do grupo, não uma afirmação sobre cada
 * evento. Falha para o lado seguro. Os dois consertados falhavam para o lado inseguro.
 */
const FONTES = pontos().map((p) => p.children[0].dataset.fonte);
conferir('§14 todo ponto declara a FONTE do seu estado', FONTES.every(Boolean), JSON.stringify(FONTES));

const fonteSrc = src('src/hud/frame.js');
/** id → fonte, lido da tabela do fonte: a lei não repete a lista, ela a IMPORTA por varredura. */
const declarado = new Map(
  [...fonteSrc.matchAll(/\['(\w+)',\s*'[A-Z]+',\s*FONTE\.(\w+)\]/g)].map((m) => [m[1], m[2]])
);
conferir('§14 a tabela de fontes tem os cinco pontos', declarado.size === pontos().length,
  `${declarado.size} de ${pontos().length}`);

/*
 * ☠️ **A fonte DECLARADA tem de bater com quem de fato marca o ponto** — senão a tabela vira um
 * rótulo que envelhece sozinho, que é o defeito original com outra roupa. O recorte é do corpo de
 * `applyHealth`, e a pergunta é de PERTINÊNCIA: quem a aferição marca declara `AFERICAO`, e quem
 * ela não marca, não.
 */
const corpoApply = fonteSrc.slice(fonteSrc.indexOf('applyHealth(health) {'),
  fonteSrc.indexOf('applyGraph(count) {'));
const marcadosNaAfericao = new Set([...corpoApply.matchAll(/mark\('(\w+)'/g)].map((m) => m[1]));
for (const [id, fonte] of declarado) {
  const aferido = marcadosNaAfericao.has(id);
  conferir(`§14 \`${id}\` declara ${fonte} e ${aferido ? 'É' : 'NÃO é'} marcado por applyHealth`,
    aferido === (fonte === 'AFERICAO'), `declarado ${fonte}, marcado em applyHealth: ${aferido}`);
}

conferir('§14 ☠️ o vencimento no CSS alcança SÓ a fonte que a aferição mediu',
  /\.status-services\[data-afericao="vencida"\] \.dot\[data-fonte="afericao"\]/.test(html),
  'a regra apaga todos os pontos, inclusive os que a aferição nunca leu');

/*
 * E o pixel, de ponta a ponta: passadas três aferições sem aferir, o grupo declara vencido — e o
 * ponto de fonte local continua com a fonte que o exclui da regra.
 */
frame.applyHealth(saude());
avancar(AFERICAO_MS * 3 + 1000);
conferir('§14 (controle) o grupo está vencido', vencida() === 'vencida', String(vencida()));
const porFonte = Object.fromEntries(pontos().map((p, i) => [FONTES[i], p.children[0].dataset.fonte]));
conferir('§14 vencido o grupo, `stream` e `graph` mantêm fonte fora da regra',
  porFonte.local === 'local' && porFonte.carga === 'carga', JSON.stringify(porFonte));

// ---------------------------------------------------------------- veredito
console.log(`\n${ok.length} leis provadas`);
for (const f of falhas) console.log(`  ✗ ${f}`);
console.log(falhas.length ? `\nFALHOU: ${falhas.length}` : '\nOK — nenhuma lei quebrada');
console.log(`
NÃO PROVADO AQUI (exige navegador, e nenhuma foto foi tirada):
  · que a idade a 8px cabe ao lado dos cinco pontos sem empurrar o CONTEXTO da faixa central;
  · que \`opacity: .45\` sem \`box-shadow\` se lê como "isto não é o presente" a um metro da tela,
    e não como um ponto apagado a mais;
  · que \`/api/health\` de fato responde em ~20 ms com a aba em primeiro plano (medido no curl,
    não no navegador);
  · quantos eventos o \`/api/system-events\` entrega numa sessão real — aqui foram 0 em 301 s.`);
process.exit(falhas.length ? 1 : 0);
