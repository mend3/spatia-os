#!/usr/bin/env node
/**
 * A LEI DA ÂNCORA — o documento do corpo em foco tem endereço no mundo, e não foge dele.
 *
 * ## Por que ela existe
 *
 * O painel do corpo travado é posicionado e iluminado pela PROJEÇÃO da câmera, por quadro. Quatro
 * coisas nesse desenho falham **em silêncio**, e nenhuma aparece num screenshot:
 *
 * 1. ☠️ **A REALIMENTAÇÃO.** `getBoundingClientRect` inclui o `transform` já aplicado. Ler a caixa
 *    deslocada e calcular o deslocamento a partir dela soma o quadro anterior ao seguinte, e o
 *    painel FOGE — alguns pixels por quadro, sem erro no console, até sair da janela. A 120 Hz
 *    isso é meio segundo. §5.
 * 2. ☠️ **O documento PERDIDO.** O corpo em foco sai do quadro quando o operador orbita; um painel
 *    que o siga sem teto sai junto, e o operador fica sem o texto que estava lendo e sem saber por
 *    quê. O teto é a §6.
 * 3. ☠️ **A DEGRADAÇÃO MUDA.** *"O documento não se moveu"* tem quatro causas — sem corpo travado,
 *    painel não montado, corpo atrás da câmera, corpo eclipsado pelo horizonte — e a tela mostra a
 *    mesma imagem nas quatro. Cada uma sai por NOME (§1–§4).
 * 4. ☠️ **A REPINTURA POR QUADRO.** `transform` é composto e sai de graça; o `radial-gradient` da
 *    luz é PINTURA. Reescrevê-lo a 120 Hz não muda a imagem e não aparece no FPS travado no teto
 *    do monitor — aparece no orçamento, que nesta cena não tem folga. §10.
 *
 * ⚠️ **E a lei que protege o resto da tela: ancorar NÃO pode mexer em quem recebe o gesto.** A
 * regra do palco é *quem PINTA reivindica; quem só POSICIONA cede* (`lei-palco.mjs`), e ela vale
 * porque o que se move é a caixa que já pintava. A §8 exige que tudo o que o módulo escreve esteja
 * no namespace `--ancora-*`: propriedade customizada não altera comportamento sozinha.
 *
 * Ele roda em `node` sem navegador: o módulo não importa `three` e só toca o nó que recebe. O DOM
 * é de mentira, com geometria CONHECIDA — é isso que permite afirmar sobre pixel sem GPU.
 *
 * Uso:  node scripts/lei-ancora.mjs
 */
import {
  criarAncoraDeDocumento,
  MOTIVOS_DA_ANCORA,
  MARGEM_PX,
  FOLGA_EM_RAIOS,
  PASSO_DA_LUZ,
  LUZ_PLENA_PX,
} from '../src/space/ancora-de-documento.js';

const C = { erro: '\x1b[31m', ok: '\x1b[32m', fraco: '\x1b[2m', forte: '\x1b[1m', fim: '\x1b[0m' };
let falhas = 0;
const checar = (secao, condicao, frase) => {
  if (condicao) console.log(`  ${C.ok}✓${C.fim} ${C.fraco}${secao}${C.fim} ${frase}`);
  else {
    falhas += 1;
    console.log(`${C.erro}✗ ${secao} ${frase}${C.fim}`);
  }
};

// ─────────────────────────────────────────────────────────── o DOM de mentira, com geometria real

const JANELA = { largura: 1400, altura: 800 };
const CAIXA = { largura: 640, altura: 300 };

/**
 * Um painel de mentira que se comporta como o de verdade **na parte que morde**: a caixa que ele
 * devolve JÁ INCLUI o `transform` aplicado, como `getBoundingClientRect` faz. Um duplo que
 * devolvesse a caixa sem o transform tornaria a §5 verdade por construção — e a §5 é a razão de
 * este arquivo existir.
 */
