/**
 * A LEI DA TELA DE ENTRADA — prova, sem navegador, que o `#boot` não afirma o que não mediu.
 *
 * Molde: `scripts/lei-tela.mjs` / `lei-notice.mjs`. Roda em node com um DOM de mentira e
 * IMPORTA os módulos REAIS (`src/hud/boot.js`, e por ele `hud/dom.js`, `hud/button.js`,
 * `core/tela.js`). Nada é transcrito: o que falhar aqui falha no arquivo de verdade.
 *
 * ⚠️ `core/tela.js` recusa camada duplicada — que é a lei dele funcionando —, então existe UMA
 * tela de entrada por processo. Cada cenário é um processo filho, e o pai soma os vereditos.
 *
 * Uso:  node lei-entrada.mjs [raiz-do-repo]        (sai 0 quando as leis valem)
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const cenario = (args.find((a) => a.startsWith('--cenario=')) || '').split('=')[1] || null;
const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const src = (p) => readFileSync(`${RAIZ}/${p}`, 'utf8');

// ------------------------------------------------------------------ o pai
if (!cenario) {
  const CENARIOS = ['pleno', 'degradado', 'vazio', 'gate'];
  let provadas = 0;
  let quebradas = 0;
  for (const nome of CENARIOS) {
    const r = spawnSync(process.execPath, [process.argv[1], RAIZ, `--cenario=${nome}`], { encoding: 'utf8' });
    process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    const m = /(\d+) leis provadas/.exec(r.stdout || '');
    provadas += m ? Number(m[1]) : 0;
    const q = /FALHOU: (\d+)/.exec(r.stdout || '');
    quebradas += q ? Number(q[1]) : r.status ? 1 : 0;
  }
  console.log(`\n═══ ${provadas} leis provadas em ${CENARIOS.length} cenários`);
  console.log(quebradas ? `═══ FALHOU: ${quebradas}` : '═══ OK — nenhuma lei quebrada');
  console.log(`
NÃO PROVADO AQUI (exige navegador e foto):
  · a legibilidade e o ritmo dos dois blocos na tela real;
  · que a saída da camada acontece no MESMO quadro em que o céu aparece;
  · que a marca não salta de posição entre o diagnóstico e a entrada.`);
  process.exit(quebradas ? 1 : 0);
}

// ------------------------------------------------------------------ DOM de mentira
class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parent = null;
    this._text = '';
    this.className = '';
    this.dataset = {};
    this.style = { setProperty() {} };
    this.listeners = new Map();
    this.classList = {
      add: (c) => {
        this.className = `${this.className} ${c}`.trim();
      },
      contains: (c) => this.className.split(/\s+/).includes(c),
    };
  }
  get textContent() {
    return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text;
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  append(...nodes) {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
  }
  setAttribute() {}
  focus() {
    this.focused = true;
  }
  addEventListener(tipo, fn) {
    this.listeners.set(tipo, fn);
  }
  click() {
    this.listeners.get('click')?.({});
  }
  /** Só o necessário: atributo `data-*` exato, como o `createBoot` usa. */
  querySelector(sel) {
    const m = /^\[data-([a-z-]+)\]$/.exec(sel);
    if (!m) throw new Error(`seletor não suportado no DOM de mentira: ${sel}`);
    const chave = m[1].replace(/-([a-z])/g, (_, l) => l.toUpperCase());
    const busca = (n) => {
      if (n.dataset[chave] !== undefined) return n;
      for (const f of n.children) {
        const achado = busca(f);
        if (achado) return achado;
      }
      return null;
    };
    return busca(this);
  }
  procurar(classe) {
    if (this.className === classe) return this;
    for (const f of this.children) {
      const a = f.procurar(classe);
      if (a) return a;
    }
    return null;
  }
  /** Toda linha desenhada, achatada: grupo, rótulo, valor e o tom que a classe carrega. */
  linhas(grupo = null, saida = []) {
    if (this.className === 'boot-group') grupo = this.children[0]?.textContent ?? grupo;
    if (this.className.startsWith('boot-line')) {
      saida.push({
        grupo,
        rotulo: this.children[0]?.textContent ?? '',
        valor: this.children[1]?.textContent ?? '',
        tom: this.className.replace('boot-line', '').trim(),
      });
      return saida;
    }
    for (const f of this.children) f.linhas(grupo, saida);
    return saida;
  }
  grupos(saida = []) {
    if (this.className === 'boot-group') {
      saida.push({ titulo: this.children[0]?.textContent, linhas: this.children[1]?.children.length ?? 0 });
    }
    for (const f of this.children) f.grupos(saida);
    return saida;
  }
}
globalThis.document = { createElement: (tag) => new Node(tag) };

