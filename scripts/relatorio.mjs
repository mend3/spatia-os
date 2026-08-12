/**
 * Measures the served corpus and WRITES `docs/relatorio.md`.
 *
 *     make relatorio
 *
 * ☠️ **The report is DERIVED, never edited by hand.** Corpus counts are not a property of this
 * project: they change per environment, per operator and per corpus. A number like that written
 * into a doc is not a measurement — it is the photograph of one machine's index, on one day,
 * presented as a fact of the system. Every number this file emits carries which corpus produced it
 * and when the run happened, so a reader refits it instead of inheriting the photo.
 *
 * ⚠️ **It captures the censuses, it does not reimplement them.** `censo-corpus` owns the health of
 * the calibrated constants, `censo-morfologias` owns what the sky draws, `censo-ontologia` owns
 * family/type/porte/fenomeno. Recomputing any of that here would be a second source for the same
 * truth, and the one that drifts first is always the one nobody is watching.
 *
 * ⭑ **The REASON behind each constant is not here** — it does not come from a measurement and no
 * script regenerates it. It lives in `docs/calibracao.md`, addressed by clause, and source code
 * cites those clause numbers.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SPATIA = process.env.SPATIA_HTTP || 'http://127.0.0.1:8787';
const SAIDA = 'docs/relatorio.md';

/** Terminal colour is for a terminal; inside a fenced block it is noise that diffs badly. */
const semCores = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+$/gm, '');

const buscar = async (rota) => {
  const r = await fetch(`${SPATIA}${rota}`).catch(() => null);
  if (!r || !r.ok) return null;
  return r.json().catch(() => null);
};

const grafo = await buscar('/api/graph');
if (!grafo) {
  console.error(
    `\x1b[31m${SPATIA} não responde.\x1b[0m O relatório descreve o céu SERVIDO — sem servidor não há o que medir.\n` +
      '  suba com: make serve'
  );
  process.exit(1);
}
const saude = (await buscar('/api/health')) || {};

const corpus = grafo.corpus || {};
if (!corpus.collection) {
  console.error(
    '\x1b[31mo servidor não nomeia a coleção servida.\x1b[0m Um relatório sem corpus declarado afirma\n' +
      '  sobre um céu que ninguém sabe qual é — escolha a pasta em #/storage.'
  );
  process.exit(1);
}

/** A census run: its own stdout, verbatim. Failure is reported, never hidden behind an empty block. */
const censo = (arquivo) => {
  try {
    return semCores(execFileSync('node', [`scripts/${arquivo}`], { encoding: 'utf8', maxBuffer: 32e6 }));
  } catch (e) {
    const saida = semCores(`${e.stdout || ''}${e.stderr || ''}`).trim();
    return `${saida}\n\n[!] ${arquivo} saiu com erro — o bloco acima é o que ele chegou a emitir.`;
  }
};

console.log(`relatório do corpus ${corpus.collection}`);
const blocos = [];
for (const [titulo, arquivo, pergunta] of [
  ['Forma do corpus, e a saúde das constantes', 'censo-corpus.mjs', 'o corpus É o quê, e alguma constante calibrada ficou sem população?'],
  ['O que o céu DESENHA', 'censo-morfologias.mjs', 'classe, pele e morfologia — a distribuição que o operador vê'],
  ['A ontologia', 'censo-ontologia.mjs', 'família, tipo, porte e fenômeno'],
]) {
  process.stdout.write(`  ${arquivo}… `);
  blocos.push({ titulo, arquivo, pergunta, saida: censo(arquivo) });
  console.log('ok');
}

const nos = (grafo.nodes || []).length;
const st = grafo.stats || {};
const servico = (nome) => {
  const v = saude[nome];
  if (!v || typeof v !== 'object') return '—';
  return v.online ? 'no ar' : 'fora';
};

// A data sai do RELÓGIO DA CORRIDA e mora no corpo, nunca no nome do arquivo: nome com data
// envelhece parecendo obsoleto mesmo quando o conteúdo é regenerado, e foi assim que o antecessor
// deste relatório passou a ser lido como história.
const agora = new Date().toISOString().replace('T', ' ').slice(0, 16);

const texto = `# Relatório do corpus — o retrato de HOJE

> ☠️ **ARQUIVO GERADO. Não edite à mão.** Ele é reescrito inteiro por \`make relatorio\`, e uma
> edição manual some na próxima corrida sem deixar rastro.
>
> ⭑ **A RAZÃO de cada constante não está aqui** — ela não sai de medição nenhuma e mora em
> [\`calibracao.md\`](./calibracao.md), endereçada por cláusula, que é o que o código cita.
> Aqui fica só o que uma corrida produz.

| | |
|---|---|
| corpus | \`${corpus.collection}\` |
| raiz | \`${corpus.cwd || '(não declarada)'}\` |
| prefixo podado | ${corpus.prefix ? `\`${corpus.prefix}\`` : '(vazio)'} |
| gerado em | ${agora} UTC |
| por | \`make relatorio\` |

⚠️ **Estes números descrevem UM corpus, numa máquina, num instante.** Eles não são propriedade
deste projeto: mudam de ambiente para ambiente e de operador para operador. Rode o comando de novo
em vez de citar este parágrafo.

## O retrato, em uma linha

| grandeza | valor |
|---|---|
| corpos no céu | ${nos} |
| arquivos | ${st.files ?? '—'} |
| chunks | ${st.chunks ?? '—'} |
| agregados (hubs) | ${st.hubs ?? '—'} |
| repositórios | ${Object.keys(st.repos || {}).length || '—'} |

| subsistema | estado |
|---|---|
| Qdrant | ${servico('qdrant')}${saude.qdrant?.points != null ? ` · ${saude.qdrant.points} pontos` : ''} |
| Neo4j | ${servico('neo4j')}${saude.neo4j?.corpos != null ? ` · ${saude.neo4j.corpos} corpos` : ''} |
| cérebro offline | ${servico('ollama')} |
| voz | ${servico('tts')} |
| CLI \`claude\` | ${saude.claude_cli ? 'no PATH' : 'ausente — o cérebro \`claude\` não responde'} |

${blocos
  .map(
    (b) => `## ${b.titulo}

*${b.pergunta}* — \`node scripts/${b.arquivo}\`

\`\`\`
${b.saida.trim()}
\`\`\`
`
  )
  .join('\n')}
---

⚠️ **Classe sem população é o sinal que este relatório existe para dar.** Uma constante calibrada
contra um corpus continua valendo depois que ele muda de tamanho, e o sintoma não é erro: é uma
classe que some do céu. O \`censo-corpus\` acima acusa em vermelho quem ficou vazio — e a derivação
de cada uma está em [\`calibracao.md\`](./calibracao.md) §2.
`;

writeFileSync(SAIDA, texto);
console.log(`\n✓ ${SAIDA} — ${nos} corpos de \`${corpus.collection}\``);