function painelDeMentira() {
  const centroX = JANELA.largura / 2;
  const centroY = JANELA.altura / 2;
  const corpo = {
    className: 'widget-body',
    getBoundingClientRect() {
      const dx = parseFloat(painel.style.props['--ancora-dx'] ?? '0') || 0;
      const dy = parseFloat(painel.style.props['--ancora-dy'] ?? '0') || 0;
      return {
        width: CAIXA.largura,
        height: CAIXA.altura,
        left: centroX - CAIXA.largura / 2 + dx,
        top: centroY - CAIXA.altura / 2 + dy,
      };
    },
  };
  const painel = {
    dataset: {},
    escritas: [],
    removidas: [],
    style: {
      props: {},
      setProperty(k, v) {
        this.props[k] = v;
        painel.escritas.push(k);
      },
      removeProperty(k) {
        delete this.props[k];
        painel.removidas.push(k);
      },
    },
    removeAttribute(k) {
      delete painel.dataset[k.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase())];
    },
    querySelector: (sel) => (sel.includes('widget-body') ? corpo : null),
  };
  return painel;
}

const ctx = (extra = {}) => ({
  ndc: { x: 0, y: 0, z: 0.5 },
  px: 60,
  larguraPx: JANELA.largura,
  alturaPx: JANELA.altura,
  eclipsado: false,
  ...extra,
});

console.log(
  `${C.forte}LEI DA ÂNCORA${C.fim}  ${C.fraco}janela ${JANELA.largura}×${JANELA.altura} · ` +
    `caixa ${CAIXA.largura}×${CAIXA.altura} · margem ${MARGEM_PX}px · ` +
    `folga ${FOLGA_EM_RAIOS}× o raio${C.fim}\n`
);

// ───────────────────────────────────────────── §1–§4 · AS QUATRO AUSÊNCIAS SAEM POR NOME

console.log(`${C.forte}§1–§4  AS QUATRO CAUSAS DE «NÃO SE MOVEU»${C.fim}`);
{
  const semPainel = criarAncoraDeDocumento(() => null);
  semPainel.atualizar(ctx());
  checar(
    '§1',
    semPainel.estado().motivo === MOTIVOS_DA_ANCORA.SEM_PAINEL,
    'painel não montado sai como `painel-nao-montado`, e nada é escrito'
  );

  const p = painelDeMentira();
  const a = criarAncoraDeDocumento(() => p);
  a.atualizar(ctx());
  const ancorou = p.dataset.ancorado === 'sim';
  a.atualizar(null);
  checar(
    '§2',
    ancorou && a.estado().motivo === MOTIVOS_DA_ANCORA.SEM_CORPO && !p.dataset.ancorado,
    'sem corpo travado sai como `sem-corpo-em-foco` **e o atributo é RETIRADO do nó**'
  );
  checar(
    '§2b',
    p.style.props['--ancora-dx'] === undefined,
    'soltar apaga as variáveis — deslocamento congelado é como o painel abre torto na próxima rota'
  );

  const p3 = painelDeMentira();
  const a3 = criarAncoraDeDocumento(() => p3);
  a3.atualizar(ctx({ ndc: { x: 0, y: 0, z: 1.4 } }));
  checar(
    '§3',
    a3.estado().motivo === MOTIVOS_DA_ANCORA.ATRAS && !p3.dataset.ancorado,
    'corpo atrás da câmera (`z > 1`) solta — a projeção espelha, e o painel saltaria para o lado errado'
  );

  const p4 = painelDeMentira();
  const a4 = criarAncoraDeDocumento(() => p4);
  a4.atualizar(ctx({ eclipsado: true }));
  checar(
    '§4',
    a4.estado().motivo === MOTIVOS_DA_ANCORA.ECLIPSADO && !p4.dataset.ancorado,
    'corpo atrás do horizonte solta com motivo PRÓPRIO — não é o mesmo fato que «não há corpo»'
  );
}

// ───────────────────────────────────────────────────── §5 · A REALIMENTAÇÃO — a lei que dá o nome

console.log(`\n${C.forte}§5  A ÂNCORA NÃO FOGE${C.fim}  ${C.fraco}mesma câmera, 240 quadros${C.fim}`);
{
  const p = painelDeMentira();
  const a = criarAncoraDeDocumento(() => p);
  const entrada = ctx({ ndc: { x: -0.4, y: 0.2, z: 0.5 }, px: 90 });
  const trilha = [];
  for (let q = 0; q < 240; q++) {
    a.atualizar(entrada);
    trilha.push(a.estado().dx);
  }
  const primeiro = trilha[0];
  const ultimo = trilha[trilha.length - 1];
  const deriva = Math.abs(ultimo - primeiro);
  /*
   * ⚠️ O corte é UM PIXEL sobre 240 quadros, e ele é generoso de propósito: a realimentação de
   * verdade anda `dx` INTEIRO por quadro (dezenas de px), não frações. Um limiar apertado
   * reprovaria arredondamento; este só reprova fuga.
   */
  checar(
    '§5',
    deriva < 1,
    `com a câmera parada o deslocamento ESTABILIZA (${primeiro} → ${ultimo}, deriva ${deriva.toFixed(2)} px em 240 quadros) ` +
      '— `getBoundingClientRect` inclui o `transform`, e ler a caixa deslocada faria o painel fugir'
  );
  const todosIguais = trilha.every((v) => Math.abs(v - primeiro) < 1);
  checar('§5b', todosIguais, 'e nenhum quadro do meio se desvia — fuga que volta sozinha ainda é fuga');
}

