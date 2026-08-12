/**
 * CENSO DO CORPUS — a forma do índice, a saúde das constantes calibradas e o sinal de cada
 * candidata do modelo declarado.
 *
 * Complementa `censo-morfologias.mjs`, que mede o que o céu DESENHA. Este mede o que o corpus É, e
 * existe por causa de um padrão que mordeu três vezes em 2026-08-07: **constante calibrada contra
 * um corpus e aplicada depois que ele mudou de tamanho ou de escopo**, degradando em silêncio.
 * `SPAN` (71 → 228 hubs), `K_RAIO` (3 644 → 20 308 chunks, 297 luas viraram 0) e o piso do
 * pulsar (medido no git, aplicado no índice, 0 corpos). O relatório completo, com o que foi
 * refutado e por quê, está em `docs/calibracao.md`.
 *
 * Roda contra o servidor no ar, ou contra o cache:
 *
 *     node scripts/censo-corpus.mjs                    # http://127.0.0.1:8787
 *     node scripts/censo-corpus.mjs .cache/graph.json  # offline
 *
 * ⚠️ Ele mede o ÍNDICE, nunca o disco. A diferença decide conclusões: o disco é 58% TypeScript e o
 * índice não tem um único `.ts` — o indexador não ingere código. Quem quiser o disco use
 * `git ls-files`, e não confunda os dois (esse erro já produziu uma recomendação errada).
 */
import fs from 'node:fs';
import { ceuServido } from './lib/ceu-servido.mjs';

const BASE = 'http://127.0.0.1:8787';
const arg = process.argv[2];
// ⚠️ O arquivo por argv é uma foto que o operador escolheu — ele responde por ela. Só o ramo de
// REDE passa pelo helper, que é onde o céu pode não existir.
const graph = arg
  ? JSON.parse(fs.readFileSync(arg, 'utf8'))
  : await ceuServido(BASE, { porque: 'a forma do corpus e a saúde das constantes' });

const nodes = graph.nodes || [];
const files = nodes.filter((n) => n.type === 'file');
const aggs = nodes.filter((n) => n.type !== 'file');
const byId = new Map(nodes.map((n) => [n.id, n]));
const kids = new Map();
let laterais = 0;
for (const [a, b] of graph.edges || []) {
  if (!kids.has(b)) kids.set(b, []);
  kids.get(b).push(byId.get(a));
  if (!byId.has(b) || !byId.has(a)) laterais++;
}
const K = (id) => kids.get(id) || [];
const q = (arr, p) => {
  const s = [...arr].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
};
const pc = (n, t) => `${((n / Math.max(t, 1)) * 100).toFixed(1)}%`;
const titulo = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// ─────────────────────────────────────────────────────────── 1. forma do corpus
titulo('1. FORMA DO CORPUS');
console.log(
  `  nós ${nodes.length}  ·  ${aggs.filter((n) => n.type === 'repo').length} repo · ${aggs.filter((n) => n.type === 'dir').length} dir · ${files.length} file`
);
console.log(`  arestas ${(graph.edges || []).length} — laterais (não-contenção): ${laterais}`);
const ch = aggs.map((n) => n.chunks || 0);
console.log(
  `  agregados, chunks:  min ${q(ch, 0)} · P25 ${q(ch, 0.25)} · MED ${q(ch, 0.5)} · P75 ${q(ch, 0.75)} · P90 ${q(ch, 0.9)} · máx ${q(ch, 0.999)}`
);
const nk = aggs.map((n) => K(n.id).length);
console.log(
  `  agregados, filhos:  min ${q(nk, 0)} · MED ${q(nk, 0.5)} · P75 ${q(nk, 0.75)} · P90 ${q(nk, 0.9)} · máx ${q(nk, 0.999)}`
);
const doisFilhos = aggs.filter((n) => K(n.id).length <= 2).length;
const umKind = aggs.filter(
  (n) =>
    new Set(
      K(n.id)
        .map((c) => c?.kind)
        .filter(Boolean)
    ).size <= 1
).length;
console.log(
  `  com <= 2 filhos: ${doisFilhos} (${pc(doisFilhos, aggs.length)})   com UM kind só: ${umKind} (${pc(umKind, aggs.length)})`
);

