#!/usr/bin/env node
/**
 * A LEI DA RODA — o zoom responde ao GESTO, nunca à contagem de eventos.
 *
 * ## O que ela guarda
 *
 * `WheelEvent` mede quanto o dedo andou e diz em que unidade mediu. Quem lê só o sinal descarta a
 * medida e passa a responder ao NÚMERO DE EVENTOS, que é uma propriedade do dispositivo e não do
 * gesto. Nada nisso dá erro: a cena continua desenhando, o zoom continua funcionando, e o que
 * muda é a velocidade — por duas ordens de grandeza entre um mouse e um trackpad.
 *
 * Quatro modos de falha, todos sem sintoma além de "o zoom está estranho":
 *
 * 1. ☠️ **MAGNITUDE DESCARTADA** (§2). Passo fixo por evento. Um trackpad entrega ~60 eventos/s
 *    contra 1 de um entalhe de mouse.
 * 2. ☠️ **PASSO LINEAR** (§3). `×(1+k)` e `×(1−k)` não são inversos — o vaivém encolhe a distância
 *    sozinho, e a única testemunha é a câmera derivando ao longo de minutos.
 * 3. ☠️ **`deltaMode` IGNORADO** (§4). O Firefox reporta em LINHAS; lido como pixel, o zoom para.
 * 4. ☠️ **A CENA REIMPLEMENTANDO** (§6). Módulo puro importado e não chamado deixa a lei verde
 *    sobre código morto — por isso a varredura tira os `import` ANTES de procurar a chamada.
 *
 * Roda em `node` sem navegador: `roda-de-zoom.js` é puro, recebe dois números e devolve um.
 *
 * Uso:  node scripts/lei-roda.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fatorDeZoom, entalhesDe, MODO, TETO_ENTALHES, FATOR_POR_ENTALHE } from '../src/space/roda-de-zoom.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = { erro: '\x1b[31m', ok: '\x1b[32m', fraco: '\x1b[2m', forte: '\x1b[1m', fim: '\x1b[0m' };
let falhas = 0;
const checar = (secao, cond, frase) => {
  if (cond) console.log(`  ${C.ok}✓${C.fim} ${C.fraco}${secao}${C.fim} ${frase}`);
  else {
    falhas += 1;
    console.log(`${C.erro}✗ ${secao} ${frase}${C.fim}`);
  }
};

/** Quantos entalhes um fator VALE — é assim que efeitos de dispositivos diferentes se comparam. */
const entalhesEquivalentes = (fator) => Math.log(fator) / Math.log(FATOR_POR_ENTALHE);

console.log(`${C.forte}LEI DA RODA${C.fim}  ${C.fraco}o gesto, não a contagem de eventos${C.fim}\n`);

// ────────────────────────────────────────────────────────────────── §1 · O SENTIDO

console.log(`${C.forte}§1  PARA BAIXO AFASTA, PARA CIMA APROXIMA${C.fim}`);
{
  checar('§1', fatorDeZoom({ deltaY: 100 }) > 1, 'rolar para baixo AFASTA — fator maior que 1');
  checar('§1b', fatorDeZoom({ deltaY: -100 }) < 1, 'rolar para cima APROXIMA — fator menor que 1');
  checar(
    '§1c',
    fatorDeZoom({ deltaY: 0 }) === 1,
    'evento de zero pixels é a IDENTIDADE, nunca um passo mínimo'
  );
  checar(
    '§1d',
    fatorDeZoom({ deltaY: NaN }) === 1 && fatorDeZoom({ deltaY: Infinity }) === 1,
    'NaN e infinito não são medidas de gesto: não movem a câmera (quem satura no teto é grandeza FINITA — §5)'
  );
}

// ────────────────────────────────────────────────────── §2 · A MAGNITUDE É A GRANDEZA

console.log(`\n${C.forte}§2  QUANTO O DEDO ANDOU DECIDE${C.fim}`);
{
  const amostras = [1, 4, 12, 40, 100, 200, 350];
  const fatores = amostras.map((d) => fatorDeZoom({ deltaY: d }));
  const crescente = fatores.every((f, i) => i === 0 || f > fatores[i - 1]);
  checar('§2', crescente, `|deltaY| maior move MAIS: ${amostras.length} amostras estritamente crescentes`);

  /*
   * ☠️ A refutação do passo fixo, e é ela que esta lei existe para fazer cair. Um passo por evento
   * dá o MESMO fator para 4 e para 100, e a comparação abaixo é a única que o acusa.
   */
  checar(
    '§2b',
    fatorDeZoom({ deltaY: 100 }) / fatorDeZoom({ deltaY: 4 }) > 1.03,
    'um entalhe de mouse (100) vale visivelmente mais que um toque de trackpad (4)'
  );
  checar(
    '§2c',
    Math.abs(entalhesEquivalentes(fatorDeZoom({ deltaY: -100 })) - 1) < 1e-9,
    'a régua fecha: deltaY 100 em pixel É exatamente um entalhe'
  );
}

// ────────────────────────────────────────────────────────── §3 · O VAIVÉM VOLTA

console.log(`\n${C.forte}§3  IDA E VOLTA DEVOLVE A MESMA DISTÂNCIA${C.fim}`);
{
  const pares = [4, 53, 100, 240];
  const desvios = pares.map((d) => Math.abs(fatorDeZoom({ deltaY: d }) * fatorDeZoom({ deltaY: -d }) - 1));
  checar(
    '§3',
    desvios.every((e) => e < 1e-12),
    `fator(d) × fator(−d) = 1 em ${pares.length} magnitudes — a forma é exponencial, logo reversível`
  );

  /*
   * O desvio ACUMULADO é o que se vê na tela, e ele é o que o passo linear escondia: com
   * `1 ± 0,08` vinte vaivéns comem 12% da distância. Aqui a régua é a distância mesmo.
   */
  let raio = 100;
  for (let i = 0; i < 200; i += 1) {
    raio *= fatorDeZoom({ deltaY: -100 });
    raio *= fatorDeZoom({ deltaY: 100 });
  }
  checar('§3b', Math.abs(raio - 100) < 1e-9, '200 vaivéns não derivam a câmera um milésimo que seja');
}

