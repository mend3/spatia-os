#!/usr/bin/env node
/**
 * A LEI DA ÂNCORA — o documento do corpo em foco tem endereço no mundo, e não foge dele.
 *
 * ## Por que ela existe
 *
 * O painel do corpo travado passou a ser posicionado pela PROJEÇÃO da câmera, por quadro. Três
 * coisas nesse desenho falham **em silêncio**, e nenhuma delas aparece num screenshot:
 *
 * 1. ☠️ **A REALIMENTAÇÃO.** `getBoundingClientRect` inclui o `transform` já aplicado. Ler a caixa
 *    deslocada e calcular o deslocamento a partir dela soma o quadro anterior ao seguinte, e o
 *    painel FOGE — alguns pixels por quadro, sem erro no console, até sair da janela. A 120 Hz
 *    isso é meio segundo. Foi o primeiro defeito desta entrega, e é a §5.
 * 2. ☠️ **O documento PERDIDO.** O corpo em foco sai do quadro quando o operador orbita; um painel
 *    que o siga sem teto sai junto, e o operador fica sem o texto que estava lendo e sem saber por
 *    quê. O teto é a §6.
 * 3. ☠️ **A DEGRADAÇÃO MUDA.** *"O documento não se moveu"* tem quatro causas — sem corpo travado,
 *    painel não montado, corpo atrás da câmera, corpo eclipsado pelo horizonte — e a tela mostra a
 *    mesma imagem nas quatro. Cada uma sai por NOME (§1–§4).
 *
 * ⚠️ **E a lei que protege o resto da tela: ancorar NÃO pode mexer em quem recebe o gesto.** A
 * regra do palco é *quem PINTA reivindica; quem só POSICIONA cede* (`lei-palco.mjs`), e ela vale
 * porque o que se move é a caixa que já pintava. A §8 varre o que o módulo escreve e recusa
 * qualquer propriedade fora das duas variáveis e do atributo de estado.
 *
 * Ele roda em `node` sem navegador: o módulo não importa `three` e só toca o nó que recebe. O DOM
 * é de mentira, com geometria CONHECIDA — é isso que permite afirmar sobre pixel sem GPU.
 *
 * Uso:  node scripts/lei-ancora.mjs
 */
import { criarAncoraDeDocumento, MOTIVOS_DA_ANCORA, MARGEM_PX, FOLGA_EM_RAIOS }
  from '../src/space/ancora-de-documento.js';

const C = { erro: '\x1b[31m', ok: '\x1b[32m', fraco: '\x1b[2m', forte: '\x1b[1m', fim: '\x1b[0m' };
let falhas = 0;
const checar = (secao, condicao, frase) => {
  if (condicao) console.log(`  ${C.ok}✓${C.fim} ${C.fraco}${secao}${C.fim} ${frase}`);
  else { falhas += 1; console.log(`${C.erro}✗ ${secao} ${frase}${C.fim}`); }
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
      setProperty(k, v) { this.props[k] = v; painel.escritas.push(k); },
      removeProperty(k) { delete this.props[k]; painel.removidas.push(k); },
    },
    removeAttribute(k) { delete painel.dataset[k.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase())]; },
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

console.log(`${C.forte}LEI DA ÂNCORA${C.fim}  ${C.fraco}janela ${JANELA.largura}×${JANELA.altura} · `
  + `caixa ${CAIXA.largura}×${CAIXA.altura} · margem ${MARGEM_PX}px · `
  + `folga ${FOLGA_EM_RAIOS}× o raio${C.fim}\n`);

// ───────────────────────────────────────────── §1–§4 · AS QUATRO AUSÊNCIAS SAEM POR NOME

