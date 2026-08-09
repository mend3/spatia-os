#!/usr/bin/env node
/**
 * A LEI DA LISTA DE FONTES — a vista tem teto, o teto NÃO corta a lista, e o corte é PUBLICADO.
 *
 *     node scripts/lei-fontes.mjs        # sai 0 quando as leis valem
 *
 * As 24 linhas do caso normal não são amostra: são `MEMORY_LIMIT` + `MAX_RESULTS` × provedores com
 * chave, por construção. Sem teto elas empilham sobre o disco, e o que passa da altura do palco
 * não rolava — **sumia**, porque `.widget-body` é `overflow: hidden`. Sumir é o pior desfecho
 * desta base: a tela deixa de afirmar sem acusar.
 *
 * ☠️ **E aqui sumir custa mais do que espaço.** `[n]` é contrato com o prompt (`agent.sources_of`,
 * `EVENTS.md`): a numeração que o modelo cita é a mesma que a HUD mostra. Uma lista truncada
 * deixaria citações escritas na resposta apontando para linhas que não existem — e o desenho de
 * citação inválida (`hud/answer.js`, `citeMark`) marcaria como INVENTADA uma fonte que é real.
 * Por isso a lei tem duas metades, e as duas são obrigatórias:
 *
 * | § | a lei | o que ela impede |
 * |---|---|---|
 * | 1 | a vista tem TETO declarado | 24 linhas empilhando sobre o disco outra vez |
 * | 2 | o que passa do teto ROLA | corte sem barra, que lê como bug e não como «tem mais abaixo» |
 * | 3 | rolagem e PONTEIRO andam em par | barra de enfeite (o `#hud` é `pointer-events: none`) |
 * | 4 | o scrim é GRADIENTE, nunca fundo opaco | a refutação medida de `hud/yield.js` |
 * | 5 | a linha declara `line-height` | o teto virar estimativa em vez de conta |
 * | 6 | a aritmética fecha: o teto mostra linha | teto que não mostra nada com cara de teto |
 * | 7 | o TOTAL é publicado e fica grudado | truncamento ler como «isto é tudo o que existe» |
 * | 8 | nada é truncado em JS | apagar o destino de uma citação já escrita |
 * | 9 | o alvo de rolagem é exato, e ZERO é zero | rolagem que se move sozinha a cada clique |
 * | 10 | a citação alcança a linha, sem `scrollIntoView` | rolar o `.widget-body`, que é `hidden` |
 * | 11 | a linha não ENCOLHE dentro do teto | espremer em vez de transbordar: nada a rolar |
 *
 * ## Por que a RAIZ sai de `import.meta.url` e só dela
 *
 * ☠️ Raiz por argumento, variável de ambiente ou caminho de máquina faz o oráculo ler a árvore que
 * lhe apontarem — e aí ele passa sobre uma CÓPIA MUTADA, atestando guarda que a cópia não tem.
 * Derivada do próprio arquivo, copiar a árvore, quebrar uma linha e rodar o oráculo de lá fica
 * VERMELHO. É o que torna a prova de reprovação possível.
 *
 * ## Por que a §1 varre a CASCATA, e não procura uma linha
 *
 * ⚠️ Achar `max-height` no bloco não prova nada: uma regra POSTERIOR que também case `.sources`
 * pode devolver `none` e o teto desaparece sem ninguém tocar no bloco. A varredura junta TODAS as
 * regras cujo último composto casa a caixa — em qualquer `@media`, em qualquer ordem — e duas
 * regras disputando a mesma propriedade **acusam**, porque aí quem decide é a cascata e este
 * oráculo não adivinha cascata.
 *
 * ## O que ele NÃO prova
 *
 * Nada sobre a tela: que 7 linhas caibam de fato, que a barra apareça no Chrome com
 * `scrollbar-color`, que o cabeçalho grudado não tape a primeira linha em algum DPR. A conta da §6
 * é sobre as constantes DECLARADAS numa janela de referência; a tela só `spatia.hud().fontes`
 * responde, e é medida, não lei.
 */
import { readFileSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

/** A janela de referência da base (§6 do `HANDOFF.md`: buffer 2582×1484 · DPR 2). */
const ALTURA_DE_REFERENCIA = 742;

// ═══════════════════════════════════════════════════ o CSS, lido como cascata
const html = readFileSync(`${RAIZ}/index.html`, 'utf8');
const estilos = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
if (!estilos.length) {
  console.error('\x1b[31m✗ nenhum <style> em index.html\x1b[0m — não há o que auditar, e passar seria pior.');
  process.exit(1);
}
const css = estilos.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

/** Regras em ORDEM DE DOCUMENTO, com o contexto de `@media` preservado. */
function regrasDe(texto) {
  const saida = [];
  const contexto = [];
  let buffer = '';
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') {
      const seletor = buffer.trim();
      buffer = '';
      if (seletor.startsWith('@')) { contexto.push(seletor); continue; }
      let j = i + 1;
      let profundidade = 1;
      while (j < texto.length && profundidade > 0) {
        if (texto[j] === '{') profundidade++;
        else if (texto[j] === '}') profundidade--;
        j++;
      }
      saida.push({ seletor, corpo: texto.slice(i + 1, j - 1), contexto: contexto.join(' ') });
      i = j - 1;
      continue;
    }
    if (c === '}') { contexto.pop(); buffer = ''; continue; }
    buffer += c;
  }
  return saida;
}

const regras = regrasDe(css);

/** As declarações de uma regra, `propriedade → valor`, a última ganhando. */
function declaracoes(corpo) {
  const mapa = new Map();
  for (const parte of corpo.split(';')) {
    const i = parte.indexOf(':');
    if (i < 0) continue;
    mapa.set(parte.slice(0, i).trim(), parte.slice(i + 1).trim());
  }
  return mapa;
}

/** O último composto do seletor — é ele que diz sobre QUE elemento a regra fala. */
const ultimoComposto = (sel) => sel.split(/[\s>+~]+/).filter(Boolean).pop() || '';

/** Toda regra cujo último composto casa a classe pedida, em ordem de documento. */
function regrasDaClasse(classe) {
  const alvo = new RegExp(`\\.${classe}(?![\\w-])`);
  return regras.filter((r) =>
    r.seletor.split(',').some((sel) => alvo.test(ultimoComposto(sel.trim())))
  );
}

/**
 * O valor EFETIVO de uma propriedade, e quantas regras a disputam.
 *
 * ⚠️ `disputas > 1` é acusação, não detalhe: com duas regras declarando a mesma coisa quem decide
 * é a cascata (ordem × especificidade), e este oráculo não modela cascata. Ele avisa em vez de
 * fingir que sabe.
 */
function efetivo(classe, propriedade) {
  let valor = null;
  let disputas = 0;
  for (const regra of regrasDaClasse(classe)) {
    const v = declaracoes(regra.corpo).get(propriedade);
    if (v === undefined) continue;
    disputas++;
    valor = v;
  }
  return { valor, disputas };
}

const daCaixa = regrasDaClasse('sources');
conferir(
  '§0 o bloco de `.sources` existe e é alcançável pela varredura',
  daCaixa.length > 0,
  'nenhuma regra casa a caixa — o seletor mudou de nome e a lei ficou muda'
);

// ══════════════════════════════════════════════════════════════ §1 o TETO
const teto = efetivo('sources', 'max-height');
conferir(
  '§1 a vista tem TETO declarado',
  Boolean(teto.valor) && !/^(none|initial|unset)$/.test(teto.valor),
  `max-height = ${teto.valor} — sem teto as 24 linhas empilham sobre o disco de novo`
);
conferir(
  '§1 uma regra só governa o teto',
  teto.disputas <= 1,
  `${teto.disputas} regras declaram max-height para .sources — quem decide é a cascata, não esta lei`
);

