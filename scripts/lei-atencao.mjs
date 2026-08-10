#!/usr/bin/env node
/**
 * A LEI DA ATENÇÃO — quem está sob atenção tem UMA resposta, na tela e no gesto.
 *
 *     node scripts/lei-atencao.mjs        # sai 0 quando as leis valem
 *
 * ## Por que ela existe
 *
 * `ui.links` é NOTIFICAÇÃO e `core/attention.js` é o ESTADO legível — a mesma divisão que
 * `state.js` e `session.js` já fazem. O risco aparece quando alguém lê as duas: um painel que pinta
 * do PAYLOAD do evento e uma tecla que lê o STORE são duas fontes para o mesmo fato, e quem está
 * adiantado depende da ordem de registro no barramento.
 *
 * ☠️ **O sintoma é caro e não levanta erro:** o painel nomeia um corpo, o operador aperta a tecla
 * de marcar, e a marca cai em OUTRO. Por um quadro, e sem nada acusar.
 *
 * ⚠️ **Guardar a ordem seria guardar o sintoma.** A saída é o estado notificar DEPOIS de trocar, e
 * quem desenha assinar o estado em vez do evento cru — aí não há adiantado nem atrasado a ordenar.
 *
 * | § | a pergunta |
 * |---|---|
 * | 1 | o ouvinte enxerga o estado NOVO, e nunca o anterior? |
 * | 2 | o cancelamento devolvido solta de verdade? |
 * | 3 | o estado sobrevive à emissão sem assunto, e sem quebrar quem lê? |
 * | 4 | quem DESENHA atenção assina o estado, e não o `ui.links` cru? |
 */
import { readFileSync, readdirSync } from 'node:fs';

/*
 * ☠️ A raiz sai do PRÓPRIO arquivo. Com raiz externa o oráculo importa a árvore que lhe apontarem
 * e passa sobre uma CÓPIA MUTADA, atestando guarda que a cópia não tem.
 */
const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const src = (p) => readFileSync(`${RAIZ}/${p}`, 'utf8');
/** Sem a prosa: o comentário que EXPLICA por que o payload cru é proibido cita `ui.links`. */
const semProsa = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const falhas = [];
const ok = [];
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) ok.push(nome);
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

const bus = await import(`${RAIZ}/src/core/bus.js`);
const attention = await import(`${RAIZ}/src/core/attention.js`);
attention.install();

const CORPO = { id: 'a', source: 'docs/a.md', type: 'file' };
const OUTRO = { id: 'b', source: 'docs/b.md', type: 'file' };
const emitir = (subject, extra = {}) => bus.emit({ t: 'ui.links', subject, nodes: [], ...extra });

// ───────────────────────────────────────────── §1 · o ouvinte nunca vê o estado anterior

/*
 * ☠️ **É esta a lei, e ela é sobre ORDEM DENTRO do módulo.** Notificar antes de trocar `current`
 * entrega ao ouvinte o corpo ANTERIOR — que é exatamente a divergência de um quadro, agora
 * embutida no store em vez de depender da ordem de registro. O ouvinte lê pelo `snapshot()`, e não
 * pelo argumento, porque é assim que um painel de verdade lê.
 */
emitir(CORPO);
const vistos = [];
const soltar = attention.aoMudar(() => vistos.push(attention.snapshot().subject?.id));
emitir(OUTRO);
conferir('§1 ☠️ o ouvinte lê o estado NOVO, nunca o anterior', vistos[0] === 'b', JSON.stringify(vistos));

const recebidos = [];
const soltarArg = attention.aoMudar((estado) => recebidos.push(estado?.subject?.id));
emitir(CORPO);
conferir(
  '§1 e o argumento entregue é o MESMO que o `snapshot()`',
  recebidos[0] === 'a' && attention.snapshot().subject?.id === 'a',
  `${recebidos[0]} vs ${attention.snapshot().subject?.id}`
);
soltarArg();

conferir('§1 toda emissão notifica — nenhuma se perde', vistos.length === 2, `${vistos.length}`);

// ───────────────────────────────────────────── §2 · o cancelamento solta

/*
 * ☠️ **A metade que vaza calada.** Widget destruído que continue na lista pinta um DOM fora da
 * árvore: sem erro, sem sintoma, e mais um a cada troca de rota.
 */
soltar();
const antes = vistos.length;
emitir(OUTRO);
conferir('§2 ☠️ o cancelamento de `aoMudar` solta o ouvinte', vistos.length === antes, `${vistos.length}`);

// ───────────────────────────────────────────── §3 · sem assunto é VAZIO, e não quebra

