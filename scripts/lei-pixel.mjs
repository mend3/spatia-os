#!/usr/bin/env node
/**
 * A LEI DO PIXEL — o primeiro oráculo desta base que olha para o QUADRO DESENHADO.
 *
 * ## Por que ela existe, e por que os outros 37 não bastam
 *
 * Os demais guardas provam invariantes de CÓDIGO: que uma constante existe, que um módulo é puro,
 * que uma classificação não muda sob perturbação. Nenhum deles abre o shader. E o modo de falha
 * característico deste projeto não é o código errado — é **a feição que some enquanto o shader
 * continua lá**, com o arquivo válido, o material compilando e a cena rodando. `check-shaders.mjs`
 * pega a crase que fecha o template; ele não pega o termo que passou a somar zero.
 *
 * ⚠️ **O que esta lei NÃO faz, e a distinção decide o que esperar dela.** Ela não compara imagens
 * com quadros dourados. Comparação de imagem exige tolerância perceptual e um conjunto de PNGs que
 * envelhece a cada afinação legítima; o que ela faz é medir GRANDEZAS do quadro e afirmar sobre
 * elas. Um oráculo que afirma "cobertura acima de um piso" sobrevive à afinação e continua pegando
 * a feição apagada, que é o defeito caro.
 *
 * ## O palco é a BANCADA, nunca a cena
 *
 * `canvas.html` já resolve o problema difícil, e resolveu antes desta lei existir: tempo MANUAL
 * (nada anima sozinho), UM objeto por vez sobre fundo liso, e sem pós-processamento. Medir na cena
 * cheia mediria a soma — bloom e lente reescrevem o pixel depois que o material terminou — e num
 * instante que anda entre um quadro e o seguinte.
 *
 * ## O motor, e por que ele não tem dependência
 *
 * Chrome headless falando CDP por WebSocket. O `WebSocket` é embutido no Node 22, então não há
 * pacote, não há `npx` e não há rede — as três coisas que mantêm `make tipos` fora do portão.
 * ⭑ **SwiftShader (`--use-angle=swiftshader`) é escolha, não recurso de contorno:** rasterização
 * por SOFTWARE dá o mesmo pixel em qualquer máquina, e um oráculo que dependesse da GPU do dia
 * afirmaria coisas diferentes no laptop e no CI.
 *
 * Uso:  node scripts/lei-pixel.mjs        (exige `./serve.py` no ar)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.ESPATIAL_URL ?? 'http://127.0.0.1:8787';
const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const C = { erro: '\x1b[31m', ok: '\x1b[32m', fraco: '\x1b[2m', forte: '\x1b[1m', fim: '\x1b[0m' };
let falhas = 0;
const checar = (secao, cond, frase) => {
  if (cond) console.log(`  ${C.ok}✓${C.fim} ${C.fraco}${secao}${C.fim} ${frase}`);
  else {
    falhas += 1;
    console.log(`${C.erro}✗ ${secao} ${frase}${C.fim}`);
  }
};

/**
 * Quantos passos de `update` antes de ler o quadro.
 *
 * ☠️ **Um passo só chamava de "não desenha" o que ainda não tinha CHEGADO.** Medido: o asteroide
 * carrega a malha de um `.stl` e o `sonda` idem — os dois davam cobertura ZERO em 1 quadro e
 * 5,5%/6,4% a partir de 6, estáveis daí até 180. Oito é a margem sobre o joelho medido, não um
 * número redondo.
 */
const QUADROS = 8;

/**
 * O piso de cobertura, em fração do quadro.
 *
 * Procedência: varredura dos 27 espécimes da bancada em 2026-08-10, SwiftShader, alvo 384². O
 * menor que desenha é `ceu` com **0,067%** — campo estelar é esparso por natureza. O piso fica uma
 * ordem de grandeza abaixo dele, porque a pergunta desta lei é "desenha ALGUMA coisa", nunca
 * "desenha o bastante": um teto apertado transformaria toda afinação de brilho em falha.
 */
const PISO_COBERTURA = 0.0002;

