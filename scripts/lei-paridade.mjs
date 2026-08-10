#!/usr/bin/env node
/**
 * A PARIDADE DE SWAPS NÃO PODE DECIDIR ONDE A PROFUNDIDADE É GRAVADA. Este script PROVA isso.
 *
 *     node scripts/lei-paridade.mjs      # sai 0 se a lei vale para TODA cena de `CENAS`
 *
 * ## A lei, e o defeito que ela fecha
 *
 * `EffectComposer` mantém um par `readBuffer`/`writeBuffer` que **sobrevive ao fim do quadro** — só
 * o construtor e o `reset()` o atribuem — e **pula o passe desabilitado** (`if (pass.enabled ===
 * false) continue`). Logo, quem decide em qual alvo o `RenderPass` grava é a PARIDADE acumulada dos
 * passes que trocam, e ela muda quando uma cena liga ou desliga um passe.
 *
 * A cena AGENTE liga a lente e a UNIVERSO a desliga (`CENAS[*].passes.lensing`). Com a lente fora
 * sobra um passe que troca, o par inverte a cada quadro, e a volta ao AGENTE em paridade ímpar põe
 * a lente escrevendo no mesmo alvo cuja `depthTexture` ela amostra: **feedback loop**, indefinido em
 * WebGL, PRETO na tela, sem erro nenhum. É o relato *"ao voltar da cena universo para agente, a
 * cena agente volta toda preta"* — e a intermitência é a paridade, que conta QUADROS.
 *
 * ⚠️ **Renderizar duas vezes na troca ESCONDE a paridade em vez de removê-la**, e ela volta no dia
 * em que alguém acrescentar um passe. Por isso a conferência é automática e não é memória.
 *
 * ## O caminho: o MOTOR DE SWAP É O VENDORIZADO, não uma cópia dele
 *
 * ⭑ **A regra de swap não é transcrita aqui.** O script instancia o `EffectComposer` REAL de
 * `vendor/jsm/postprocessing/` com um renderer de mentira (nenhuma chamada de GL acontece: os
 * passes deste teste só anotam os buffers que receberam) e deixa o laço vendorizado fazer o
 * pingue-pongue. Transcrever `swapBuffers` seria criar uma segunda fonte da verdade livre para
 * divergir em silêncio — o preço que os oráculos de GLSL desta base pagam à mão e que aqui não
 * há razão para pagar.
 *
 * O que vem do `src/` de verdade, sem transcrição:
 *
 * | fato | de onde |
 * |---|---|
 * | a ORDEM da cadeia | os `composer.addPass(...)` recortados do `scene.js` |
 * | quem TROCA | `this.needsSwap` declarado nos módulos vendorizados de cada passe |
 * | quais cenas existem, e o que cada uma liga | o bloco `const CENAS = …` recortado do `scene.js` |
 * | quem carrega a profundidade | a linha que anexa `depthTexture` no `scene.js` |
 *
 * Nenhum passo tem tabela de reserva: recorte que falhar **mata o script**, porque tabela de
 * reserva é a transcrição voltando pela porta dos fundos.
 *
 * ## As cinco provas
 *
 * 1. **A PROFUNDIDADE MORA EM UM ALVO SÓ.** Anexá-la aos dois já apagou a cena duas vezes por
 *    feedback loop, e `renderTarget2 = renderTarget1.clone()` copia `depthTexture` por REFERÊNCIA —
 *    é o jeito de errar isto sem querer.
 * 2. **TODO `composer.render()` do `src/` passa pelo fixador.** Uma chamada solta reintroduz o
 *    defeito para o caminho dela, e as medidas (`mesmoQuadro`, `renderCost`) são caminhos.
 * 3. **O FIXADOR fixa os DOIS lados do par**, antes de renderizar. Fixar só a leitura deixa a
 *    escrita apontando para o mesmo alvo em metade dos quadros.
 * 4. **A SIMULAÇÃO, cena por cena, no motor vendorizado:** o `RenderPass` grava no alvo que carrega
 *    a profundidade, e a lente — quando ligada — lê esse alvo e **não escreve nele**.
 * 5. **A ESTABILIDADE ENTRE QUADROS:** três quadros seguidos da mesma cena, e a cena inteira
 *    percorrida em toda ORDEM de troca de duas cenas, saem com o mesmo veredito. É esta prova que
 *    pega a paridade, porque o defeito só aparece no quadro N+1 de outra cena.
 *
 * ## O que ele NÃO prova
 *
 * - **Nada sobre o pixel.** Que a tela esteja preta, que a lente distorça, que a profundidade
 *   contenha a cena: tudo isso é quadro, e quadro se mede com `spatia.cena().composicao` na tela.
 *   Este script prova o ENCAMINHAMENTO dos buffers, que é a estrutura por baixo do sintoma.
 * - **A simulação (§4/§5) roda SEMPRE com o fixador**, porque ela mede se fixar BASTA para esta
 *   cadeia — não se o `scene.js` fixa. Quem prova que o fixador existe e alcança todo caminho são
 *   §2 e §3, e tirar as duas linhas do fixador derruba §3, não §4. As duas metades são necessárias:
 *   §3 sozinha atesta um fixador que poderia ser insuficiente, §4 sozinha atesta uma cadeia cujo
 *   fixador ninguém chama.
 * - **Nada sobre as outras duas causas de "tela preta"** — câmera no vazio e laço parado. Elas têm
 *   sondas próprias (`spatia.universo.ancora()`, `requestAnimationFrame`), e confundi-las com esta
 *   é o que faz alguém consertar a errada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ☠️ `RAIZ` sai de `import.meta.url` e NUNCA de argumento ou caminho absoluto: com a raiz vinda de
// fora, o oráculo roda sobre a cópia ORIGINAL enquanto a mutação está noutra árvore, e passa
// atestando guarda que a cópia mutada não tem. Já aconteceu com três leis desta base.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENE_JS = path.join(RAIZ, 'src', 'space', 'scene.js');
const VENDOR = path.join(RAIZ, 'vendor', 'jsm', 'postprocessing');

const falhas = [];
const nota = (secao, texto) => falhas.push({ secao, texto });
const morre = (porque) => {
  console.error(`\x1b[31m✗ lei-paridade não pôde rodar\x1b[0m — ${porque}`);
  process.exit(1);
};

// ───────────────────────────────────────────── um leitor que não confunde comentário com código

/** Marca com 1 todo byte que não é código — comentário, string, template. */
function mascara(texto) {
  const m = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length;) {
    const dois = texto.slice(i, i + 2);
    let fim = -1;
    if (dois === '//') fim = texto.indexOf('\n', i) + 1 || texto.length;
    else if (dois === '/*') fim = texto.indexOf('*/', i + 2) + 2 || texto.length;
    else if (texto[i] === '"' || texto[i] === "'" || texto[i] === '`') {
      let j = i + 1;
      while (j < texto.length && texto[j] !== texto[i]) j += texto[j] === '\\' ? 2 : 1;
      fim = j + 1;
    }
    if (fim > i) {
      for (let k = i; k < fim && k < m.length; k++) m[k] = 1;
      i = fim;
    } else i++;
  }
  return m;
}

