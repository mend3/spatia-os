#!/usr/bin/env node
/**
 * O ORÁCULO DA LENTE — quem pode dobrar a luz, e quem não pode.
 *
 * ## A pergunta que ele responde
 *
 * > *"Este corpo produz pelo menos UM PIXEL de deflexão nesta tela?"*
 *
 * Ele nasceu de um relato: um planeta passa atrás de uma estrela e não há distorção nenhuma. A
 * suspeita natural é que falta lente gravitacional na estrela. **A medida diz o contrário — a
 * ausência é o comportamento certo** —, e sem um oráculo essa conclusão vive só numa conversa. A
 * próxima pessoa vê a mesma imagem, tem a mesma suspeita, e implementa.
 *
 * ## A saída da armadilha epistemológica: RAZÃO, não massa
 *
 * `entityPhysics.mass` é `node.chunks` — contagem de conhecimento, não quilogramas. Derivar `G`,
 * `c` e um `R_s` disso exigiria escolher uma constante de conversão, e essa constante seria livre:
 * física de mentira, escolhida para ficar bonita. É o que a REGRA DA FÍSICA chama de *trocar física
 * por curva artística*.
 *
 * ⚠️ **Mas nada disso é necessário, e o `scene.js` já sabia:** a deflexão no limbo depende só de
 * `R_s / R`, que é **adimensional**. Ela atravessa qualquer escala sem unidade nenhuma:
 *
 *     alfa(limbo) = 2 · (R_s / R)
 *
 * Uma estrela de nêutrons tem `R_s/R ≈ 0,4` porque tem ~4 km de Schwarzschild para ~10 km de raio —
 * e é exatamente esse 0,4 que o `corpoDaLente` do pulsar aplica ao raio DESENHADO. Não há conversão
 * inventada ali: há um fato astronômico adimensional, transportado para a escala da cena.
 *
 * **Então a regra desta base fica:** um corpo só ganha lente se a CLASSE dele tiver uma razão
 * `R_s/R` declarada e medida — nunca a partir de `chunks`.
 *
 * ## O que ele NÃO é
 *
 * Ele não desenha, não abre navegador e não precisa de GPU, como os outros oráculos do buraco negro.
 * E ele **não autoriza sozinho**: ele responde por medida e falha quando alguém liga a lente num
 * corpo cuja classe não tem razão declarada.
 *
 * Uso:  node scripts/lente-estelar.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
/*
 * ⚠️ IMPORTADO, não transcrito. As razões e a fórmula moram em `src/space/astrofisica.js`, que é um
 * módulo PURO — sem `three` — exatamente para poder ser lido aqui em `node`. Uma transcrição a menos
 * é uma obrigação de sincronia a menos, e este oráculo já carrega uma (a do GLSL, travada abaixo).
 */
import { RS_POR_RAIO, deflexao, raiosParaAnelVisivel } from '../src/space/astrofisica.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

const C = { erro: '\x1b[31m', ok: '\x1b[32m', aviso: '\x1b[33m', fraco: '\x1b[2m', forte: '\x1b[1m', fim: '\x1b[0m' };
let falhas = 0;
const falhar = (msg) => { falhas += 1; console.log(`${C.erro}✗ ${msg}${C.fim}`); };

/*
 * ─────────────────────────── 1. A TRANSCRIÇÃO, E A TRAVA DELA
 *
 * ⚠️ A fonte é o GLSL; isto aqui é cópia. É a mesma obrigação que `campo.mjs` e a §6 do
 * `censo-planetas.mjs` carregam — e a mesma forma de morrer: o shader muda, o oráculo continua
 * atestando código que não existe mais. A trava abaixo aborta em vez de mentir.
 */