/**
 * O teto do quadro LAVADO — a fração de pixels acima de 200 de luminância.
 *
 * ☠️ **A grandeza óbvia estava ERRADA, e a mutação foi quem mostrou.** A primeira versão contava
 * pixels com os TRÊS canais acima de 250; multiplicando a saída do planeta por 50 no fragmento, a
 * saturação assim medida ficou em **zero** e a §2 passou verde com o corpo virando mancha. O
 * mapeamento de tom ACES comprime o topo — "estourado nos três canais" quase não acontece. O que a
 * mancha faz é encher o quadro de luminância ALTA.
 *
 * Procedência do teto: varredura dos 27 espécimes em 2026-08-10, SwiftShader, alvo 384². O mais
 * claro em repouso é `fotosfera` com **4,29%** (é uma estrela: é para ser claro), e o planeta
 * mutado dá **42,2%**. O teto em 15% fica com folga de 3,5× sobre o legítimo e 2,8× sob o defeito.
 */
const TETO_CLAROS = 0.15;

/**
 * Espécimes que NÃO desenham em repouso, com a razão MEDIDA de cada um.
 *
 * ☠️ **Isto não é lista de dispensa: é a lista dos que a §4 confere CONTRA a medida.** Um espécime
 * daqui que voltar a desenhar derruba a lei, porque a tabela envelheceu — é o mesmo desenho de
 * `NAO_RODAM` em `leis.mjs`, e existe porque lista que só perdoa nunca acusa nada.
 */
const EM_REPOUSO_VAZIO = {
  particulas:
    'dirigido por AÇÃO — os três controles são botões (queda · saída · estouro) e `createParticles()` ' +
    'nasce sem partícula nenhuma. Cobertura zero aqui é o comportamento certo.',
  satelites:
    'o satélite orbita a raio 74 (o próprio `watch` do espécime afirma isso) e a pose declarada ' +
    'olha para a ORIGEM a 120, onde a meia largura visível é ~51. No instante 0 o corpo está fora ' +
    'do quadro — medido: esfera envolvente centrada em x=75,4.',
  'buraco-negro':
    'nenhum objeto desenhável no grupo do espécime — a sonda conta 0 entre malha, pontos, linha e ' +
    'sprite. O que a cena desenha ali passa por caminho que o grupo não expõe.',
};

/**
 * Espécimes cujo quadro NÃO se repete entre duas montagens, com a razão medida.
 *
 * ⚠️ A §3 confere estes contra a medida pelo mesmo motivo da §4: instabilidade que SUMIR é tabela
 * velha, e tabela velha é como um oráculo passa a atestar o que não mede mais.
 */
const INSTAVEIS = {
  ceu: 'campo estelar — a distribuição é sorteada na montagem, então duas montagens diferem por construção',
  fotosfera: 'medido instável entre montagens em 2026-08-10; a causa não foi isolada e a lei não a afirma',
};

/**
 * A LINHA DE BASE — e ela existe porque a prova por mutação REFUTOU a §1 sozinha.
 *
 * ☠️ **Piso de cobertura não pega CAMADA que some, só corpo que some inteiro.** Medido: descartando
 * a superfície do planeta no fragmento (`discard` antes do `gl_FragColor` de `planet.js`), a
 * cobertura caiu de 48,2% para 18,4% e o pico de 222 para 73,7 — a casca de atmosfera sozinha
 * segura 18% do quadro, quase mil vezes o piso. A §1 passou verde com metade do planeta apagada,
 * que é exatamente o defeito caro desta base.
 *
 * ⭑ **O que fecha isso é comparar com o que já foi medido — e a linha de base é de ESCALARES, não
 * de imagens.** Um conjunto de PNGs precisa de tolerância perceptual, incha o repo e não se lê num
 * diff; três números por espécime cabem numa revisão, e regravá-los é um ato visível no `git`,
 * como já vale para toda constante calibrada aqui.
 *
 * ⚠️ **Regravar é DECISÃO, nunca conserto.** `--gravar` existe para quando a mudança de imagem foi
 * pretendida, e o corpo do commit é onde ela se justifica. Regravar para calar a lei é o mesmo que
 * baixar um limiar até o teste passar.
 */
const BASE_ARQ = join(fileURLToPath(new URL('.', import.meta.url)), 'pixel-baseline.json');
const GRAVAR = process.argv.includes('--gravar');
/** Folga relativa. O quadro é bit a bit reprodutível na mesma máquina; a folga é para versão de driver. */
const FOLGA = 0.02;