console.log(`${C.forte}§1–§4  AS QUATRO CAUSAS DE «NÃO SE MOVEU»${C.fim}`);
{
  const semPainel = criarAncoraDeDocumento(() => null);
  semPainel.atualizar(ctx());
  checar('§1', semPainel.estado().motivo === MOTIVOS_DA_ANCORA.SEM_PAINEL,
    'painel não montado sai como `painel-nao-montado`, e nada é escrito');

  const p = painelDeMentira();
  const a = criarAncoraDeDocumento(() => p);
  a.atualizar(ctx());
  const ancorou = p.dataset.ancorado === 'sim';
  a.atualizar(null);
  checar('§2', ancorou && a.estado().motivo === MOTIVOS_DA_ANCORA.SEM_CORPO && !p.dataset.ancorado,
    'sem corpo travado sai como `sem-corpo-em-foco` **e o atributo é RETIRADO do nó**');
  checar('§2b', p.style.props['--ancora-dx'] === undefined,
    'soltar apaga as variáveis — deslocamento congelado é como o painel abre torto na próxima rota');

  const p3 = painelDeMentira();
  const a3 = criarAncoraDeDocumento(() => p3);
  a3.atualizar(ctx({ ndc: { x: 0, y: 0, z: 1.4 } }));
  checar('§3', a3.estado().motivo === MOTIVOS_DA_ANCORA.ATRAS && !p3.dataset.ancorado,
    'corpo atrás da câmera (`z > 1`) solta — a projeção espelha, e o painel saltaria para o lado errado');

  const p4 = painelDeMentira();
  const a4 = criarAncoraDeDocumento(() => p4);
  a4.atualizar(ctx({ eclipsado: true }));
  checar('§4', a4.estado().motivo === MOTIVOS_DA_ANCORA.ECLIPSADO && !p4.dataset.ancorado,
    'corpo atrás do horizonte solta com motivo PRÓPRIO — não é o mesmo fato que «não há corpo»');
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
  checar('§5', deriva < 1,
    `com a câmera parada o deslocamento ESTABILIZA (${primeiro} → ${ultimo}, deriva ${deriva.toFixed(2)} px em 240 quadros) `
    + '— `getBoundingClientRect` inclui o `transform`, e ler a caixa deslocada faria o painel fugir');
  const todosIguais = trilha.every((v) => Math.abs(v - primeiro) < 1);
  checar('§5b', todosIguais, 'e nenhum quadro do meio se desvia — fuga que volta sozinha ainda é fuga');
}

// ───────────────────────────────────────────────────────────────── §6 · O TETO: não perder o texto