const GEODESICA = 'src/space/blackhole-geodesic.js';
const ANCORAS = ['(2.0 * uRs / impacto)', '(2.0 * uRs / bCauda)'];
const glsl = ler(GEODESICA);
const ausentes = ANCORAS.filter((a) => !glsl.includes(a));
if (ausentes.length) {
  console.log(`${C.erro}✗ TRANSCRIÇÃO FORA DE SINCRONIA${C.fim}`);
  console.log(`  ${GEODESICA} não contém mais: ${ausentes.join(' · ')}`);
  console.log('  Este oráculo transcreve alfa = 2·R_s/b. Se o shader mudou de fórmula, ele passou a');
  console.log('  atestar uma física que a cena não desenha. Atualize os dois, ou apague este script.');
  process.exit(1);
}

/**
 * O raio de Einstein: `sqrt(2 R_s · D_LS / (D_L · D_S))`.
 *
 * O anel só é VISÍVEL se ele sair de dentro do próprio corpo — a luz que o formaria, abaixo disso,
 * está atrás da fotosfera. Daí a comparação com `R / D_L`, que é o raio angular do corpo.
 */
const raioDeEinstein = (rs, dl, ds) => Math.sqrt((2 * rs * Math.max(ds - dl, 0)) / (dl * ds));

/*
 * ─────────────────────────── 2. A TELA DE REFERÊNCIA
 *
 * `k` é quantos pixels de framebuffer vale um radiano — a MESMA constante de projeção que
 * `raioAparente`, `graph.apparentPx` e o laço do sprite usam. Medida na cena viva em 2026-08-08:
 * framebuffer 2582×1484 (DPR 2), fov 80°.
 */
const TELA = { alturaFB: 1484, fovGraus: 80 };
const K_PX_POR_RAD = TELA.alturaFB / (2 * Math.tan((TELA.fovGraus * Math.PI) / 360));

/** Abaixo de um pixel o fenômeno não existe na tela — não é sutil, é ausente. */
const PISO_PX = 1;

/*
 * ─────────────────────────── 3. AS RAZÕES `R_s / R`, POR CLASSE
 *
 * ⚠️ **Todas adimensionais, todas fatos astronômicos.** Nenhuma sai de `chunks`, e é por isso que
 * elas podem viajar para a escala da cena sem inventar constante nenhuma.
 *
 * `R_s = 2GM/c²` = 2,953 km por massa solar.
 */
/*
 * A POLÍTICA — quem esta base AUTORIZA a dobrar a luz.
 *
 * ⚠️ Ela é declarada aqui e as RAZÕES vêm de `astrofisica.js`, de propósito: se a autorização fosse
 * derivada da conta, a conferência abaixo viraria tautologia e não pegaria nada. Separadas, uma
 * política que discorda da física falha — que é o único jeito de o portão ter dentes.
 */
const AUTORIZADAS = new Set(['buraco-negro', 'pulsar']);
const CLASSES = Object.keys(RS_POR_RAIO).map((id) => ({
  id, rsPorR: RS_POR_RAIO[id], lenteAutorizada: AUTORIZADAS.has(id),
}));


/*
 * ─────────────────────────── 4. A TABELA, E O VEREDITO POR CLASSE
 */
console.log(`${C.forte}ORÁCULO DA LENTE${C.fim}  ${C.fraco}alfa = 2·R_s/b  ·  b = R (limbo)  ·  k = ${K_PX_POR_RAD.toFixed(1)} px/rad  (fb ${TELA.alturaFB}, fov ${TELA.fovGraus}°)${C.fim}\n`);
console.log(`${C.fraco}  classe          R_s/R        alfa (rad)     arcsec        px      ≥1px  autorizada${C.fim}`);

