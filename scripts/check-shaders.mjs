#!/usr/bin/env node
/**
 * Guarda dos blocos GLSL. Rode com `node scripts/check-shaders.mjs`.
 *
 * Existe porque as MESMAS duas armadilhas mordem repetidamente, e as duas falham em silêncio:
 * o arquivo continua sendo JS válido, ou o shader continua compilando, e o sintoma aparece
 * como algo que sumiu da imagem — com o erro só no console, quando aparece.
 *
 * 1. **Crase dentro de `/* glsl *␟/ \`…\``** fecha o template literal do JavaScript. Custou
 *    quatro incidentes nesta base: `M87` num comentário, uma menção a `r`, e duas a nomes de
 *    variáveis. Nos quatro o `node --check` pegou, mas só depois de eu escrever e rodar.
 * 2. **`*␟/` dentro de um comentário de bloco GLSL** fecha o comentário cedo e o resto vira
 *    código — foi assim que `M87*␟/Sgr A*` apagou o buraco negro inteiro da cena.
 *
 * ⚠️ Este arquivo escreve `*␟/` com um separador invisível de propósito: escrevê-lo literal
 * dentro do próprio comentário fecharia ESTE comentário, que é a armadilha nº 2 se
 * autoaplicando. A ironia é real e é a melhor demonstração de por que a guarda existe.
 *
 * O que ele NÃO faz: compilar o GLSL. Não há validador na máquina, e é por isso que a bancada
 * (`canvas.html`) continua sendo o único lugar que prova que um shader roda — foi ela que
 * pegou `snoise` vs `simplex3`, que nenhuma checagem de texto acharia.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('../src', import.meta.url).pathname;
const ABRE = '/* glsl */ `';

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return nome.endsWith('.js') ? [caminho] : [];
  });
}

/** Extrai os blocos GLSL de um arquivo, pelo delimitador que a base usa. */
function blocos(texto) {
  const achados = [];
  let de = texto.indexOf(ABRE);
  while (de >= 0) {
    const inicio = de + ABRE.length;
    // O fecho é uma crase no INÍCIO de uma linha — a convenção de todos os shaders daqui.
    const fim = texto.indexOf('\n`', inicio);
    if (fim < 0) break;
    achados.push({ corpo: texto.slice(inicio, fim), linha: texto.slice(0, de).split('\n').length });
    de = texto.indexOf(ABRE, fim);
  }
  return achados;
}

let falhas = 0;
const FECHA_COMENTARIO = '*' + '/';

for (const caminho of arquivos(RAIZ)) {
  const texto = readFileSync(caminho, 'utf8');
  if (!texto.includes(ABRE)) continue;

  for (const { corpo, linha } of blocos(texto)) {
    const curto = caminho.slice(caminho.indexOf('/src/') + 1);

    /*
     * Linha REAL do defeito, não a de abertura do bloco.
     *
     * Até 2026-08-07 as quatro mensagens apontavam `linha`, que é onde o `/* glsl *␟/` começa —
     * às vezes centenas de linhas antes. Custou duas rodadas de busca manual num bloco de 100
     * linhas com TRÊS crases: a mensagem dizia 223 e nenhuma delas estava lá. Guarda que acha o
     * defeito e não sabe dizer onde ele está devolve metade do trabalho para quem chamou.
     *
     * O corpo começa logo depois do delimitador, na MESMA linha da abertura — por isso a soma é
     * `linha + quebras antes do offset`, sem +1.
     */
    const linhaDe = (offset) => linha + corpo.slice(0, offset).split('\n').length - 1;
    const trecho = (offset) => {
      const de = corpo.lastIndexOf('\n', offset) + 1;
      const ate = corpo.indexOf('\n', offset);
      return corpo
        .slice(de, ate < 0 ? undefined : ate)
        .trim()
        .slice(0, 72);
    };

    /*
     * TODAS as crases, uma mensagem por LINHA.
     *
     * Avisar só da primeira faria uma volta ao editor por crase — com três no mesmo bloco, três
     * rodadas de `node` para uma informação que a primeira passada já tinha inteira.
     *
     * E o agrupamento por linha não é cosmético: um par de crases (`assim`) são DUAS ocorrências
     * e um conserto só. Duas mensagens idênticas para a mesma linha gastam a atenção de quem lê
     * sem acrescentar endereço nenhum — e é a atenção dele que esta guarda existe para poupar.
     */
    const crasesPorLinha = new Map();
    for (let i = corpo.indexOf('`'); i >= 0; i = corpo.indexOf('`', i + 1)) {
      const onde = linhaDe(i);
      if (!crasesPorLinha.has(onde)) crasesPorLinha.set(onde, { quantas: 0, trecho: trecho(i) });
      crasesPorLinha.get(onde).quantas += 1;
    }
    for (const [onde, { quantas, trecho: texto }] of crasesPorLinha) {
      const quantidade = quantas > 1 ? ` (${quantas} nesta linha)` : '';
      console.error(
        `${curto}:${onde} — CRASE dentro do bloco GLSL: fecha o template do JS.${quantidade}\n` +
          `    ${texto}`
      );
      falhas += 1;
    }

    // Comentários de bloco têm de estar balanceados e não aninhados: GLSL não aninha, então um
    // `/*` dentro de outro faz o primeiro fecho terminar os dois.
    let abertoEm = -1;
    for (let i = 0; i < corpo.length - 1; i++) {
      const par = corpo.slice(i, i + 2);
      if (par === '/*') {
        if (abertoEm >= 0) {
          console.error(
            `${curto}:${linhaDe(i)} — /* ANINHADO no bloco GLSL: GLSL não aninha comentário.\n` +
              `    o de fora abriu em ${curto}:${linhaDe(abertoEm)}`
          );
          falhas += 1;
          break;
        }
        abertoEm = i;
        i += 1;
      } else if (par === FECHA_COMENTARIO) {
        if (abertoEm < 0) {
          console.error(
            `${curto}:${linhaDe(i)} — fecho de comentário ÓRFÃO no bloco GLSL.\n    ${trecho(i)}`
          );
          falhas += 1;
          break;
        }
        abertoEm = -1;
        i += 1;
      }
    }
    // A linha que importa aqui é a da ABERTURA, não a do fim do bloco: é lá que falta o fecho.
    if (abertoEm >= 0) {
      console.error(
        `${curto}:${linhaDe(abertoEm)} — comentário de bloco ABERTO sem fechar no GLSL.\n` +
          `    ${trecho(abertoEm)}`
      );
      falhas += 1;
    }
  }
}

if (falhas) {
  console.error(`\n${falhas} problema(s) em blocos GLSL.`);
  process.exit(1);
}
console.log('blocos GLSL: ok');