// ──────────────────────────────────────────────────────────────── o motor

let chrome = null;
let perfil = null;

/*
 * ⚠️ **A limpeza não pode falhar a lei.** O Chrome ainda escreve no perfil quando o `kill` volta, e
 * o `rmSync` de um diretório que acabou de ganhar arquivo estoura com `ENOTEMPTY` — visto. Um
 * oráculo que morre ARRUMANDO A CASA reporta defeito onde mediu tudo certo.
 */
function encerrar() {
  try {
    chrome?.kill();
  } catch {
    /* já morreu */
  }
  try {
    if (perfil) rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* temporário do sistema; o SO recolhe */
  }
}
process.on('exit', encerrar);
process.on('SIGINT', () => process.exit(130));

async function abrirNavegador(url) {
  perfil = mkdtempSync(join(tmpdir(), 'lei-pixel-'));
  chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${perfil}`,
      // Software puro: o mesmo pixel em qualquer máquina. Ver o cabeçalho.
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let erro = '';
  chrome.stderr.on('data', (d) => (erro += d));

  const arq = join(perfil, 'DevToolsActivePort');
  let porta = null;
  for (let i = 0; i < 150 && !porta; i += 1) {
    if (existsSync(arq)) porta = readFileSync(arq, 'utf8').split('\n')[0].trim() || null;
    if (!porta) await new Promise((r) => setTimeout(r, 100));
  }
  if (!porta) throw new Error(`o Chrome não abriu a porta de depuração.\n${erro}`);

  const alvo = await fetch(`http://127.0.0.1:${porta}/json/new?${url}`, { method: 'PUT' }).then((r) =>
    r.json()
  );
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let n = 0;
  const pendentes = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendentes.has(m.id)) {
      pendentes.get(m.id)(m);
      pendentes.delete(m.id);
    }
  });

  const avaliar = async (expressao) => {
    const resposta = await new Promise((res) => {
      const id = ++n;
      pendentes.set(id, res);
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression: expressao, awaitPromise: true, returnByValue: true },
        })
      );
    });
    const det = resposta.result?.exceptionDetails;
    if (det) throw new Error(det.exception?.description ?? det.text ?? 'erro na página');
    return resposta.result?.result?.value;
  };

  return { avaliar, fechar: () => ws.close() };
}

// ──────────────────────────────────────────────────────────────── a lei

console.log(`${C.forte}A LEI DO PIXEL${C.fim}  ${C.fraco}o quadro desenhado, na bancada${C.fim}\n`);

const pagina = `${BASE}/canvas.html`;
const viva = await fetch(pagina)
  .then((r) => r.ok)
  .catch(() => false);
if (!viva) {
  console.log(`${C.erro}sem resposta de ${pagina} — suba o ./serve.py primeiro.${C.fim}`);
  console.log(
    `  ${C.fraco}Um oráculo de pixel sem página é zero com cara de medida: ele não teria como ` +
      `distinguir "nada desenhou" de "nada foi desenhado porque nada abriu".${C.fim}`
  );
  process.exit(1);
}
if (!existsSync(CHROME)) {
  console.log(`${C.erro}Chrome não encontrado em ${CHROME}${C.fim} — aponte CHROME_BIN.`);
  process.exit(1);
}

const { avaliar, fechar } = await abrirNavegador(pagina);

for (let i = 0; i < 150; i += 1) {
  if ((await avaliar('typeof window.bancada')) === 'object') break;
  await new Promise((r) => setTimeout(r, 100));
}
if ((await avaliar('typeof window.bancada')) !== 'object') {
  console.log(`${C.erro}a bancada não expôs \`window.bancada\`${C.fim} — a sonda de pixel sumiu.`);
  fechar();
  process.exit(1);
}

const renderizador = await avaliar(`(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return gl ? (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'webgl2') : null;
})()`);
if (!renderizador) {
  console.log(`${C.erro}sem WebGL no navegador headless${C.fim} — nada a medir.`);
  fechar();
  process.exit(1);
}
console.log(`  ${C.fraco}${renderizador}${C.fim}\n`);