/*
 * SISTEMAS — a pasta como ESTRELA e os arquivos dela como planetas.
 *
 * A linha de "filhos" acima conta subpasta junto; o modelo precisa de ARQUIVOS, e é essa
 * diferença que diz se há sistema. Medido em 2026-08-07 para responder se a proporção
 * planeta/estrela teria de ser imposta: **não teria** — ela sai do corpus, e nenhuma pasta
 * tem menos de dois arquivos.
 *
 * ⚠️ Os ÓRFÃOS são a pergunta que decide se o modelo é honesto. Arquivo pendurado direto no
 * repo é planeta sem estrela: ou o repo vira a estrela dele, ou o céu passa a conviver com
 * duas leis de órbita. Sobra sem lei é o que revela que a lei não valia para tudo.
 *
 * ⚠️ E a pasta NÃO está livre: hoje TODO agregado é galáxia (§5). Estes números dizem quantos
 * sistemas existiriam, nunca que a promoção sai de graça — ela reclassifica os mesmos 228
 * corpos que `SPAN` e `MIN_FILES_FOR_ARMS` calibram.
 */
const dirs = aggs.filter((n) => n.type === 'dir');
const porEstrela = dirs.map((n) => K(n.id).filter((c) => c?.type === 'file').length);
const puros = dirs.filter((n) => K(n.id).every((c) => c?.type === 'file')).length;
const semPlaneta = porEstrela.filter((n) => n === 0).length;
const sobDir = porEstrela.reduce((a, b) => a + b, 0);
const orfaos = files.length - sobDir;
console.log(
  `  sistemas: ${dirs.length} pastas — ${puros} só com arquivos · ${dirs.length - puros} com subpasta · ${semPlaneta} SEM planeta`
);
console.log(
  `  planetas por estrela: min ${q(porEstrela, 0)} · P25 ${q(porEstrela, 0.25)} · MED ${q(porEstrela, 0.5)} · P75 ${q(porEstrela, 0.75)} · P90 ${q(porEstrela, 0.9)} · máx ${q(porEstrela, 0.999)}`
);
console.log(
  `  arquivos sob uma pasta: ${sobDir} · \x1b[33mÓRFÃOS (direto no repo): ${orfaos} (${pc(orfaos, files.length)})\x1b[0m`
);
console.log(
  `  razão planeta/estrela: ${(sobDir / Math.max(dirs.length, 1)).toFixed(2)}  ·  contando os repos como estrela: ${(files.length / Math.max(aggs.length, 1)).toFixed(2)}`
);

const ext = {};
for (const f of files) {
  const m = String(f.id).match(/(\.[^./]+)$/);
  ext[m ? m[1].toLowerCase() : '«sem»'] = (ext[m ? m[1].toLowerCase() : '«sem»'] || 0) + 1;
}
const topExt = Object.entries(ext).sort((a, b) => b[1] - a[1]);
console.log(
  `  extensões no índice: ${topExt.length} distintas · dominante ${topExt[0][0]} ${pc(topExt[0][1], files.length)}`
);
const codigo = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'].reduce((s, e) => s + (ext[e] || 0), 0);
if (!codigo)
  console.log('  \x1b[33m⚠️  ZERO arquivos de código no índice — o indexador não ingere .ts/.py\x1b[0m');

// ─────────────────────────────────────────────────────── 2. constantes calibradas
titulo('2. SAÚDE DAS CONSTANTES CALIBRADAS');
const M = graph.stats?.chunks || files.reduce((s, n) => s + (n.chunks || 0), 0);
const A_MIN = 26,
  A_MAX = 62,
  ROCHE = 2.44;