// ─────────────────────────────────────────── §6b · A FAIXA: o leitor não cobre os trilhos

console.log(
  `\n${C.forte}§6b  O LEITOR NÃO ENCOSTA SOBRE OS TRILHOS${C.fim}  ${C.fraco}a faixa é o PALCO, não a janela${C.fim}`
);
{
  /*
   * ☠️ **`.surface` tem `pointer-events: auto` e `z-index: 8`.** Encostando sobre o trilho, o leitor
   * não só tapa o painel de CONTEXTO: ele ROUBA o clique dos botões de marca. A queixa foi "impede
   * o uso", que é de outra ordem que "atrapalha a leitura" — e é por isso que a faixa é lei e não
   * afinação.
   *
   * ⚠️ **Os trilhos são MEDIDOS pelo chamador, nunca presumidos pelo módulo.** Abaixo de 900 px
   * eles somem por media query, e um recuo cravado comeria palco onde não há trilho — por isso a
   * régua é injetada (`medirPor`) e o padrão é a janela inteira.
   */
  const TRILHO = 317;
  const faixa = () => ({ inicio: TRILHO, fim: JANELA.largura - TRILHO });
  let forasDaFaixa = 0;
  let dentroDaJanelaSemFaixa = 0;
  for (const x of [-9, -1.2, -0.4, 0, 0.4, 1.2, 9]) {
    for (const px of [4, 60, 172.8, 400]) {
      const p = painelDeMentira();
      const a = criarAncoraDeDocumento(() => p);
      a.medirPor(faixa);
      a.atualizar(ctx({ ndc: { x, y: 0, z: 0.5 }, px }));
      const e = a.estado();
      const esq = JANELA.largura / 2 + e.dx - CAIXA.largura / 2;
      const dir = esq + CAIXA.largura;
      if (esq < TRILHO - 0.05 || dir > JANELA.largura - TRILHO + 0.05) forasDaFaixa += 1;

      /* Sem régua injetada, a faixa é a janela — e o painel volta a poder encostar na borda. */
      const p2 = painelDeMentira();
      const a2 = criarAncoraDeDocumento(() => p2);
      a2.atualizar(ctx({ ndc: { x, y: 0, z: 0.5 }, px }));
      const e2 = a2.estado();
      const esq2 = JANELA.largura / 2 + e2.dx - CAIXA.largura / 2;
      if (esq2 >= -0.05 && esq2 + CAIXA.largura <= JANELA.largura + 0.05) dentroDaJanelaSemFaixa += 1;
    }
  }
  checar('§6b', forasDaFaixa === 0, `a caixa fica dentro da faixa em 28 enquadramentos (${forasDaFaixa} fora)`);
  checar(
    '§6b',
    dentroDaJanelaSemFaixa === 28,
    `sem régua injetada o padrão é a JANELA, e ela continua contendo (${dentroDaJanelaSemFaixa}/28)`
  );
}

// ───────────────────────────────────────────────────────────────── §6 · O TETO: não perder o texto