const especimes = await avaliar('window.bancada.especimes()');
const medir = (id, extra = '') =>
  avaliar(`window.bancada.medir({ id: ${JSON.stringify(id)}, quadros: ${QUADROS}${extra} })`);

/** Duas medidas por espécime: a segunda é a testemunha da §3. */
const medidas = new Map();
for (const e of especimes) medidas.set(e.id, [await medir(e.id), await medir(e.id)]);
fechar();

// ── §1
console.log(`${C.forte}§1  A FEIÇÃO EXISTE${C.fim}  ${C.fraco}toda pele desenha no quadro${C.fim}`);
const mudos = [...medidas]
  .filter(([id, [m]]) => !(id in EM_REPOUSO_VAZIO) && m.cobertura < PISO_COBERTURA)
  .map(([id, [m]]) => `${id} (${(m.cobertura * 100).toFixed(4)}%, ${m.visiveis} objeto(s))`);
checar(
  '§1',
  mudos.length === 0,
  `os ${especimes.length - Object.keys(EM_REPOUSO_VAZIO).length} espécimes que devem desenhar ` +
    `passam de ${(PISO_COBERTURA * 100).toFixed(2)}% do quadro` +
    (mudos.length
      ? ` — MUDOS: ${mudos.join(', ')}. Ou a feição apagou, ou o espécime passou a depender de ` +
        `ação/pose e a razão pertence a EM_REPOUSO_VAZIO.`
      : '')
);

// ── §2
console.log(`\n${C.forte}§2  NADA LAVA O QUADRO${C.fim}  ${C.fraco}o brilho não vira mancha branca${C.fim}`);
const lavados = [...medidas]
  .filter(([, [m]]) => m.claros > TETO_CLAROS)
  .map(([id, [m]]) => `${id} (${(m.claros * 100).toFixed(2)}%)`);
checar(
  '§2',
  lavados.length === 0,
  `nenhum espécime passa de ${(TETO_CLAROS * 100).toFixed(0)}% do quadro acima de 200 de luminância` +
    (lavados.length
      ? ` — LAVADOS: ${lavados.join(', ')}. Brilho que cobre o quadro apaga a FORMA, e forma é o que ` +
        `distingue um corpo de outro.`
      : '')
);

// ── §3
console.log(
  `\n${C.forte}§3  O QUADRO SE REPETE${C.fim}  ${C.fraco}mesma pose, mesmo instante, mesmo pixel${C.fim}`
);
const variaveis = [...medidas].filter(([, [a, b]]) => a.hash !== b.hash).map(([id]) => id);
const inesperados = variaveis.filter((id) => !(id in INSTAVEIS));
checar(
  '§3',
  inesperados.length === 0,
  `duas montagens do mesmo pedido devolvem o mesmo quadro` +
    (inesperados.length
      ? ` — VARIARAM sem razão declarada: ${inesperados.join(', ')}. Quadro que não se repete não ` +
        `sustenta comparação nenhuma, e todo A/B feito sobre ele mediu ruído.`
      : '')
);

// ── §4
console.log(
  `\n${C.forte}§4  AS TABELAS SÃO CONFERIDAS${C.fim}  ${C.fraco}exceção que sumiu é tabela velha${C.fim}`
);
const ressuscitados = Object.keys(EM_REPOUSO_VAZIO).filter(
  (id) => medidas.has(id) && medidas.get(id)[0].cobertura >= PISO_COBERTURA
);
const estabilizados = Object.keys(INSTAVEIS).filter(
  (id) => medidas.has(id) && medidas.get(id)[0].hash === medidas.get(id)[1].hash
);
const fantasmas = [...Object.keys(EM_REPOUSO_VAZIO), ...Object.keys(INSTAVEIS)].filter(
  (id) => !medidas.has(id)
);
checar(
  '§4a',
  ressuscitados.length === 0,
  `os ${Object.keys(EM_REPOUSO_VAZIO).length} declarados vazios em repouso continuam vazios` +
    (ressuscitados.length
      ? ` — ${ressuscitados.join(', ')} VOLTARAM a desenhar. Tire da tabela: uma dispensa que não ` +
        `vale mais é um espécime sem guarda nenhum.`
      : '')
);
checar(
  '§4b',
  estabilizados.length === 0,
  `os ${Object.keys(INSTAVEIS).length} declarados instáveis continuam instáveis` +
    (estabilizados.length
      ? ` — ${estabilizados.join(', ')} passaram a se repetir. Tire da tabela para a §3 voltar a ` +
        `guardá-los.`
      : '')
);
checar(
  '§4c',
  fantasmas.length === 0,
  `toda entrada das tabelas nomeia um espécime que existe` +
    (fantasmas.length ? ` — FANTASMAS: ${fantasmas.join(', ')}` : '')
);

