/**
 * Parser do formato de exposição do Prometheus.
 *
 * Existe porque 21 famílias de métrica são derivadas do mesmo stream que desenha a cena e
 * ninguém as lê: ler exigia `curl /metrics` e olhar texto. Nenhum backend novo — o servidor já
 * publica tudo, faltava um leitor.
 *
 * Deliberadamente parcial: lê nome, labels, valor e `_bucket`, que é o que as telas pedem.
 * `exemplars`, timestamps e `NaN` não aparecem nesta exposição (`server/metrics.py` é escrito à
 * mão) e um parser que os tratasse seria código sem chamador.
 */

/** `{route="static",status="200"}` → `{route: 'static', status: '200'}` */
function parseLabels(raw) {
  const labels = {};
  if (!raw) return labels;
  // Valor entre aspas com escapes; o nome não tem aspas. Um `split(',')` quebraria num valor
  // que contém vírgula — e `detail=` de ferramenta contém.
  const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = pattern.exec(raw))) labels[match[1]] = match[2].replace(/\\(.)/g, '$1');
  return labels;
}

/**
 * @returns {Map<string, {help: string, type: string, samples: Array<{labels: object, value: number}>}>}
 */
export function parse(text) {
  const families = new Map();
  const family = (name) => {
    if (!families.has(name)) families.set(name, { help: '', type: '', samples: [] });
    return families.get(name);
  };

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('# HELP ')) {
      const [name, ...rest] = line.slice(7).split(' ');
      family(name).help = rest.join(' ');
      continue;
    }
    if (line.startsWith('# TYPE ')) {
      const [name, type] = line.slice(7).split(' ');
      family(name).type = type;
      continue;
    }
    if (line.startsWith('#')) continue;

    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{.*\})?\s+(.+)$/.exec(line);
    if (!match) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value)) continue;
    /*
     * A amostra vai para a família do SUFIXO (`_bucket`, `_sum`, `_count`), e não para o nome
     * base: é assim que `histogram_quantile` acha os buckets sem ter de reconhecer o tipo de
     * cada linha. O `#TYPE` continua registrado no nome base, que é onde o Prometheus o declara.
     */
    family(match[1]).samples.push({ labels: parseLabels(match[2]), value });
  }
  return families;
}

/** Soma um contador, opcionalmente restrito a um subconjunto de labels. */
export function sum(families, name, where = {}) {
  const samples = families.get(name)?.samples || [];
  return samples
    .filter((sample) => Object.entries(where).every(([k, v]) => sample.labels[k] === v))
    .reduce((total, sample) => total + sample.value, 0);
}

/** Um gauge de amostra única. `null` quando a família não foi tocada ainda. */
export function gauge(families, name) {
  const sample = families.get(name)?.samples?.[0];
  return sample ? sample.value : null;
}

/**
 * Quantil aproximado de um histograma, pela BORDA do bucket que cruza o alvo.
 *
 * ⚠️ Não interpola dentro do bucket. O número que sai é "está abaixo de X", não "é X" — e a
 * tela tem de dizer isso, senão a borda `+Inf` viraria uma latência inventada. Com os buckets
 * desta base (5ms a 5s) a borda já responde a pergunta que a tela faz.
 */
export function quantile(families, base, q, where = {}) {
  const matches = (sample) => Object.entries(where).every(([k, v]) => sample.labels[k] === v);
  const total = (families.get(`${base}_count`)?.samples || [])
    .filter(matches)
    .reduce((acc, sample) => acc + sample.value, 0);
  if (!total) return null;

  const buckets = (families.get(`${base}_bucket`)?.samples || [])
    .filter(matches)
    .map((sample) => ({ le: Number(sample.labels.le), value: sample.value }))
    .sort((a, b) => a.le - b.le);

  const alvo = q * total;
  for (const bucket of buckets) if (bucket.value >= alvo) return bucket.le;
  return null;
}

/** Média de um histograma — `_sum / _count`. Honesta e sem aproximação, ao contrário do quantil. */
export function average(families, base, where = {}) {
  const count = sum(families, `${base}_count`, where);
  return count ? sum(families, `${base}_sum`, where) / count : null;
}

/** Os valores distintos de uma label numa família. */
export function labelValues(families, name, label) {
  return [...new Set((families.get(name)?.samples || []).map((sample) => sample.labels[label]))]
    .filter(Boolean)
    .sort();
}