/** O código sem comentário nem literal — para procurar CHAMADA sem casar a prosa que a explica. */
const soCodigo = (texto) => {
  const m = mascara(texto);
  return [...texto].map((c, i) => (m[i] ? (c === '\n' ? '\n' : ' ') : c)).join('');
};

/** Recorta `{…}` balanceado a partir de um índice, ignorando chave em comentário ou string. */
function recorteBalanceado(texto, deIndice) {
  const m = mascara(texto);
  const abre = texto.indexOf('{', deIndice);
  if (abre < 0) return null;
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    if (m[i]) continue;
    if (texto[i] === '{') nivel++;
    else if (texto[i] === '}' && --nivel === 0) return texto.slice(abre, i + 1);
  }
  return null;
}

const fonteCena = fs.readFileSync(SCENE_JS, 'utf8');
const codigoCena = soCodigo(fonteCena);

// ─────────────────────────────────────────────────────── o que a cadeia É, lido do `scene.js`

/** Os `addPass` na ordem em que o `scene.js` os declara. */
const cadeiaDeclarada = [...codigoCena.matchAll(/composer\.addPass\(\s*([^)]*(?:\([^)]*\))?[^)]*)\)/g)].map(
  (m) => m[1].trim()
);
if (cadeiaDeclarada.length < 2) morre(`não achei os composer.addPass(...) em ${SCENE_JS}`);