// ──────────────────────────────────────────── §4 · O MESMO GESTO EM DISPOSITIVOS DIFERENTES

console.log(`\n${C.forte}§4  ENTALHE É ENTALHE, EM QUALQUER UNIDADE${C.fim}`);
{
  const pixel = fatorDeZoom({ deltaY: 100, deltaMode: MODO.PIXEL });
  const linha = fatorDeZoom({ deltaY: 3, deltaMode: MODO.LINHA });
  checar(
    '§4',
    Math.abs(pixel - linha) < 1e-12,
    'um entalhe em PIXEL (100) e em LINHA (3) produzem o mesmo fator — o Firefox anda igual'
  );
  checar(
    '§4b',
    Math.abs(fatorDeZoom({ deltaY: 100, deltaMode: 7 }) - pixel) < 1e-12,
    'modo desconhecido degrada para PIXEL, que é o que quase todo navegador reporta'
  );

  /*
   * ☠️ A prova de ordem de grandeza — e é ela que separa esta implementação da anterior.
   *
   * Um segundo de trackpad são ~60 eventos de `deltaY ≈ 4`. Com passo fixo de 8% por evento isso
   * valia 120 entalhes: a distância caía 99,3% num segundo, e a leitura na tela era «o zoom
   * dispara». Com a magnitude respeitada, o mesmo segundo vale 2,4 entalhes.
   */
  let raio = 1;
  for (let i = 0; i < 60; i += 1) raio *= fatorDeZoom({ deltaY: -4 });
  const valeu = entalhesEquivalentes(raio);
  checar(
    '§4c',
    valeu > 1 && valeu < 5,
    `um segundo de trackpad vale ${valeu.toFixed(1)} entalhes — na mesma ordem de grandeza de um entalhe de mouse`
  );
}

// ─────────────────────────────────────────────────────────────────── §5 · O TETO

console.log(`\n${C.forte}§5  UM EVENTO SÓ NÃO TELEPORTA${C.fim}`);
{
  const absurdos = [5_000, 100_000, Number.MAX_SAFE_INTEGER];
  const teto = 1 / Math.pow(FATOR_POR_ENTALHE, TETO_ENTALHES);
  checar(
    '§5',
    absurdos.every((d) => fatorDeZoom({ deltaY: d }) <= teto + 1e-9),
    `pico de inércia satura em ${TETO_ENTALHES} entalhes (${((teto - 1) * 100).toFixed(1)}% de raio), nunca mais`
  );
  checar(
    '§5b',
    entalhesDe(100 * TETO_ENTALHES * 3, MODO.PIXEL) === TETO_ENTALHES,
    'o teto é ALCANÇADO, não é um limite que nada atinge'
  );
  checar(
    '§5c',
    entalhesDe(100 * (TETO_ENTALHES - 1), MODO.PIXEL) === TETO_ENTALHES - 1,
    'e abaixo dele a medida passa intacta — o teto não é um clamp que sempre morde'
  );
}

// ────────────────────────────────────────────────────── §6 · A CENA CHAMA, NÃO REIMPLEMENTA

console.log(`\n${C.forte}§6  A CENA CHAMA O MÓDULO${C.fim}`);
{
  const bruto = fs.readFileSync(path.join(RAIZ, 'src/space/scene.js'), 'utf8');
  /*
   * ☠️ Os `import` saem ANTES da varredura. A linha de importação sobrevive à remoção da chamada,
   * e um guarda que case o NOME aprova um módulo morto. Os comentários saem pela mesma razão: a
   * prosa que explica por que o passo fixo é proibido satisfaria a lei que o proíbe.
   */
  const codigo = bruto
    .replace(/^import[\s\S]*?from\s+'[^']*';$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const roda = codigo.slice(codigo.indexOf("'wheel'"), codigo.indexOf("'wheel'") + 700);
  checar('§6', codigo.includes("'wheel'"), 'a cena ainda ouve a roda');
  checar('§6b', /fatorDeZoom\s*\(/.test(roda), 'o ouvinte CHAMA `fatorDeZoom` — não é só um import');
  checar(
    '§6c',
    !/Math\.sign\s*\(\s*\w+\.deltaY/.test(codigo),
    'nenhum lugar da cena volta a ler só o SINAL do `deltaY`'
  );
  checar(
    '§6d',
    !/deltaY[^;]*\*\s*0\.\d/.test(roda) && !/1\s*[+-]\s*Math\.sign/.test(roda),
    'nenhum passo literal sobreviveu no ouvinte — o tamanho do passo mora no módulo'
  );
  checar(
    '§6e',
    /clampDistance\s*\(/.test(roda),
    'o piso continua sendo da CENA: o módulo é puro e não conhece o raio do corpo mais próximo'
  );
}

// ──────────────────────────────────────────────────────────────────────────────────

console.log(
  falhas === 0
    ? `\n${C.ok}${C.forte}A RODA RESPONDE AO GESTO.${C.fim}\n`
    : `\n${C.erro}${C.forte}${falhas} lei(s) da roda caíram.${C.fim}\n`
);
process.exit(falhas === 0 ? 0 : 1);