// ── §5
console.log(
  `\n${C.forte}§5  O QUADRO É O QUE JÁ FOI MEDIDO${C.fim}  ${C.fraco}camada que some não passa${C.fim}`
);
if (GRAVAR) {
  const novo = Object.fromEntries(
    [...medidas].map(([id, [m]]) => [id, { cobertura: m.cobertura, pico: m.pico, claros: m.claros }])
  );
  writeFileSync(
    BASE_ARQ,
    `${JSON.stringify({ renderizador, lado: medidas.values().next().value[0].lado, quadros: QUADROS, especimes: novo }, null, 2)}\n`
  );
  console.log(`  ${C.fraco}gravado: ${BASE_ARQ} (${Object.keys(novo).length} espécimes)${C.fim}`);
} else if (!existsSync(BASE_ARQ)) {
  checar('§5', false, `não há linha de base em ${BASE_ARQ} — grave com \`make pixel-gravar\`.`);
} else {
  const base = JSON.parse(readFileSync(BASE_ARQ, 'utf8'));
  const fugiram = [];
  const novos = [];
  for (const [id, [m]] of medidas) {
    if (id in INSTAVEIS) continue;
    const b = base.especimes[id];
    if (!b) {
      novos.push(id);
      continue;
    }
    for (const [chave, agora] of [
      ['cobertura', m.cobertura],
      ['pico', m.pico],
    ]) {
      const antes = b[chave];
      const desvio = antes === 0 ? (agora === 0 ? 0 : 1) : Math.abs(agora - antes) / antes;
      if (desvio > FOLGA) {
        fugiram.push(`${id}.${chave}: ${Number(antes).toFixed(4)} → ${Number(agora).toFixed(4)} (${(desvio * 100).toFixed(0)}%)`);
      }
    }
  }
  checar(
    '§5a',
    fugiram.length === 0,
    `todo espécime está a menos de ${(FOLGA * 100).toFixed(0)}% do que já foi medido` +
      (fugiram.length
        ? ` — FUGIRAM: ${fugiram.join(' · ')}. Se a mudança foi pretendida, \`make pixel-gravar\` e ` +
          `justifique no corpo do commit; se não foi, uma camada parou de desenhar.`
        : '')
  );
  checar(
    '§5b',
    novos.length === 0,
    `todo espécime da bancada tem linha de base` +
      (novos.length
        ? ` — SEM BASE: ${novos.join(', ')}. Espécime novo sem número gravado não é guardado por ` +
          `esta lei, e o silêncio pareceria cobertura.`
        : '')
  );
}

// ── censo (medida, não lei)
console.log(`\n${C.forte}CENSO${C.fim}  ${C.fraco}o que o quadro mostrou — medida, não lei${C.fim}`);
const desenham = [...medidas].filter(([, [m]]) => m.cobertura >= PISO_COBERTURA);
const cob = desenham.map(([, [m]]) => m.cobertura).sort((a, b) => a - b);
console.log(
  `  ${C.fraco}${desenham.length}/${especimes.length} desenham · cobertura de ` +
    `${(cob[0] * 100).toFixed(3)}% a ${(cob[cob.length - 1] * 100).toFixed(1)}% · ` +
    `mais claro ${(Math.max(...[...medidas].map(([, [m]]) => m.claros)) * 100).toFixed(2)}%${C.fim}`
);

console.log(
  falhas === 0
    ? `\n${C.ok}✓ a lei vale${C.fim}  ${C.fraco}o céu desenha, não lava, e se repete${C.fim}`
    : `\n${C.erro}✗ ${falhas} falha(s)${C.fim}`
);
process.exit(falhas === 0 ? 0 : 1);