// ═══════════════════════════════════════════════════════════ §2 a ROLAGEM
const rolagemY = efetivo('sources', 'overflow-y');
const rolagem = efetivo('sources', 'overflow');
const valorDaRolagem = rolagemY.valor ?? rolagem.valor;
conferir(
  '§2 o que passa do teto ROLA',
  /^(auto|scroll)$/.test(String(valorDaRolagem)),
  `overflow-y = ${valorDaRolagem} — teto sem rolagem é o corte que SOME, e some sem acusar`
);

// ═════════════════════════════════════════════ §3 rolagem e ponteiro, em par
const ponteiro = efetivo('sources', 'pointer-events');
const temRolagem = /^(auto|scroll)$/.test(String(valorDaRolagem));
const temPonteiro = ponteiro.valor === 'auto';
conferir(
  '§3 quem rola AGARRA o ponteiro',
  !temRolagem || temPonteiro,
  'o `#hud` é `pointer-events: none`: sem isto a roda vai para a câmera e a barra é enfeite'
);
conferir(
  '§3 e quem agarra o ponteiro tem o que rolar',
  !temPonteiro || temRolagem,
  'ponteiro sem rolagem é zona morta sobre o canvas sem nada em troca'
);

// ═════════════════════════════════════════════════ §4 o scrim é GRADIENTE
const fundo = efetivo('sources', 'background');
const opaco = /#[0-9a-fA-F]{3,8}\b|\brgb\(|rgba\([^)]*,\s*1(\.0+)?\s*\)/;
conferir(
  '§4 o scrim é um GRADIENTE',
  String(fundo.valor).includes('linear-gradient('),
  `background = ${fundo.valor}`
);
conferir(
  '§4 e nenhuma parada dele é opaca',
  Boolean(fundo.valor) && !opaco.test(fundo.valor),
  'fundo opaco está refutado por medida em `hud/yield.js`: a HUD hairline vive de pouco contraste'
);

// ═══════════════════════════ §5 a linha declara `line-height` — a conta existe
const alturaDeLinha = efetivo('source', 'line-height');
conferir(
  '§5 a LINHA declara `line-height`',
  Boolean(alturaDeLinha.valor),
  'sem ele a altura é `normal` (~1,2, e depende da fonte): o teto vira estimativa, não conta'
);

// ═══════════════════════════════════════════ §6 a aritmética do teto fecha
const px = (v) => {
  const m = /^(-?[\d.]+)(px|vh)$/.exec(String(v).trim());
  if (!m) return null;
  return m[2] === 'vh' ? (Number(m[1]) / 100) * ALTURA_DE_REFERENCIA : Number(m[1]);
};
const corpoDaFonte = px(efetivo('source', 'font-size').valor);
const razao = Number(alturaDeLinha.valor);
const respiro = px(efetivo('sources', 'gap').valor);
const tetoPx = px(teto.valor);
const paddingVertical = (() => {
  const p = String(efetivo('sources', 'padding').valor || '').trim().split(/\s+/);
  const topo = px(p[0]);
  return topo === null ? null : topo * 2;
})();
const passo = corpoDaFonte !== null && razao > 0 && respiro !== null ? corpoDaFonte * razao + respiro : null;
const capacidade = passo && tetoPx !== null && paddingVertical !== null
  ? Math.floor((tetoPx - paddingVertical) / passo)
  : null;
conferir(
  '§6 todas as parcelas da conta são DECLARADAS',
  capacidade !== null,
  JSON.stringify({ corpoDaFonte, razao, respiro, tetoPx, paddingVertical })
);
conferir(
  '§6 e o teto mostra linha: a capacidade é positiva',
  capacidade !== null && capacidade >= 2,
  `${capacidade} linha(s) em ${ALTURA_DE_REFERENCIA}px — teto que não mostra nada é o corte com outro nome`
);