for (const k of [0.7, 0.5]) {
  const corte = ROCHE * k * Math.cbrt(3 * M);
  const frac = Math.max(0, Math.min(1, (A_MAX - corte) / (A_MAX - A_MIN)));
  const flag = corte >= A_MAX ? ' \x1b[31m← NENHUMA LUA\x1b[0m' : '';
  console.log(
    `  K_RAIO ${k.toFixed(2)} → a_corte ${corte.toFixed(1)} (raio máx ${A_MAX})  ${(frac * 100).toFixed(0)}% dos elegíveis${flag}`
  );
}
const size = (c) => 1.5 + Math.log2(1 + (c || 0)) * 0.3;
const sMed = q(
  aggs.map((n) => size(n.chunks)),
  0.5
);
const areaCapote = (71 * Math.PI * 32 * 32) / 0.49;
for (const span of [2.8, 1.5]) {
  const area = aggs.reduce(
    (s, n) => s + Math.PI * ((32 * size(n.chunks)) / sMed) ** 2 * (span / 2.8) ** 2,
    0
  );
  console.log(
    `  SPAN ${span.toFixed(1)} → cobertura de tinta ${((area / areaCapote) * 100).toFixed(0)}%  (referência: 49% com 71 hubs)`
  );
}

// ────────────────────────────────────────────────────────── 3. classes vazias
titulo('3. CLASSES COM POPULAÇÃO ZERO');
const reg = files.map((n) => n.regularity || 0).filter((v) => v > 0);
const acima = reg.filter((v) => v >= 0.5).length;
console.log(
  `  PULSAR   regularidade>0: ${reg.length}  ·  >= 0,50: ${acima}${acima ? '' : `  \x1b[31m← VAZIO (máx ${Math.max(...reg, 0).toFixed(3)})\x1b[0m`}`
);
const partes = files.filter((n) => (n.sections || []).length >= 5 || (n.services || []).length >= 5).length;
console.log(
  `  LUA      arquivos com >= 5 partes: ${partes}  (a geometria corta depois — ver spatia.moons())`
);
const svc = files.filter((n) => (n.services || []).length > 0);
console.log(`  SERVIÇOS ${svc.reduce((s, n) => s + n.services.length, 0)} em ${svc.length} arquivos compose`);

// ───────────────────────────────────────────────────── 4. candidatas declaradas
titulo('4. SINAL DAS CANDIDATAS (o modelo declarado)');
const recs = files.map((n) => n.recency || 0);
const p25rec = q(recs, 0.25);
const chs = files.map((n) => n.chunks || 0);
const linha = (nome, n, nota) =>
  console.log(`  ${nome.padEnd(22)} ${String(n).padStart(5)}  ${pc(n, files.length).padStart(6)}   ${nota}`);
linha(
  'anã branca',
  files.filter(
    (f) => (f.chunks || 0) >= q(chs, 0.75) && !f.churn && !(f.dormant > 0) && (f.recency || 0) <= p25rec
  ).length,
  'massa>=P75, sem atividade, recência<=P25'
);
linha(
  'cometa-extinto',
  files.filter((f) => (f.dormant || 0) >= 2 && !f.churn).length,
  'JÁ no catálogo — régua de comparação'
);
linha('supernova', files.filter((f) => (f.supernova || 0) > 0.001).length, 'JÁ no catálogo — régua');
linha(
  'sem NENHUMA feição',
  files.filter((f) => !(f.sections || []).length && !f.churn && !f.regularity && !f.dormant).length,
  'o buraco: nada os distingue'
);
console.log('  protoestrela · exoplaneta → 0 por construção: o NÓ não existe');
console.log('  binária · entrelaçamento → 0 por construção: a ARESTA não existe');

// ───────────────────────────────────────────── 5. estabilidade da classificação
titulo('5. ESTABILIDADE — percentil vs. limiar absoluto');
const contencao = (n) => {
  if (n.type === 'file') return 'corpo';
  const sub = K(n.id).filter((c) => c && c.type !== 'file').length;
  if (sub >= 2) return 'galáxia';
  const f = K(n.id).length;
  return f >= 12 ? 'aglomerado' : f >= 5 ? 'sistema' : 'hub raso';
};
const dist = {};
for (const n of aggs) dist[contencao(n)] = (dist[contencao(n)] || 0) + 1;
console.log(`  por CONTENÇÃO (limiar absoluto, 0% de reclassificação espúria): ${JSON.stringify(dist)}`);
console.log(`  hoje, TODO agregado é galáxia: ${aggs.length}`);
console.log('  percentil sobre score composto: 74,6% dos nós trocam de classe ao indexar um vault de');
console.log('  notas curtas — medido em 2026-08-07, ver docs/calibracao.md §3.1');