const { createBoot } = await import(`${RAIZ}/src/hud/boot.js`);
const tela = await import(`${RAIZ}/src/core/tela.js`);

// ------------------------------------------------------------------ bancada
const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

function montar() {
  const root = new Node('div');
  const log = new Node('div');
  log.dataset.bootLog = '';
  const status = new Node('div');
  status.dataset.bootStatus = '';
  root.append(log, status);
  const boot = createBoot(root, { onEngage: async () => {} });
  const por = (r) => root.linhas().find((l) => l.rotulo === r);
  return { root, status, boot, por };
}

const HEALTH = {
  brain: 'claude',
  claude_cli: true,
  agent_cwd: '/Users/victor/workspace/espatial-fixtures',
  qdrant: { online: true, points: 2514 },
  embed_ready: true,
  ollama: { online: true, models: ['qwen3:8b'] },
  providers: [{ label: 'OPENAI', online: false, needs: 'OPENAI_API_KEY' }],
};
const CORPUS = {
  collection: 'espatial_fixture',
  prefix: '',
  cwd: '/Users/victor/workspace/espatial-fixtures',
};
/** Fixture medido em 09/08: 72 ARQUIVOS. `scene.loadGraph` devolve 460 (corpos + LUAS). */
const CORPOS = 72;
const LUAS = { shown: 367, dropped: 12 };