// ═══════════════════════════════════ §7 o TOTAL é publicado, e fica grudado
const grudado = efetivo('sources-total', 'position');
conferir(
  '§7 o total tem estilo próprio e fica GRUDADO no topo',
  grudado.valor === 'sticky',
  `position = ${grudado.valor} — rolar não pode levar embora quem diz quantas são`
);

/**
 * O CÓDIGO, sem os comentários.
 *
 * ☠️ Varrer o arquivo inteiro deixaria a PROSA satisfazer a lei: o comentário que explica por que
 * `scrollIntoView` está proibido contém a palavra proibida, e um cabeçalho que só existisse num
 * comentário passaria por implementação. Comentário de linha inteira e bloco saem; `//` no fim de
 * linha fica, e se um dia ele fizer uma lei cair, ela cai NOMEADA — que é o desfecho bom.
 */
const semComentarios = (fonte) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const answer = semComentarios(readFileSync(`${RAIZ}/src/hud/answer.js`, 'utf8'));
/*
 * ⚠️ O ponto de montagem é `pintarFontes`, e não mais o assinante de `sources`. A lista se repinta
 * também quando um painel entra ou sai da tela (`hud/answer.js`, os dois `MutationObserver`), e uma
 * lei ancorada no assinante deixaria a repintura — o caminho que roda mais vezes — sem guarda.
 */
const monta = /function pintarFontes\(\)[\s\S]*?\n {2}\}/.exec(answer);
const assina = /on\('sources',[\s\S]*?\n {2}\}\);/.exec(answer);

conferir(
  '§7 e ele carrega o total REAL da lista',
  /el\('div',\s*'sources-total'/.test(answer) && /\blista\.length\b/.test(answer),
  'o cabeçalho tem de sair de `lista.length`; número escrito à mão é fato de mundo com cara de medida'
);
conferir(
  '§7 a composição NOMEIA as espécies que sabe ler, e a desconhecida acusa',
  /NOME_DA_ESPECIE\s*=\s*\{[^}]*memory[^}]*web[^}]*\}/.test(answer) &&
    /NOME_DA_ESPECIE\[especie\]\s*\|\|/.test(answer),
  'espécie nova absorvida pelo total mais próximo afirmaria uma composição que ninguém mediu'
);