/*
 * O registro vazio existe para que ler *"nada sob atenção"* e ler um corpo tenham a MESMA forma —
 * nenhum leitor precisa de guarda. Um `null` aqui quebraria na primeira montagem antes do hover.
 */
const aposVazio = [];
const soltarVazio = attention.aoMudar((e) => aposVazio.push(e));
emitir(null);
const vazio = attention.snapshot();
conferir('§3 sem assunto o estado é VAZIO, nunca `null`', vazio !== null && vazio !== undefined);
conferir('§3 e mantém a forma — `links` continua lista', Array.isArray(vazio.links), typeof vazio.links);
conferir('§3 sem assunto também NOTIFICA', aposVazio.length === 1, `${aposVazio.length}`);
conferir('§3 o vazio entregue é o mesmo objeto do `snapshot()`', aposVazio[0] === vazio);
soltarVazio();

// ───────────────────────────────────────────── §4 · quem DESENHA assina o estado

/*
 * ⚠️ **A pergunta é sobre quem PINTA atenção, não sobre quem escuta `ui.links`.** A cena emite e o
 * store escuta — os dois legítimos. O que a lei recusa é uma SEGUNDA fonte de leitura: um painel
 * que monte `subject`/`nodes` do payload cru volta a poder discordar da tecla que lê o store.
 */
const ARQUIVOS = (function varrer(dir, saco = []) {
  for (const e of readdirSync(`${RAIZ}/${dir}`, { withFileTypes: true })) {
    const caminho = `${dir}/${e.name}`;
    if (e.isDirectory()) varrer(caminho, saco);
    else if (e.name.endsWith('.js')) saco.push(caminho);
  }
  return saco;
})('src');

/** Quem pode tocar no evento sem ser leitor de painel, e o motivo. Entrada órfã é acusada. */
const DONOS_DO_EVENTO = Object.freeze({
  'src/core/attention.js': 'é o ESTADO — a única assinatura que existe para virar leitura',
  'src/space/scene.js': 'EMITE, dentro da mesma rotina que manda desenhar os arcos',
});

/*
 * ⚠️ **As DUAS escritas do mesmo evento.** A cena emite por um invólucro (`ui('links', …)`) e quem
 * assina usa o nome inteiro; varrer só uma das formas deixaria o emissor fora do censo e a tabela
 * pareceria velha por um motivo falso.
 */
const tocam = ARQUIVOS.filter((f) => /'ui\.links'|\bui\('links'/.test(semProsa(src(f))));
const intrusos = tocam.filter((f) => !DONOS_DO_EVENTO[f]);
const orfaos = Object.keys(DONOS_DO_EVENTO).filter((f) => !tocam.includes(f));

conferir(
  '§4 ☠️ ninguém desenha atenção a partir do `ui.links` cru',
  intrusos.length === 0,
  `também tocam: ${intrusos.join(', ')}`
);
conferir('§4 `DONOS_DO_EVENTO` não é tabela velha', orfaos.length === 0, orfaos.join(', '));

/*
 * E o painel que motivou esta lei: assina o estado, e solta na destruição — com o nome saindo do
 * FONTE, senão renomear a variável deixaria a lei verde sobre um `destroy` que não solta.
 */
const ctx = semProsa(src('src/apps/context.js'));
conferir('§4 o painel de contexto assina `attention.aoMudar`', /attention\.aoMudar\(/.test(ctx));
const nome = ctx.match(/const\s+(\w+)\s*=\s*attention\.aoMudar\(/);
conferir(
  '§4 a assinatura guarda o cancelamento',
  Boolean(nome),
  'o retorno de `attention.aoMudar` foi descartado'
);
if (nome) {
  const destroy = ctx.match(/destroy:\s*\(\)\s*=>\s*\{([\s\S]*?)\}/);
  conferir(
    '§4 e o `destroy` chama o cancelamento que recebeu',
    Boolean(destroy) && new RegExp(`\\b${nome[1]}\\(\\)`).test(destroy[1]),
    `destroy: ${destroy ? destroy[1].trim() : 'ausente'}`
  );
}

// ───────────────────────────────────────────────────────────────── veredito
console.log(`\n${ok.length} leis provadas`);
for (const f of falhas) console.log(`  ✗ ${f}`);
console.log(falhas.length ? `\nFALHOU: ${falhas.length}` : '\nOK — a atenção tem uma resposta só.');
console.log(`
NÃO PROVADO AQUI (exige navegador):
  · que a repintura acontece no MESMO quadro do arco — aqui prova-se a ordem no despacho,
    não o instante do desenho;
  · que a tecla de marcar e o painel nomeiam o mesmo corpo sob gesto REAL do operador; o
    sintoma que originou esta lei foi visto com eventos de ponteiro sintéticos.`);
process.exit(falhas.length ? 1 : 0);