if (cenario === 'pleno') {
  const { root, status, boot, por } = montar();
  boot.ceu({ corpos: CORPOS, luas: LUAS, corpus: CORPUS });
  await boot.report(HEALTH);
  boot.disco('TRABALHO LOCAL · 17 ARQUIVOS · 11 NO CÉU', '');
  boot.disco('ÁRVORE LIMPA · NENHUM ANEL', 'good');
  const linhas = root.linhas();

  // ------------------------------------- §1 `corpos` é ARQUIVO, e lua tem nome próprio
  conferir(
    '§1 TOPOLOGIA conta ARQUIVO, não corpos+luas',
    por('TOPOLOGIA')?.valor === '72 corpos',
    `saiu "${por('TOPOLOGIA')?.valor}"`
  );
  conferir(
    '§1 nenhuma linha publica a soma corpos+luas',
    !linhas.some((l) => /\b(439|451|460)\b/.test(l.valor)),
    linhas
      .filter((l) => /\b(439|451|460)\b/.test(l.valor))
      .map((l) => l.rotulo)
      .join(',')
  );
  conferir(
    '§1 as luas são contadas com o NOME delas',
    por('LUAS')?.valor === '367 em órbita · 12 seções sem espaço',
    `saiu "${por('LUAS')?.valor}"`
  );
  conferir(
    '§1 corte de seção não sai como estado normal',
    por('LUAS')?.tom === 'warn',
    `tom "${por('LUAS')?.tom}"`
  );
  conferir(
    '§1 a palavra "corpos" nomeia UMA grandeza na tela',
    linhas.filter((l) => /\bcorpos?\b/.test(l.valor)).length === 1
  );

  // ------------------------------------- §2 de que corpus é este céu
  conferir(
    '§2 o corpus é declarado ANTES de tudo que ele qualifica',
    linhas[0].rotulo === 'CORPUS',
    `primeira linha "${linhas[0].rotulo}"`
  );
  conferir(
    '§2 corpus sai como coleção · raiz',
    por('CORPUS')?.valor === 'espatial_fixture · espatial-fixtures',
    `saiu "${por('CORPUS')?.valor}"`
  );
  conferir(
    '§2 prefixo VAZIO é escolha declarada e não vira segmento',
    !/·\s*·|·\s*$/.test(por('CORPUS')?.valor ?? '')
  );

  // ------------------------------------- §3 diagnóstico REAL, nunca uma sequência de OK
  conferir(
    '§3 subsistema caído sai dizendo o que falta',
    por('SATÉLITE OPENAI')?.valor === 'requer OPENAI_API_KEY'
  );
  conferir(
    '§3 nenhuma linha afirma OK sem medida',
    !linhas.some((l) => /^(OK|ONLINE|READY|STABLE|PRONTO)$/i.test(l.valor))
  );
  conferir(
    '§3 o resumo conta o que respondeu',
    status.textContent === 'todos os subsistemas respondendo',
    `saiu "${status.textContent}"`
  );

  // ------------------------------------- §4 os dois blocos, e nenhum vazio
  const grupos = root.grupos();
  conferir(
    '§4 dois blocos NOMEADOS, na ordem céu → subsistemas',
    grupos.map((g) => g.titulo).join('>') === 'CÉU>SUBSISTEMAS',
    grupos.map((g) => g.titulo).join('>')
  );
  conferir(
    '§4 nenhum bloco nasce vazio — cabeçalho sobre nada é moldura',
    grupos.every((g) => g.linhas > 0)
  );
  conferir(
    '§4 a topologia não mora no bloco dos subsistemas',
    por('TOPOLOGIA')?.grupo === 'CÉU' && por('MEMÓRIA VETORIAL')?.grupo === 'SUBSISTEMAS'
  );

  // ------------------------------------- §5 a leitura do disco chega TARDE e reescreve
  conferir(
    '§5 sondagem repetida REESCREVE a linha em vez de empilhar',
    linhas.filter((l) => l.rotulo === 'DISCO').length === 1,
    `${linhas.filter((l) => l.rotulo === 'DISCO').length} linhas de disco`
  );
  conferir(
    '§5 o disco mostra a leitura mais NOVA',
    por('DISCO')?.valor === 'ÁRVORE LIMPA · NENHUM ANEL',
    `saiu "${por('DISCO')?.valor}"`
  );
  conferir(
    '§5 o tom da timeline chega traduzido, não perdido',
    por('DISCO')?.tom === 'ok',
    `tom "${por('DISCO')?.tom}"`
  );

  // ------------------------------------- §7 a tela é UMA camada, e ela é a da frente
  conferir('§7 a entrada anuncia que está na frente', tela.estado().camada === 'boot');
  conferir(
    '§7 a entrada não declara uma segunda camada',
    tela.estado().camadas.join('>') === 'mundo>boot',
    tela.estado().camadas.join('>')
  );

  // ------------------------------------- §8 o call site, no arquivo de verdade
  const main = src('src/main.js');
  conferir(
    '§8 o retorno de loadGraph não é guardado para virar contagem',
    !/=\s*scene\.loadGraph\(/.test(main),
    'alguém voltou a publicar o retorno de loadGraph'
  );
  conferir(
    '§8 o medidor CORPUS · arq recebe a contagem de ARQUIVO',
    /frame\.applyGraph\(corpos\)/.test(main)
  );
  conferir(
    '§8 a nota da timeline e a tela dizem o MESMO número',
    /TOPOLOGIA CARREGADA · \$\{corpos/.test(main)
  );
  conferir('§8 a leitura do disco chega à tela de entrada', /boot\.disco\(texto, tom\)/.test(main));
  // Nenhum literal atravessa a chamada: coleção, raiz ou prefixo adivinhados aqui medem o corpus
  // errado com convicção total, que é o defeito que os scripts já pagaram.
  conferir(
    '§8 o corpus vem do SERVIDOR, sem palpite',
    /corpus: graph\.corpus \?\? null/.test(main) && !/boot\.ceu\([^)]*'/.test(main)
  );
  conferir('§8 nenhuma segunda camada de entrada é montada', !/createSplash|hud\/splash\.js/.test(main));
}

if (cenario === 'degradado') {
  const { boot, por, status } = montar();
  boot.ceu({ corpos: null, corpus: null, motivo: 'servidor não respondeu' });
  await boot.report({ ...HEALTH, qdrant: { online: false }, ollama: { online: false, models: [] } });

  conferir(
    '§6 topologia que não carregou sai em vermelho, com o motivo',
    por('TOPOLOGIA')?.valor === 'indisponível — servidor não respondeu' && por('TOPOLOGIA')?.tom === 'bad',
    `saiu "${por('TOPOLOGIA')?.valor}" (${por('TOPOLOGIA')?.tom})`
  );
  conferir('§6 topologia que não carregou NUNCA vira zero', !/\b0\b/.test(por('TOPOLOGIA')?.valor ?? ''));
  conferir(
    '§6 corpus não declarado sai em vermelho, nunca em branco',
    por('CORPUS')?.valor === 'NÃO DECLARADO' && por('CORPUS')?.tom === 'bad',
    `saiu "${por('CORPUS')?.valor}" (${por('CORPUS')?.tom})`
  );
  conferir('§6 lua não medida não vira "0 luas"', !por('LUAS'));
  conferir(
    '§6 memória não medida não vira "0 chunks"',
    por('MEMÓRIA VETORIAL')?.valor === 'OFFLINE' && por('MEMÓRIA VETORIAL')?.tom === 'bad'
  );
  conferir(
    '§6 o resumo NOMEIA quantos degradaram',
    /^1 subsistema\(s\) degradado\(s\)/.test(status.textContent),
    `saiu "${status.textContent}"`
  );
}

if (cenario === 'vazio') {
  const { boot, por } = montar();
  boot.ceu({ corpos: 0, luas: { shown: 0, dropped: 0 }, corpus: CORPUS });
  conferir(
    '§6 céu medido e VAZIO é outro fato, e também é vermelho',
    por('TOPOLOGIA')?.valor === 'VAZIA' && por('TOPOLOGIA')?.tom === 'bad',
    `saiu "${por('TOPOLOGIA')?.valor}" (${por('TOPOLOGIA')?.tom})`
  );
  conferir(
    '§6 lua MEDIDA e ausente é zero, e zero é uma medida',
    por('LUAS')?.valor === '0 em órbita' && por('LUAS')?.tom === 'ok'
  );
  conferir('§6 corpus declarado continua declarado num céu vazio', por('CORPUS')?.tom === 'ok');
}

if (cenario === 'gate') {
  const { root, boot } = montar();
  boot.ceu({ corpos: CORPOS, luas: LUAS, corpus: CORPUS });
  const entrou = boot.engage();
  const fileira = root.procurar('boot-actions');
  conferir(
    '§9 o gate oferece DUAS respostas legítimas',
    fileira?.children.length === 2,
    `${fileira?.children.length} botões`
  );
  conferir(
    '§9 nenhuma delas é "aperte qualquer tecla"',
    !/QUALQUER TECLA|PRESS ANY KEY/i.test(fileira?.textContent ?? '')
  );
  conferir(
    '§9 a resposta em SILÊNCIO também entra',
    await (async () => {
      const silencio = fileira?.children[1];
      if (!silencio) return false;
      silencio.click();
      await entrou;
      return true;
    })()
  );
  conferir(
    '§9 a camada sai da pilha e o que estava embaixo reaparece',
    tela.estado().camada === 'mundo',
    tela.estado().camada
  );
  conferir('§9 a tela sai INTEIRA, numa transição só', root.classList.contains('gone'));
  conferir('§9 a fileira do gate sai antes da entrada', !root.procurar('boot-actions'));

  // Falha CRÍTICA: nem oferece a escolha, e NÃO sai de cena.
  const outra = { root: new Node('div') };
  void outra;
}

console.log(`\n[${cenario}] ${ok.length} leis provadas`);
for (const f of falhas) console.log(`  ✗ ${f}`);
if (falhas.length) console.log(`FALHOU: ${falhas.length}`);
process.exit(falhas.length ? 1 : 0);