conferir(
  '§7 e ele é MONTADO na lista, não só definido',
  Boolean(monta) && /totalDeFontes\(/.test(monta[0]),
  'declarar não implementa: cabeçalho que existe e nunca é chamado é o defeito que esta base pagou cinco vezes'
);

// ═════════════════════════════════════════ §8 nada é truncado do lado do JS
conferir(
  '§8 o assinante de `sources` continua reconhecível, e ele PINTA',
  Boolean(assina) && /pintarFontes\(\)/.test(assina[0]),
  'a forma do assinante mudou — a varredura não alcança mais o que ela prova, e passar seria pior'
);
conferir(
  '§8 a lista INTEIRA entra na montagem: nenhum corte em JS',
  Boolean(monta) &&
    /montarFontes\(sources\b/.test(monta[0]) &&
    !/\.(slice|splice)\(/.test(monta[0]),
  'cortar aqui apagaria o destino de um `[n]` já escrito na resposta'
);
/*
 * ☠️ Que a MONTAGEM não perde fonte nenhuma — nem quando um painel a repete — é lei de execução,
 * não de regex: `scripts/lei-referencia.mjs` roda `montarFontes` e conta os `[n]` que sobram.
 */
conferir(
  '§8 e todo bloco montado é ANEXADO, nenhum fica pelo caminho',
  Boolean(monta) && /for \(const bloco of blocos\)/.test(monta[0]) && /sourcesNode\.append\(/.test(monta[0]),
  'montar sem anexar seria a lista curta com a montagem correta — verde no oráculo e muda na tela'
);

// ═════════════════════════ §9 o alvo de rolagem é exato — e ZERO é zero exato
const { deslocamentoAte } = await import(`${RAIZ}/src/hud/answer.js`);
const caixa = { top: 100, bottom: 240 };
conferir(
  '§9 linha inteiramente dentro da vista devolve ZERO EXATO',
  deslocamentoAte(caixa, { top: 150, bottom: 163 }) === 0,
  `${deslocamentoAte(caixa, { top: 150, bottom: 163 })} — número derivado que não vale zero exato vira piso com cara de medida`
);
conferir(
  '§9 linha acima da vista SOBE, pela distância exata',
  deslocamentoAte(caixa, { top: 88, bottom: 101 }) === -12
);
conferir(
  '§9 linha abaixo da vista DESCE, pela distância exata',
  deslocamentoAte(caixa, { top: 245, bottom: 258 }) === 18
);
conferir(
  '§9 linha escondida ATRÁS do cabeçalho grudado também sobe',
  deslocamentoAte(caixa, { top: 105, bottom: 118 }, 21) === -16 &&
    deslocamentoAte(caixa, { top: 105, bottom: 118 }) === 0,
  'sem descontar o cabeçalho, «já está visível» é verdade sobre a geometria e mentira sobre a tela'
);
conferir(
  '§9 a borda encostada não move nada',
  deslocamentoAte(caixa, { top: 100, bottom: 113 }) === 0 &&
    deslocamentoAte(caixa, { top: 227, bottom: 240 }) === 0
);

// ══════════════════════ §10 a citação alcança a linha, e não rola ancestral
conferir(
  '§10 acender a citação rola a lista até a linha',
  /function highlight\(number\)[\s\S]*?rolarAte\(/.test(answer) &&
    /deslocamentoAte\(/.test(answer.slice(answer.indexOf('function rolarAte'))),
  'sem isto o teto acende uma linha FORA da vista e a citação deixa de apontar para alguma coisa'
);
conferir(
  '§10 e ninguém chama `scrollIntoView`',
  !/scrollIntoView/.test(answer),
  'ele rola TODO ancestral rolável, e o ancestral aqui é o `.widget-body`, que é `overflow: hidden`'
);

// ═══════════════════════════ §11 a linha não encolhe: ela TRANSBORDA e rola
/*
 * ⚠️ O seletor tem de ser dos FILHOS DESTA lista. A primeira versão desta lei varria qualquer
 * regra terminada em `*` e passava por causa do `.surface > *`, que fala de outro elemento —
 * mutar `.sources > *` deixava a lei verde. Lei que se satisfaz com o vizinho não guarda nada.
 */
const filhosDaLista = regras.filter((r) =>
  r.seletor.split(',').some((sel) => /\.sources(?![\w-])\s*>?\s*\*/.test(sel.trim()))
);
conferir(
  '§11 os filhos da lista são `flex: 0 0 auto`',
  filhosDaLista.some((r) => /^0\s+0\s+auto$/.test(String(declaracoes(r.corpo).get('flex')))),
  'item de flex ENCOLHE por padrão (lição 3 do `.surface`): sem isto elas se espremem e não há o que rolar'
);

// ───────────────────────────────────────────────────────── o carimbo e a saída
console.log(`\x1b[1mA LEI DA LISTA DE FONTES\x1b[0m  ${ok.length + falhas.length} leis`);
for (const nome of ok) console.log(`  \x1b[32m✓\x1b[0m ${nome}`);
for (const f of falhas) console.log(`  \x1b[31m✗\x1b[0m ${f}`);

if (falhas.length) {
  console.log(`\n\x1b[31m✗ ${falhas.length} lei(s) caíram\x1b[0m`);
  process.exit(1);
}
console.log(
  `\n\x1b[32m✓ as ${ok.length} leis valem\x1b[0m  — teto ${teto.valor} ` +
    `(${tetoPx}px em ${ALTURA_DE_REFERENCIA}px), passo ${passo?.toFixed(2)}px, ` +
    `${capacidade} linhas à vista com o total publicado ao lado`
);