console.log(
  `\n${C.forte}§6  O DOCUMENTO NÃO SAI DO QUADRO${C.fim}  ${C.fraco}a CAIXA, nunca o deslocamento${C.fim}`
);
{
  /*
   * ☠️ **ESTA SEÇÃO MEDIA UM PROXY E PASSAVA VERDE COM O DEFEITO NA TELA.** Ela conferia
   * `|dx| ≤ 34% da janela`, que é uma grandeza sobre o DESLOCAMENTO. Medido no céu vivo com o
   * pulsar preenchendo o quadro (raio aparente 172,8 px): `dx = −484,8` estava dentro do teto e a
   * borda esquerda do painel ficou em **−102 px** — o texto fora da janela, a lei verde.
   * O que interessa é a CAIXA PINTADA, e é só ela que se confere aqui.
   *
   * ⚠️ Os casos são VARRIDOS, e não um só: o defeito nasceu de um raio grande, e um corpo por
   * seção deixaria a lei cega para a combinação seguinte.
   */
  const casos = [];
  for (const x of [-9, -1.2, -0.9, -0.2, 0, 0.2, 0.9, 1.2, 9]) {
    for (const y of [-7, -0.9, 0, 0.9, 7]) {
      for (const px of [4, 60, 172.8, 400]) {
        const p = painelDeMentira();
        const a = criarAncoraDeDocumento(() => p);
        a.atualizar(ctx({ ndc: { x, y, z: 0.5 }, px }));
        const e = a.estado();
        const esq = JANELA.largura / 2 + e.dx - CAIXA.largura / 2;
        const topo = JANELA.altura / 2 + e.dy - CAIXA.altura / 2;
        /*
         * ☠️ **O piso duro é ZERO — a JANELA —, e não `MARGEM_PX`.** Esta lei importa a constante
         * do módulo, então uma conferência contra ela é tautologia: visto por mutação, baixar a
         * margem para 0 relaxava a lei junto e a mutação passava verde. O que não pode acontecer
         * em margem nenhuma é o texto sair da tela; a margem DECLARADA é conferida à parte, e é
         * uma afirmação mais fraca de propósito.
         */
        casos.push({
          x,
          y,
          px,
          esq,
          topo,
          dentro:
            esq >= -0.05 &&
            topo >= -0.05 &&
            esq + CAIXA.largura <= JANELA.largura + 0.05 &&
            topo + CAIXA.altura <= JANELA.altura + 0.05,
          comMargem:
            esq >= MARGEM_PX - 0.05 &&
            topo >= MARGEM_PX - 0.05 &&
            esq + CAIXA.largura <= JANELA.largura - MARGEM_PX + 0.05 &&
            topo + CAIXA.altura <= JANELA.altura - MARGEM_PX + 0.05,
        });
      }
    }
  }
  const fora = casos.filter((c) => !c.dentro);
  const pior = casos.reduce((a, b) => (Math.min(a.esq, a.topo) < Math.min(b.esq, b.topo) ? a : b));
  checar(
    '§6',
    fora.length === 0,
    `a caixa PINTADA fica dentro da JANELA nos ${casos.length} enquadramentos varridos ` +
      `(pior borda: esq ${pior.esq.toFixed(0)} px, topo ${pior.topo.toFixed(0)} px)` +
      (fora.length ? ` — ${fora.length} fora, o primeiro em ndc.x ${fora[0].x} px ${fora[0].px}` : '')
  );
  const semMargem = casos.filter((c) => !c.comMargem);
  checar(
    '§6a',
    semMargem.length === 0,
    `e respeita a margem DECLARADA de ${MARGEM_PX} px${semMargem.length ? ` — ${semMargem.length} não respeitam` : ''} ` +
      '(afirmação mais fraca: ela lê a constante do próprio módulo)'
  );

  const p = painelDeMentira();
  const a = criarAncoraDeDocumento(() => p);
  a.atualizar(ctx({ ndc: { x: -9, y: 7, z: 0.5 }, px: 400 }));
  checar(
    '§6b',
    a.estado().noTeto === true,
    'e a sonda DIZ que encostou na borda — «encostou» e «acompanhou» não podem ter a mesma leitura'
  );

  const pc = painelDeMentira();
  const ac = criarAncoraDeDocumento(() => pc);
  ac.atualizar(ctx({ ndc: { x: 0.55, y: 0, z: 0.5 }, px: 40 }));
  checar(
    '§6c',
    ac.estado().noTeto === false,
    'e o caso que CABE não é anunciado como encostado — um aviso que sai sempre não distingue nada'
  );
}

// ─────────────────────────────────────────────── §7 · O LADO: o painel foge da borda, não para ela