for (const c of CLASSES) {
  const alfa = deflexao(c.rsPorR, 1); // b = R  ⇒  alfa = 2·(R_s/R)
  const px = alfa * K_PX_POR_RAD;
  const resolve = px >= PISO_PX;
  const marca = resolve ? `${C.ok}sim ${C.fim}` : `${C.fraco}não ${C.fim}`;
  const auto = c.lenteAutorizada ? `${C.ok}sim${C.fim}` : `${C.fraco}não${C.fim}`;
  console.log(
    `  ${c.id.padEnd(14)} ${c.rsPorR.toExponential(2).padStart(9)}  ${alfa.toExponential(3).padStart(11)}` +
    `  ${(alfa * 206264.8).toExponential(2).padStart(10)}  ${px.toExponential(2).padStart(9)}   ${marca}  ${auto}`
  );
  /*
   * A COERÊNCIA é o que este laço realmente testa: autorizar uma classe que não alcança um pixel
   * seria desenhar um fenômeno que não existe; proibir uma que alcança seria esconder um que existe.
   */
  if (c.lenteAutorizada !== resolve) {
    falhar(`${c.id}: autorizada=${c.lenteAutorizada} mas alcança ${px.toExponential(2)} px ` +
      `(piso ${PISO_PX}). Uma das duas está errada — a razão declarada ou a autorização.`);
  }
}

const limiar = (PISO_PX / K_PX_POR_RAD) / 2;
console.log(`\n  ${C.forte}O CORTE:${C.fim} nesta tela um corpo precisa de ${C.forte}R_s/R ≥ ${limiar.toExponential(2)}${C.fim} para valer um pixel no limbo.`);
console.log(`  ${C.fraco}Uma estrela tipo Sol fica ${(limiar / 4.24e-6).toFixed(0)}× abaixo disso. Não é sutil: é ausente.${C.fim}`);

/*
 * ─────────────────────────── 5. O ANEL DE EINSTEIN, E POR QUE ELE NÃO SAI DA ESTRELA
 *
 * A distância mínima para o anel escapar do disco do próprio corpo sai de `theta_E > R / D_L`, que
 * com a fonte muito atrás resolve para `D_L > R² / (2 R_s)` — ou seja, `D_L/R > 1/(2·R_s/R)`.
 */
console.log(`\n${C.forte}ANEL DE EINSTEIN${C.fim}  ${C.fraco}a que distância ele sai de dentro do próprio corpo${C.fim}`);
const CAMERA_EM_RAIOS = 6.5; // medido em 2026-08-08: anexar um corpo chega em px 135 ⇒ D/R ≈ 6,5
for (const c of CLASSES.filter((x) => x.id !== 'buraco-negro')) {
  const precisaDeRaios = raiosParaAnelVisivel(c.id);
  const alcanca = CAMERA_EM_RAIOS >= precisaDeRaios;
  const thetaE = raioDeEinstein(c.rsPorR, CAMERA_EM_RAIOS, CAMERA_EM_RAIOS * 2);
  console.log(
    `  ${c.id.padEnd(14)} precisa de ${precisaDeRaios.toExponential(2).padStart(9)} raios` +
    `  ·  a câmera está a ${CAMERA_EM_RAIOS}  ·  ${alcanca ? `${C.ok}sai${C.fim}` : `${C.fraco}fica dentro do corpo${C.fim}`}` +
    `  ${C.fraco}(θ_E ${(thetaE * K_PX_POR_RAD).toFixed(2)} px)${C.fim}`
  );
}
console.log(`  ${C.fraco}Para o Sol isso são 548 UA — a distância focal da lente gravitacional solar. É por isso que${C.fim}`);
console.log(`  ${C.fraco}microlente estelar se detecta como BRILHO e nunca como arco resolvido.${C.fim}`);

/*
 * ─────────────────────────── 6. A AUDITORIA: QUEM ALIMENTA A LENTE HOJE
 *
 * ⚠️ Esta é a metade com DENTES. A tabela acima é aritmética e não impede ninguém de nada; esta
 * seção lê o `scene.js` e falha quando um corpo passa a dobrar a luz sem razão declarada.
 *
 * O corolário da REGRA DO CATÁLOGO que esta base já pagou cinco vezes: **declarar uma invariante não
 * a implementa.** Sem esta varredura, o oráculo seria a sexta.
 */