/**
 * O NOME DA CLASSE de cada passe. Sem fallback: o que não resolver mata o script.
 *
 * Três formas cobrem a cadeia de hoje, e cada uma é uma leitura do código real:
 * `new X(...)` diz a classe; um identificador nu é resolvido pelo `const <id> = new X(` do próprio
 * `scene.js`; e `obj.prop` é resolvido no módulo de onde `obj` vem, pelo `const <prop> = new X(`.
 */
function classeDoPasse(expr) {
  const direto = expr.match(/^new\s+(\w+)\s*\(/);
  if (direto) return direto[1];
  const nu = expr.match(/^(\w+)$/);
  if (nu) {
    const achado = codigoCena.match(new RegExp(`const\\s+${nu[1]}\\s*=\\s*new\\s+(\\w+)\\s*\\(`));
    if (achado) return achado[1];
  }
  const prop = expr.match(/^(\w+)\.(\w+)$/);
  if (prop) {
    const fabrica = codigoCena.match(new RegExp(`const\\s+${prop[1]}\\s*=\\s*(\\w+)\\(`));
    // ⚠️ O especificador do `import` é uma STRING, e `soCodigo` apaga string — a busca do CAMINHO
    // tem de ser na fonte crua. O nome importado continua sendo lido do código.
    const importa =
      fabrica &&
      fonteCena.match(new RegExp(`import\\s*\\{[^}]*\\b${fabrica[1]}\\b[^}]*\\}\\s*from\\s*'([^']+)'`));
    if (importa) {
      const alvo = path.resolve(path.dirname(SCENE_JS), importa[1]);
      if (fs.existsSync(alvo)) {
        const achado = soCodigo(fs.readFileSync(alvo, 'utf8')).match(
          new RegExp(`const\\s+${prop[2]}\\s*=\\s*new\\s+(\\w+)\\s*\\(`)
        );
        if (achado) return achado[1];
      }
    }
  }
  return morre(`não sei que classe é o passe "${expr}" — resolva-o aqui em vez de supor`);
}

/**
 * `needsSwap` COMO O VENDORIZADO O DECLARA. A base (`Pass.js`) é lida, não lembrada: se ela deixar
 * de declarar `true`, o script morre em vez de herdar um default de memória.
 */
const baseDoPasse = fs.readFileSync(path.join(VENDOR, 'Pass.js'), 'utf8');
if (!/this\.needsSwap\s*=\s*true/.test(baseDoPasse)) {
  morre('Pass.js não declara mais `needsSwap = true` — o default deste oráculo era herdado dele');
}
function trocaBuffers(classe) {
  const arquivo = path.join(VENDOR, `${classe}.js`);
  if (!fs.existsSync(arquivo)) morre(`${classe} não existe em vendor/jsm/postprocessing/`);
  const src = soCodigo(fs.readFileSync(arquivo, 'utf8'));
  if (/this\.needsSwap\s*=\s*false/.test(src)) return false;
  if (/this\.needsSwap\s*=\s*true/.test(src)) return true;
  return true; // herda a base, que já foi conferida acima
}

const CADEIA = cadeiaDeclarada.map((expr) => {
  const classe = classeDoPasse(expr);
  return { expr, classe, troca: trocaBuffers(classe) };
});

// ────────────────────────────────────────────────────── as cenas, e o que cada uma liga/desliga

const iCenas = codigoCena.indexOf('const CENAS');
if (iCenas < 0) morre('não achei `const CENAS` no scene.js');
const blocoCenas = recorteBalanceado(fonteCena, iCenas);
let CENAS;
try {
  // As arrows (`chegada`, `aoEntrar`) não são CHAMADAS — só declaradas —, então as variáveis livres
  // da fábrica nunca são avaliadas e o literal fecha sozinho.
  CENAS = new Function(`return ${blocoCenas.replace(/Object\.freeze/g, '')}`)();
} catch (e) {
  morre(`o bloco CENAS não avaliou como literal: ${e.message}`);
}
const nomesDeCena = Object.keys(CENAS);
if (!nomesDeCena.length) morre('CENAS saiu vazia do recorte');

/** Qual passe da cadeia cada chave de `passes` liga. `lensing` é o único hoje, e por nome. */
const passeDaChave = (chave) => CADEIA.findIndex((p) => p.expr.toLowerCase().includes(chave.toLowerCase()));

// ───────────────────────────────────────── §1 · a profundidade mora em UM alvo só

// ⚠️ `=(?!=)` e não `=`: a sonda `composicao` COMPARA `depthTexture` para dizer onde ela está, e
// uma comparação lida como atribuição faria esta lei acusar dois alvos onde há um.
const anexos = [...codigoCena.matchAll(/composer\.(renderTarget[12])\.depthTexture\s*=(?!=)/g)].map(
  (m) => m[1]
);
if (anexos.length === 0) nota('§1', 'nenhum alvo recebe `depthTexture` — a lente lê o quê?');
if (new Set(anexos).size > 1) {
  nota(
    '§1',
    `a profundidade é anexada a ${new Set(anexos).size} alvos (${[...new Set(anexos)]}) — ` +
      'uma textura que é entrada e saída ao mesmo tempo é feedback loop, e a cena sai PRETA'
  );
}
const ALVO_DA_PROFUNDIDADE = anexos[0] ?? 'renderTarget2';

// ───────────────────────────────────────── §2/§3 · o fixador existe e é o único caminho

const iFixador = codigoCena.indexOf('function desenharQuadro');
if (iFixador < 0) {
  nota(
    '§2',
    'não existe `desenharQuadro` — sem um fixador do par, a paridade volta a decidir ' +
      'onde a profundidade é gravada'
  );
} else {
  const corpo = recorteBalanceado(fonteCena, iFixador) ?? '';
  const codigoDoCorpo = soCodigo(corpo);
  const fixaLeitura = /composer\.readBuffer\s*=\s*composer\.renderTarget[12]/.test(codigoDoCorpo);
  const fixaEscrita = /composer\.writeBuffer\s*=\s*composer\.renderTarget[12]/.test(codigoDoCorpo);
  if (!fixaLeitura) nota('§3', '`desenharQuadro` não fixa `readBuffer` — é ele que o RenderPass grava');
  if (!fixaEscrita)
    nota(
      '§3',
      '`desenharQuadro` não fixa `writeBuffer` — fixar meio par deixa a ' +
        'escrita da lente sorteada pela paridade'
    );
  const lidoEm = codigoDoCorpo.match(/composer\.readBuffer\s*=\s*composer\.(renderTarget[12])/)?.[1];
  if (lidoEm && lidoEm !== ALVO_DA_PROFUNDIDADE) {
    nota(
      '§3',
      `o fixador manda o RenderPass gravar em ${lidoEm}, e a profundidade está em ` +
        `${ALVO_DA_PROFUNDIDADE} — a lente leria um buffer vazio`
    );
  }
  // A chamada real tem de estar DENTRO do fixador, e ser a única do src/.
  if (!/composer\.render\(\)/.test(codigoDoCorpo)) {
    nota('§2', '`desenharQuadro` não chama `composer.render()` — o fixador não desenha nada');
  }
}

const SRC = path.join(RAIZ, 'src');
const varrer = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? varrer(path.join(dir, e.name))
        : e.name.endsWith('.js')
          ? [path.join(dir, e.name)]
          : []
    );