console.log(`\n${C.forte}§7  O PAINEL ENCOSTA NO LADO COM MAIS JANELA${C.fim}`);
{
  const pd = painelDeMentira();
  const ad = criarAncoraDeDocumento(() => pd);
  ad.atualizar(ctx({ ndc: { x: 0.6, y: 0, z: 0.5 } }));
  const dir = ad.estado();

  const pe = painelDeMentira();
  const ae = criarAncoraDeDocumento(() => pe);
  ae.atualizar(ctx({ ndc: { x: -0.6, y: 0, z: 0.5 } }));
  const esq = ae.estado();

  checar(
    '§7',
    dir.lado === 'esquerda' && esq.lado === 'direita',
    'corpo à direita → painel à ESQUERDA dele, e vice-versa; lado fixo poria o texto fora da janela'
  );
  /*
   * ⚠️ **NÃO se confere pelo SINAL de `dx`, e a primeira versão desta lei se enganou aí.** O
   * painel nasce no CENTRO da janela; com o corpo a 80% da largura, pô-lo à esquerda DELE ainda
   * desloca o painel para a DIREITA do centro. O sinal responde sobre o centro da tela; a lei fala
   * do corpo. Quem confere é a posição final contra `cx`.
   */
  const centroFinal = (e) => JANELA.largura / 2 + e.dx;
  const folgaMinima = (e) => Math.abs(centroFinal(e) - e.x) - CAIXA.largura / 2;
  checar(
    '§7b',
    centroFinal(dir) < dir.x && centroFinal(esq) > esq.x,
    `o painel termina do lado escolhido DO CORPO (dir: ${centroFinal(dir).toFixed(0)} < ${dir.x}; ` +
      `esq: ${centroFinal(esq).toFixed(0)} > ${esq.x})`
  );
  checar(
    '§7c',
    folgaMinima(dir) >= dir.px && folgaMinima(esq) >= esq.px,
    `e a borda do painel fica FORA do limbo (folga ${folgaMinima(dir).toFixed(0)} px ≥ raio ${dir.px} px) ` +
      '— encostar não é cobrir o corpo que é o assunto'
  );
}

// ─────────────────────────────────────────── §8 · ELE NÃO ESCREVE NO QUE MEDE

console.log(`\n${C.forte}§8  O QUE ELE ESCREVE, E NADA ALÉM${C.fim}`);
{
  /*
   * A regra é o NAMESPACE, e não uma lista de nomes: propriedade customizada não altera
   * comportamento sozinha — só o CSS que a consome altera. Enquanto tudo o que sai daqui for
   * `--ancora-*`, o módulo não tem como mexer em `pointer-events`, `display` ou `position`, que é
   * o que derrubaria a regra do palco. Uma lista de nomes envelheceria a cada variável nova; esta
   * não.
   */
  const DO_MODULO = /^--ancora-[a-z-]+$/;
  const ATRIBUTOS = new Set(['ancorado', 'ancoraLado']);
  const p = painelDeMentira();
  const a = criarAncoraDeDocumento(() => p);
  for (const x of [-0.8, -0.2, 0.3, 0.9]) a.atualizar(ctx({ ndc: { x, y: x / 2, z: 0.5 } }));
  a.atualizar(null);
  const escritas = [...new Set([...p.escritas, ...p.removidas])];
  const fora = escritas.filter((k) => !DO_MODULO.test(k));
  checar(
    '§8',
    fora.length === 0,
    `as ${escritas.length} escritas são todas \`--ancora-*\` (fora do namespace: ${fora.join(', ') || 'nenhuma'}) ` +
      '— `pointer-events`, `display` ou `position` daqui derrubariam a regra do palco'
  );
  const atribFora = Object.keys(p.dataset).filter((k) => !ATRIBUTOS.has(k));
  checar(
    '§8b',
    atribFora.length === 0,
    `e os atributos são só \`data-ancorado\` e \`data-ancora-lado\` (fora: ${atribFora.join(', ') || 'nenhum'})`
  );
}

// ─────────────────────────────────── §10 · A LUZ VEM DO CORPO — profundidade e paralaxe

