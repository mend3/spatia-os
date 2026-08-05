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
 * (`sandbox.html`) continua sendo o único lugar que prova que um shader roda — foi ela que
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

    if (corpo.includes('`')) {
      console.error(`${curto}:${linha} — CRASE dentro do bloco GLSL: fecha o template do JS.`);
      falhas += 1;
    }

    // Comentários de bloco têm de estar balanceados e não aninhados: GLSL não aninha, então um
    // `/*` dentro de outro faz o primeiro fecho terminar os dois.
    let aberto = false;
    for (let i = 0; i < corpo.length - 1; i++) {
      const par = corpo.slice(i, i + 2);
      if (par === '/*') {
        if (aberto) {
          console.error(`${curto}:${linha} — /* ANINHADO no bloco GLSL: GLSL não aninha comentário.`);
          falhas += 1;
          break;
        }
        aberto = true;
        i += 1;
      } else if (par === FECHA_COMENTARIO) {
        if (!aberto) {
          console.error(`${curto}:${linha} — fecho de comentário ÓRFÃO no bloco GLSL.`);
          falhas += 1;
          break;
        }
        aberto = false;
        i += 1;
      }
    }
    if (aberto) {
      console.error(`${curto}:${linha} — comentário de bloco ABERTO sem fechar no GLSL.`);
      falhas += 1;
    }
  }
}

if (falhas) {
  console.error(`\n${falhas} problema(s) em blocos GLSL.`);
  process.exit(1);
}
console.log('blocos GLSL: ok');