// ⚠️ A faixa do fixador é medida da CHAVE que abre o corpo, não do `function`: somar o tamanho do
// bloco ao índice da palavra encurta a faixa e deixa a última linha do corpo de fora — que é
// justamente onde mora o `composer.render()`.
const abreFixador = iFixador >= 0 ? fonteCena.indexOf('{', iFixador) : -1;
const fechaFixador =
  abreFixador >= 0 ? abreFixador + (recorteBalanceado(fonteCena, iFixador)?.length ?? 0) : -1;
for (const arquivo of varrer(SRC)) {
  const codigo = soCodigo(fs.readFileSync(arquivo, 'utf8'));
  for (const m of codigo.matchAll(/composer\.render\(/g)) {
    const dentroDoFixador = arquivo === SCENE_JS && m.index > abreFixador && m.index < fechaFixador;
    if (!dentroDoFixador) {
      const linha = codigo.slice(0, m.index).split('\n').length;
      nota(
        '§2',
        `${path.relative(RAIZ, arquivo)}:${linha} chama \`composer.render()\` por fora do ` +
          'fixador — esse caminho volta a depender da paridade'
      );
    }
  }
}

// ───────────────────────────── §4/§5 · a simulação, no motor de swap VENDORIZADO

const { EffectComposer } = await import(path.join(VENDOR, 'EffectComposer.js'));

/** Um renderer de mentira. Nenhuma chamada de GL acontece — os passes só anotam o que receberam. */
const rendererFalso = {
  getPixelRatio: () => 1,
  getSize: (v) => {
    v.x = 800;
    v.y = 600;
    return v;
  },
  getRenderTarget: () => null,
  setRenderTarget: () => {},
};

/** Um passe que não desenha: ele registra em qual alvo teria escrito e de qual teria lido. */
function passeDeMentira({ classe, troca }, diario) {
  return {
    classe,
    enabled: true,
    needsSwap: troca,
    renderToScreen: false,
    setSize() {},
    render(_r, writeBuffer, readBuffer) {
      diario.push({ classe, escreve: writeBuffer, le: readBuffer });
    },
  };
}

/**
 * Roda `quadros` quadros de uma sequência de cenas no composer REAL e devolve o veredito por
 * quadro. `fixar` reproduz o que `desenharQuadro` faz antes de cada `render`.
 */
function simular(sequencia, { fixar }) {
  const composer = new EffectComposer(rendererFalso);
  composer.renderToScreen = false;
  const iLente = passeDaChave('lensing');
  const diarios = [];
  const passes = CADEIA.map((p) => {
    const diario = [];
    diarios.push(diario);
    return passeDeMentira(p, diario);
  });
  for (const p of passes) composer.addPass(p);
  const profundidade = composer[ALVO_DA_PROFUNDIDADE];
  const vereditos = [];
  for (const { cena, quadros } of sequencia) {
    for (const [chave, ligado] of Object.entries(CENAS[cena].passes ?? {})) {
      const i = passeDaChave(chave);
      if (i < 0) morre(`a cena "${cena}" liga/desliga "${chave}", que não é passe nenhum da cadeia`);
      passes[i].enabled = ligado;
    }
    for (let q = 0; q < quadros; q++) {
      for (const d of diarios) d.length = 0;
      if (fixar) {
        composer.readBuffer = composer[ALVO_DA_PROFUNDIDADE];
        composer.writeBuffer =
          composer[ALVO_DA_PROFUNDIDADE === 'renderTarget2' ? 'renderTarget1' : 'renderTarget2'];
      }
      composer.render(0);
      const doRender = diarios[CADEIA.findIndex((p) => p.classe === 'RenderPass')]?.[0];
      const daLente = iLente >= 0 && passes[iLente].enabled ? diarios[iLente][0] : null;
      vereditos.push({
        cena,
        quadro: q,
        // O `RenderPass` desenha no `readBuffer` (`needsSwap: false`), e é lá que a profundidade vai.
        gravaEm: doRender?.le === profundidade ? 'profundidade' : 'o outro alvo',
        leDaProfundidade: daLente ? daLente.le === profundidade : null,
        realimenta: daLente ? daLente.escreve === profundidade : false,
      });
    }
  }
  return vereditos;
}

/** As sequências que exercitam a paridade: uma cena só, e toda ORDEM de troca entre duas cenas. */
const sequencias = [];
for (const cena of nomesDeCena) sequencias.push([{ cena, quadros: 3 }]);
for (const a of nomesDeCena) {
  for (const b of nomesDeCena) {
    if (a === b) continue;
    // 1 e 2 quadros na cena de origem: é a PARIDADE que se está exercitando, não a duração.
    for (const quadros of [1, 2, 3]) {
      sequencias.push([
        { cena: a, quadros },
        { cena: b, quadros: 2 },
      ]);
    }
  }
}

let simulados = 0;
for (const seq of sequencias) {
  const rotulo = seq.map((s) => `${s.cena}×${s.quadros}`).join(' → ');
  for (const v of simular(seq, { fixar: true })) {
    simulados++;
    if (v.gravaEm !== 'profundidade') {
      nota(
        '§4',
        `[${rotulo}] quadro ${v.quadro} de "${v.cena}": o RenderPass grava em ${v.gravaEm}, ` +
          'e a lente leria profundidade vazia'
      );
    }
    if (v.leDaProfundidade === false) {
      nota(
        '§4',
        `[${rotulo}] quadro ${v.quadro} de "${v.cena}": a lente NÃO lê o alvo que carrega a profundidade`
      );
    }
    if (v.realimenta) {
      nota(
        '§5',
        `[${rotulo}] quadro ${v.quadro} de "${v.cena}": a lente escreve no alvo cuja ` +
          'depthTexture ela amostra — feedback loop, e a tela sai PRETA'
      );
    }
  }
}

/**
 * ⭑ A CONTRAPROVA, e ela é o que torna esta lei uma guarda em vez de um teste verde: SEM o fixador,
 * a mesma simulação tem de encontrar o defeito. Uma lei que passa dos dois lados não guarda nada.
 */
const semFixador = sequencias.flatMap((seq) => simular(seq, { fixar: false }));
const defeitosSemFixador = semFixador.filter((v) => v.realimenta || v.gravaEm !== 'profundidade');
if (defeitosSemFixador.length === 0) {
  nota(
    '§5',
    'sem o fixador a simulação NÃO acha defeito nenhum — ou a cadeia deixou de ter ' +
      'paridade ímpar em alguma cena, ou esta lei parou de exercitar o que diz exercitar'
  );
}

// ───────────────────────────────────────────────────────────────────────────── o veredito

const cabecalho =
  `\x1b[1mA PARIDADE DE SWAPS\x1b[0m  ${CADEIA.length} passes · ${nomesDeCena.length} cenas · ` +
  `${simulados} quadros simulados · profundidade em ${ALVO_DA_PROFUNDIDADE}`;
console.log(cabecalho);
console.log(`  cadeia: ${CADEIA.map((p) => `${p.classe}${p.troca ? '↔' : ''}`).join(' → ')}   (↔ = troca)`);
for (const cena of nomesDeCena) {
  const ligados = CADEIA.filter((p, i) => {
    const chave = Object.keys(CENAS[cena].passes ?? {}).find((k) => passeDaChave(k) === i);
    return chave ? CENAS[cena].passes[chave] : true;
  });
  const trocas = ligados.filter((p) => p.troca).length;
  console.log(
    `  ${cena.padEnd(10)} ${ligados.length} passes ligados · ${trocas} trocas ` +
      `(${trocas % 2 === 0 ? 'PAR' : 'ÍMPAR'})`
  );
}
console.log(`  sem o fixador: ${defeitosSemFixador.length} quadros defeituosos — é o que a lei impede`);

if (falhas.length) {
  console.log(`\n\x1b[31m✗ ${falhas.length} FALHA(S)\x1b[0m`);
  for (const f of falhas) console.log(`  \x1b[31m${f.secao}\x1b[0m ${f.texto}`);
  process.exit(1);
}
console.log('\n\x1b[32m✓ a paridade não decide onde a profundidade é gravada\x1b[0m');