console.log(`\n${C.forte}§10  A LUZ VEM DO CORPO${C.fim}  ${C.fraco}um mecanismo, dois efeitos${C.fim}`);
{
  const lerLuz = (p) => ({
    x: parseFloat(p.style.props['--ancora-luz-x'] ?? 'NaN'),
    y: parseFloat(p.style.props['--ancora-luz-y'] ?? 'NaN'),
    raio: parseFloat(p.style.props['--ancora-luz-raio'] ?? 'NaN'),
    forca: parseFloat(p.style.props['--ancora-luz-forca'] ?? 'NaN'),
  });

  /*
   * ☠️ **O GRADIENTE NÃO PODE REPINTAR POR QUADRO.** `transform` é composto e sai de graça; um
   * `radial-gradient` numa caixa de ~660×220 é PINTURA. Com o painel acompanhando o corpo, a luz
   * fica parada RELATIVA à caixa — logo o gradiente é escrito UMA vez e não se toca mais.
   */
  const p = painelDeMentira();
  const a = criarAncoraDeDocumento(() => p);
  const parado = ctx({ ndc: { x: -0.3, y: 0.1, z: 0.5 }, px: 90 });
  for (let q = 0; q < 240; q++) a.atualizar(parado);
  checar(
    '§10',
    a.estado().luz.repinturas === 1,
    `câmera parada, 240 quadros → ${a.estado().luz.repinturas} repintura do gradiente`
  );

  /*
   * Corpo ANDANDO sem o painel encostar: a luz continua parada, porque o painel o acompanha.
   *
   * ⚠️ A PREMISSA É CONFERIDA, não suposta. A primeira versão desta seção varreu até o corpo cruzar
   * o meio da janela — ali o painel troca de lado E prende na borda —, e a lei reprovou por um
   * comportamento CERTO. Uma lei que supõe o próprio cenário mede outra coisa.
   */
  const pA = painelDeMentira();
  const aA = criarAncoraDeDocumento(() => pA);
  let sempreLivre = true;
  for (const x of [-0.5, -0.43, -0.36, -0.29, -0.22, -0.15]) {
    aA.atualizar(ctx({ ndc: { x, y: 0.1, z: 0.5 }, px: 90 }));
    if (aA.estado().noTeto || aA.estado().lado !== 'direita') sempreLivre = false;
  }
  checar(
    '§10b-premissa',
    sempreLivre,
    'a varredura mantém o painel LIVRE e do mesmo lado — é o cenário que a §10b afirma medir'
  );
  checar(
    '§10b',
    aA.estado().luz.repinturas === 1,
    `corpo atravessando o quadro com o painel livre: ${aA.estado().luz.repinturas} repintura ` +
      '— o painel segue o corpo, então a luz não anda sobre a caixa e não há paralaxe a mostrar'
  );

  /*
   * E ele APARECE quando o painel encosta na borda e o corpo continua: aí a superfície para e a
   * luz desliza sobre ela. É o único momento em que profundidade tem o que revelar.
   */
  const pB = painelDeMentira();
  const aB = criarAncoraDeDocumento(() => pB);
  const trilhaLuz = [];
  for (const x of [0.6, 0.75, 0.9, 1.05, 1.2]) {
    aB.atualizar(ctx({ ndc: { x, y: 0, z: 0.5 }, px: 90 }));
    trilhaLuz.push(lerLuz(pB).x);
  }
  const deslizou = Math.abs(trilhaLuz[trilhaLuz.length - 1] - trilhaLuz[0]);
  checar(
    '§10c',
    aB.estado().noTeto === true && deslizou > PASSO_DA_LUZ,
    `painel PRESO na borda e corpo andando: a luz desliza ${deslizou.toFixed(0)} px sobre a superfície ` +
      '— é aqui que o paralaxe existe, e ele sai do mesmo mecanismo da profundidade'
  );

  /*
   * O RAIO cobre o canto mais distante da caixa. Sem isso o gradiente termina no meio do painel e a
   * queda vira uma borda dura — «retângulo preto sólido» com um degradê colado em cima.
   */
  const semCobrir = [];
  for (const x of [-1.4, -0.7, 0, 0.7, 1.4]) {
    for (const y of [-1, 0, 1]) {
      for (const px of [4, 60, 173, 400]) {
        const pc = painelDeMentira();
        const ac = criarAncoraDeDocumento(() => pc);
        ac.atualizar(ctx({ ndc: { x, y, z: 0.5 }, px }));
        const l = lerLuz(pc);
        const canto = Math.hypot(Math.abs(l.x) + CAIXA.largura / 2, Math.abs(l.y) + CAIXA.altura / 2);
        if (l.raio < canto - 0.5) semCobrir.push({ x, y, px, raio: l.raio, canto });
      }
    }
  }
  checar(
    '§10d',
    semCobrir.length === 0,
    `o raio alcança o canto mais distante em todos os ${5 * 3 * 4} enquadramentos` +
      (semCobrir.length
        ? ` — ${semCobrir.length} falham, o primeiro raio ${semCobrir[0].raio.toFixed(0)} < ${semCobrir[0].canto.toFixed(0)}`
        : '')
  );

  /*
   * ⚠️ A FORÇA é razão contra um limiar FIXO, saturada em 1 — nunca posto nem percentil. Grandeza
   * de posto encolhe sozinha conforme o corpus cresce; esta vale igual em qualquer céu.
   */
  const forcaDe = (px) => {
    const pf = painelDeMentira();
    const af = criarAncoraDeDocumento(() => pf);
    af.atualizar(ctx({ ndc: { x: 0, y: 0, z: 0.5 }, px }));
    return lerLuz(pf).forca;
  };
  const f4 = forcaDe(4);
  const fMeio = forcaDe(LUZ_PLENA_PX / 2);
  const fPleno = forcaDe(LUZ_PLENA_PX);
  const fAlem = forcaDe(LUZ_PLENA_PX * 9);
  checar(
    '§10e',
    f4 > 0 && Math.abs(fMeio - 0.5) < 0.01 && fPleno === 1 && fAlem === 1,
    `força ${f4.toFixed(2)} · ${fMeio.toFixed(2)} · ${fPleno.toFixed(2)} · ${fAlem.toFixed(2)} ` +
      `para raio 4 · ${LUZ_PLENA_PX / 2} · ${LUZ_PLENA_PX} · ${LUZ_PLENA_PX * 9} px — ` +
      'razão adimensional contra limiar FIXO, e ela SATURA em vez de crescer sem fim'
  );

  /* A borda acesa é a que ENCOSTA no corpo, e o CSS a escolhe por este atributo. */
  const pd = painelDeMentira();
  const ad = criarAncoraDeDocumento(() => pd);
  ad.atualizar(ctx({ ndc: { x: 0.6, y: 0, z: 0.5 } }));
  const ladoDir = pd.dataset.ancoraLado;
  ad.atualizar(ctx({ ndc: { x: -0.6, y: 0, z: 0.5 } }));
  checar(
    '§10f',
    ladoDir === 'esquerda' && pd.dataset.ancoraLado === 'direita',
    'o lado viaja em `data-ancora-lado` e ACOMPANHA a troca — borda acesa fixa afirmaria uma ' +
      'direção de luz que a cena não tem'
  );

  /* Soltar apaga a luz: gradiente congelado num painel que não está mais ancorado é afirmação velha. */
  ad.atualizar(null);
  const sobrou = ['--ancora-luz-x', '--ancora-luz-y', '--ancora-luz-raio', '--ancora-luz-forca'].filter(
    (k) => pd.style.props[k] !== undefined
  );
  checar(
    '§10g',
    sobrou.length === 0 && !pd.dataset.ancoraLado,
    `soltar apaga a luz inteira (sobrou: ${sobrou.join(', ') || 'nada'}) e o lado junto`
  );
}