console.log(`\n${C.forte}§6  O DOCUMENTO NÃO SAI DO QUADRO${C.fim}  ${C.fraco}a CAIXA, nunca o deslocamento${C.fim}`);
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
          x, y, px, esq, topo,
          dentro: esq >= -0.05 && topo >= -0.05
            && esq + CAIXA.largura <= JANELA.largura + 0.05
            && topo + CAIXA.altura <= JANELA.altura + 0.05,
          comMargem: esq >= MARGEM_PX - 0.05 && topo >= MARGEM_PX - 0.05
            && esq + CAIXA.largura <= JANELA.largura - MARGEM_PX + 0.05
            && topo + CAIXA.altura <= JANELA.altura - MARGEM_PX + 0.05,
        });
      }
    }
  }
  const fora = casos.filter((c) => !c.dentro);
  const pior = casos.reduce((a, b) => (Math.min(a.esq, a.topo) < Math.min(b.esq, b.topo) ? a : b));
  checar('§6', fora.length === 0,
    `a caixa PINTADA fica dentro da JANELA nos ${casos.length} enquadramentos varridos `
    + `(pior borda: esq ${pior.esq.toFixed(0)} px, topo ${pior.topo.toFixed(0)} px)`
    + (fora.length ? ` — ${fora.length} fora, o primeiro em ndc.x ${fora[0].x} px ${fora[0].px}` : ''));
  const semMargem = casos.filter((c) => !c.comMargem);
  checar('§6a', semMargem.length === 0,
    `e respeita a margem DECLARADA de ${MARGEM_PX} px${semMargem.length ? ` — ${semMargem.length} não respeitam` : ''} `
    + '(afirmação mais fraca: ela lê a constante do próprio módulo)');

  const p = painelDeMentira();
  const a = criarAncoraDeDocumento(() => p);
  a.atualizar(ctx({ ndc: { x: -9, y: 7, z: 0.5 }, px: 400 }));
  checar('§6b', a.estado().noTeto === true,
    'e a sonda DIZ que encostou na borda — «encostou» e «acompanhou» não podem ter a mesma leitura');

  const pc = painelDeMentira();
  const ac = criarAncoraDeDocumento(() => pc);
  ac.atualizar(ctx({ ndc: { x: 0.55, y: 0, z: 0.5 }, px: 40 }));
  checar('§6c', ac.estado().noTeto === false,
    'e o caso que CABE não é anunciado como encostado — um aviso que sai sempre não distingue nada');
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

  checar('§7', dir.lado === 'esquerda' && esq.lado === 'direita',
    'corpo à direita → painel à ESQUERDA dele, e vice-versa; lado fixo poria o texto fora da janela');
  /*
   * ⚠️ **NÃO se confere pelo SINAL de `dx`, e a primeira versão desta lei se enganou aí.** O
   * painel nasce no CENTRO da janela; com o corpo a 80% da largura, pô-lo à esquerda DELE ainda
   * desloca o painel para a DIREITA do centro. O sinal responde sobre o centro da tela; a lei fala
   * do corpo. Quem confere é a posição final contra `cx`.
   */
  const centroFinal = (e) => JANELA.largura / 2 + e.dx;
  const folgaMinima = (e) => Math.abs(centroFinal(e) - e.x) - CAIXA.largura / 2;
  checar('§7b', centroFinal(dir) < dir.x && centroFinal(esq) > esq.x,
    `o painel termina do lado escolhido DO CORPO (dir: ${centroFinal(dir).toFixed(0)} < ${dir.x}; `
    + `esq: ${centroFinal(esq).toFixed(0)} > ${esq.x})`);
  checar('§7c', folgaMinima(dir) >= dir.px && folgaMinima(esq) >= esq.px,
    `e a borda do painel fica FORA do limbo (folga ${folgaMinima(dir).toFixed(0)} px ≥ raio ${dir.px} px) `
    + '— encostar não é cobrir o corpo que é o assunto');
}

// ─────────────────────────────────────────── §8 · ELE NÃO ESCREVE NO QUE MEDE

console.log(`\n${C.forte}§8  O QUE ELE ESCREVE, E NADA ALÉM${C.fim}`);
{
  const PERMITIDO = new Set(['--ancora-dx', '--ancora-dy']);
  const p = painelDeMentira();
  const a = criarAncoraDeDocumento(() => p);
  for (const x of [-0.8, -0.2, 0.3, 0.9]) a.atualizar(ctx({ ndc: { x, y: x / 2, z: 0.5 } }));
  a.atualizar(null);
  const fora = [...new Set([...p.escritas, ...p.removidas])].filter((k) => !PERMITIDO.has(k));
  checar('§8', fora.length === 0,
    `só \`--ancora-dx\` e \`--ancora-dy\` são escritas (fora da lista: ${fora.join(', ') || 'nenhuma'}) `
    + '— `pointer-events`, `display` ou `position` daqui derrubariam a regra do palco');
  checar('§8b', Object.keys(p.dataset).every((k) => k === 'ancorado'),
    'e o único atributo é `data-ancorado`');
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
  checar('§9', p1Ancorou && !p1.dataset.ancorado && p1.style.props['--ancora-dx'] === undefined,
    'o painel anterior é SOLTO ao ser trocado — a rota desmonta e remonta `fs-content` a cada arquivo');
  checar('§9b', p2.dataset.ancorado === 'sim', 'e o novo ancora no mesmo quadro');
}

console.log('');
if (falhas) {
  console.log(`${C.erro}✗ ${falhas} falha(s)${C.fim}  a âncora do documento não vale.`);
  process.exit(1);
}
console.log(`${C.ok}✓ a lei vale${C.fim}  ${C.fraco}o documento tem endereço, não foge, não perde o texto `
  + `e não muda quem recebe o gesto.${C.fim}`);