console.log(`\n${C.forte}QUEM DOBRA A LUZ NA CENA${C.fim}`);
const cena = ler('src/space/scene.js');
/*
 * ⚠️ Delimitado por ÍNDICE e não por regex de parênteses: `lensing.sync(...)` tem chamada aninhada
 * dentro (`renderer.getSize(new THREE.Vector2())`), e um `[^)]*\)` para no primeiro fecha-parênteses
 * — o oráculo perdia o alvo e acusava a si mesmo. Do `const corpoDaLente` até o fim da linha do
 * `sync` cobre o trecho inteiro sem depender de balanceamento.
 */
const iIni = cena.indexOf('const corpoDaLente');
const iSync = iIni >= 0 ? cena.indexOf('lensing.sync(', iIni) : -1;
const iFim = iSync >= 0 ? cena.indexOf('\n', iSync) : -1;
const bloco = iFim > 0 ? [cena.slice(iIni, iFim)] : null;
if (!bloco) {
  falhar('não achei o trecho que monta `corpoDaLente` e chama `lensing.sync` em scene.js — ' +
    'o oráculo perdeu o alvo e não pode mais afirmar nada sobre quem dobra a luz.');
} else {
  const trecho = bloco[0];
  // `Set`: o mesmo SURFACE aparece no teste e no `BODY_SPAN[...]` do mesmo trecho.
  const surfaces = [...new Set([...trecho.matchAll(/SURFACE\.([A-Z_]+)/g)].map((m) => m[1].toLowerCase()))];
  const temRs = /\brs\s*:/.test(trecho);
  if (!surfaces.length && temRs) {
    falhar('há um `rs:` alimentando a lente sem nenhuma SURFACE nomeada no trecho — origem indecidível.');
  }
  for (const s of surfaces) {
    const classe = CLASSES.find((c) => c.id === s);
    if (!classe) {
      falhar(`SURFACE.${s.toUpperCase()} alimenta a lente e NÃO tem razão R_s/R declarada neste oráculo. ` +
        `Ou ela é um corpo com âncora física — e então declare a razão, com fonte — ou a lente dela ` +
        `deriva de \`chunks\`, e aí é curva artística vestida de física.`);
      continue;
    }
    if (!classe.lenteAutorizada) {
      falhar(`SURFACE.${s.toUpperCase()} alimenta a lente, mas R_s/R = ${classe.rsPorR.toExponential(2)} ` +
        `só produz ${(2 * classe.rsPorR * K_PX_POR_RAD).toExponential(2)} px. Abaixo do piso de ${PISO_PX} px.`);
      continue;
    }
    console.log(`  ${C.ok}✓${C.fim} SURFACE.${s.toUpperCase().padEnd(10)} R_s/R ${classe.rsPorR}  ${C.fraco}razão adimensional declarada em astrofisica.js${C.fim}`);
  }
  /*
   * ⚠️ E o R_s tem de sair de uma RAZÃO aplicada ao raio desenhado — nunca de `chunks`, `mass` ou
   * `scale`, que são grandezas COGNITIVAS. É a fronteira inteira deste oráculo numa linha de regex.
   */
  const cognitivas = /\brs\s*:[^,\n]*\b(chunks|mass|massa|scale|degrau|centrality|influence)\b/i;
  if (cognitivas.test(trecho)) {
    falhar('o `rs:` da lente deriva de uma grandeza COGNITIVA (chunks/mass/scale/…). ' +
      'Nenhuma grandeza física pode ser derivada de uma variável cognitiva sem unidade e constante ' +
      'explícitas — e a saída correta é uma RAZÃO adimensional por classe, como o pulsar faz.');
  }
}

console.log('');
if (falhas) {
  console.log(`${C.erro}✗ ${falhas} ${falhas === 1 ? 'falha' : 'falhas'}${C.fim}`);
  process.exit(1);
}
console.log(`${C.ok}✓ a lente só é dobrada por quem tem razão R_s/R declarada e medida${C.fim} — ` +
  `e nenhuma grandeza física sai de chunks.`);