// ─────────────────────────────────────────── §9 · TROCA DE PAINEL: o anterior fica limpo

console.log(`\n${C.forte}§9  O PAINEL QUE SAI NÃO LEVA O DESLOCAMENTO${C.fim}`);
{
  const p1 = painelDeMentira();
  const p2 = painelDeMentira();
  let atual = p1;
  const a = criarAncoraDeDocumento(() => atual);
  a.atualizar(ctx({ ndc: { x: 0.5, y: 0.3, z: 0.5 } }));
  const p1Ancorou = p1.dataset.ancorado === 'sim';
  atual = p2;
  a.atualizar(ctx({ ndc: { x: 0.5, y: 0.3, z: 0.5 } }));
  checar(
    '§9',
    p1Ancorou && !p1.dataset.ancorado && p1.style.props['--ancora-dx'] === undefined,
    'o painel anterior é SOLTO ao ser trocado — a rota desmonta e remonta `fs-content` a cada arquivo'
  );
  checar('§9b', p2.dataset.ancorado === 'sim', 'e o novo ancora no mesmo quadro');
}

console.log('');
if (falhas) {
  console.log(`${C.erro}✗ ${falhas} falha(s)${C.fim}  a âncora do documento não vale.`);
  process.exit(1);
}
console.log(
  `${C.ok}✓ a lei vale${C.fim}  ${C.fraco}o documento tem endereço, não foge, não perde o texto ` +
    `e não muda quem recebe o gesto.${C.fim}`
);
