/**
 * A INTERFACE DA MARCA — a terceira condição do favorito, e a razão desta fase existir.
 *
 * O modelo (`space/favoritos.js`) já garante que a marca não entra em `classificar()` e que ela mora
 * no operador. Falta a condição que só a TELA pode cumprir: **dizer que é ESCOLHA, não medida.** O
 * resto do painel de CONTEXTO publica procedência de tudo (massa, commit, alcance, e os assuntos com
 * *"inferido por … — não é medida"*); um corpo com cara de Júpiter sem dizer *"você marcou"* é a
 * única forma de o favorito virar a afirmação que ele existe para não ser.
 *
 * Então toda leitura daqui carrega `por`, `em` e `corpus`, e `desenhar()` escreve os três no pixel.
 *
 * ## Por que a ontologia é DERIVADA aqui, e o que impede a derivação de divergir
 *
 * `contextoDe()` precisa de `classificar()` e `superficieDe()`, e as duas precisam de `dominante` —
 * o único campo de contexto de `entityPhysics()`, e o que decide se um corpo é ESTRELA (contexto
 * nenhum) ou PLANETA (contexto planetário). Errá-lo oferece "TERRA" para uma fotosfera.
 *
 * ☠️ **O rótulo da cena NÃO serve de fonte.** `universe.tipoDe()` devolve o nome de TELA da pele, e
 * ler rótulo como dado é o defeito que já derrubou 22 fotosferas para 21 nesta base.
 *
 * ⭑ **Isto já foi uma TRANSCRIÇÃO do agrupamento de `universe.load()`, e não é mais.** A fonte
 * morava dentro de uma CENA, então a HUD copiava a regra e um oráculo conferia a cópia contra o
 * TEXTO da fonte. Hoje o dono é `space/sistemas.js` — puro, sem cena — e aqui só se LÊ. Cópia com
 * portão envelhece devagar; nenhuma cópia não envelhece.
 *
 * ⚠️ Nó que o agrupamento não alcança fica FORA da tabela e o painel diz isso, em vez de assumir
 * `dominante: false` — assumir daria contexto `planetario` a uma estrela, com toda a cara de medida.
 *
 * ## `emDisco` é `null` até alguém medir
 *
 * Nenhuma das 9 texturas do catálogo está em disco (09/08: só `sun.jpg`, que é da fotosfera e está
 * fora do catálogo). `null` significa *"ninguém me disse o que existe"*, e não pode virar `false`
 * (que é *"medi e falta"*) nem sumiço. Quem souber carregar é quem declara — `declararEmDisco()` é a
 * porta, e ela não tem chamador hoje.
 */
import { el } from './dom.js';
import { button } from './button.js';
import {
  criarFavoritos,
  contextoDe,
  casoSemAparencia,
  APARENCIAS,
  ESTADO,
  CHAVE_PREFS,
} from '../space/favoritos.js';
import { indice as indiceDeSistemas, carregar as indexarSistemas } from '../space/sistemas.js';

let store = null;
let corpusAtual = null;
/** ⚠️ `null` = ninguém mediu o disco. `new Set()` diria "medi e não há", e são fatos diferentes. */
let emDisco = null;
const ouvintes = new Set();

const ehTexto = (v) => typeof v === 'string' && v.length > 0;

/**
 * Liga o modelo ao guardador do operador, e faz o painel repintar quando a marca muda.
 *
 * A notificação vem do PRÓPRIO `prefs`, não de um aviso emitido daqui: qualquer escrita na chave
 * — inclusive uma feita pelo console durante uma medida — tem de repintar, e um segundo caminho de
 * notificação seria livre para discordar do primeiro.
 */
export function instalarFavoritos(prefsLike) {
  store = criarFavoritos(prefsLike);
  prefsLike.subscribe?.((chave) => {
    if (chave === null || chave === CHAVE_PREFS) for (const fn of [...ouvintes]) fn();
  });
  return store;
}

/** Repinta quem estiver desenhando a marca. Devolve o cancelamento. */
export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/**
 * Deriva o contexto de aparência de toda a topologia, uma vez por carga.
 *
 * @param {object} payload  o corpo de `/api/graph`, o MESMO que `scene.loadGraph` recebe
 * @returns {object} o que foi coberto — a sonda precisa disso para "não classificado" não virar zero
 */
export function carregarTopologia(payload) {
  /*
   * ⚠️ **O corpus vem do SERVIDOR**, que é quem lê o `.env`. Um default aqui carimbaria a marca com
   * um céu que ninguém está vendo, e `marcar()` recusa marca sem carimbo justamente por isso.
   */
  corpusAtual = payload?.corpus?.collection ?? null;
  /*
   * ⚠️ **Indexar aqui é IDEMPOTENTE, e não uma segunda fonte.** A HUD pode carregar antes ou depois
   * da cena; as duas chamadas passam o MESMO payload pela MESMA função pura, e a última a rodar
   * escreve o mesmo índice. O que não pode existir é uma segunda REGRA, e essa mora num lugar só.
   */
  const indexado = indexarSistemas(payload);
  return Object.freeze({
    corpus: corpusAtual,
    nos: indexado.nos,
    cobertos: indexado.cobertos,
    // `nos - cobertos`: corpo que o agrupamento não alcança não recebe contexto assumido.
    semContexto: indexado.semContexto,
  });
}

/** Declara o que o carregador de textura sabe carregar. Sem chamador hoje — ver o cabeçalho. */
export function declararEmDisco(conjunto) {
  emDisco = conjunto instanceof Set ? conjunto : null;
}

/**
 * O que a tela precisa saber sobre a marca deste corpo.
 *
 * `impedimento` é o quarto desfecho e não um erro: nem todo nó da tela tem identidade estável (as
 * luas são seções sintetizadas na cena) e nem todo nó foi alcançado pelo agrupamento. Devolver
 * `nao-marcado` nesses casos afirmaria *"não marquei"* sobre um corpo que sequer pode ser marcado.
 */
export function leitura(node) {
  if (!store) return { impedimento: 'o guardador de favoritos não foi ligado neste boot' };
  const id = node?.id;
  if (!ehTexto(id)) {
    return { impedimento: 'este corpo não tem identidade estável — só o que o corpus indexa é marcável' };
  }
  const onto = indiceDeSistemas().identidadeDe({ id });
  if (!onto) {
    return {
      impedimento:
        'a topologia servida não classificou este corpo, e assumir um contexto daria ' +
        'aparência de planeta a uma estrela',
    };
  }
  /*
   * ⭑ **UMA pele, não duas.** Isto já leu `telaEstado().cena` para escolher entre a ontologia e o
   * `resolveBody` do AGENTE, porque as duas cenas discordavam sobre 32 dos 72 corpos e a marca
   * seguia a que estava na tela. As cenas convergiram (T-39): a pele é a mesma nas duas, e a
   * aparência que a marca oferece deixou de depender de onde o operador está olhando.
   */
  const pele = onto.pele;
  const contexto = contextoDe(onto.classe, pele);
  const caso = casoSemAparencia(onto.classe, pele);
  const base = store.ler({ id, contexto, caso, emDisco });
  return Object.freeze({
    ...base,
    caso,
    /** As aparências que ESTE contexto aceita, por nome — a REGRA DO CATÁLOGO no pixel. */
    aceitas: APARENCIAS[contexto] || {},
    pele,
    corpusAtual,
    /*
     * ⚠️ Divergência de céu ANUNCIA. `null` é "não sei de que céu esta sessão é" (topologia não
     * carregou), que é diferente de "é outro céu" — a mesma distinção que `sonda()` já faz.
     */
    foraDoCeu: base.marcada && corpusAtual ? base.corpus !== corpusAtual : null,
  });
}

/** MARCA ou DESMARCA. Devolve `{ok, erro}` — a recusa do modelo é texto de tela, não exceção solta. */
export function alternar(node) {
  const atual = leitura(node);
  if (!atual || atual.impedimento) return { ok: false, erro: atual?.impedimento || 'sem leitura' };
  try {
    if (atual.marcada) store.desmarcar(node.id);
    else store.marcar({ id: node.id, corpus: corpusAtual });
    return { ok: true, marcada: !atual.marcada };
  } catch (error) {
    // `marcar()` recusa marca sem carimbo de corpus, e o conserto vem dentro do motivo.
    return { ok: false, erro: error.message };
  }
}

/** ESCOLHE (ou esquece, com `null`) a aparência do contexto em que o corpo está agora. */
export function escolher(node, aparencia) {
  const atual = leitura(node);
  if (!atual || atual.impedimento) return { ok: false, erro: atual?.impedimento || 'sem leitura' };
  try {
    if (aparencia === null) store.esquecerAparencia({ id: node.id, contexto: atual.contexto });
    else store.escolherAparencia({ id: node.id, contexto: atual.contexto, aparencia });
    return { ok: true };
  } catch (error) {
    return { ok: false, erro: error.message };
  }
}

/** A sonda de `window.spatia`. Um `corpos` de verdade, para `noCeu` não sair `null`. */
export function sonda() {
  if (!store) return { ligado: false, motivo: 'favoritos não ligados neste boot' };
  /*
   * A sonda do modelo pede `{classe, pele}` por `id` e deriva contexto e motivo por conta própria.
   * O par entregue é o MESMO que produziu o contexto do painel — a derivação acontece uma vez, e
   * quem lê a sonda e quem lê a tela não têm por onde discordar.
   */
  /*
   * ⚠️ `classe` E `pele` viajam juntas, e não só o contexto que sai delas: reconstruir um par
   * plausível a partir do contexto devolveria `casoSemAparencia` errado — uma fotosfera sairia com
   * o motivo da estrutura, com toda a cara de medida.
   */
  const corpos = new Map(
    [...indiceDeSistemas().todas()].map(([id, o]) => [id, { classe: o.classe, pele: o.pele }])
  );
  return {
    ligado: true,
    cobertos: indiceDeSistemas().cobertos,
    ...store.sonda({ corpus: corpusAtual, emDisco, corpos }),
  };
}

// ─────────────────────────────────────────────────────────── o pixel

const titulo = (texto) => el('div', 'fs-title', texto);

/** Linha rótulo/valor no desenho dos medidores — mesma língua do painel, zero CSS novo. */
function vital(rotulo, valor, unidade = '') {
  const linha = el('div', 'vital');
  linha.append(el('span', 'vital-label', rotulo), el('strong', 'vital-value', valor));
  linha.append(el('span', 'vital-unit', unidade));
  return linha;
}

/**
 * O cabeçalho do estado: glifo + frase, com o estado no `data-` para o CSS separar os quatro.
 *
 * ⚠️ **`degradada` é ANÚNCIO, não ausência.** Ela tem glifo e tinta próprios e SEMPRE traz o motivo
 * do modelo — que nomeia qual das três causas foi (contexto mudou · nome saiu do catálogo · arquivo
 * não está em disco). Desenhá-la como "sem aparência" faria a afinação do operador evaporar em
 * silêncio, que é o oposto do que o modelo passou 51 leis garantindo.
 */
function faixa(estado, glifo, frase, motivo) {
  const linha = el('div', 'marca');
  linha.dataset.estado = estado;
  linha.append(el('span', 'marca-glifo', glifo), el('span', 'marca-texto', frase));
  if (motivo) linha.append(el('span', 'marca-motivo', motivo));
  return linha;
}

/**
 * A PROCEDÊNCIA da marca — a condição 3 no pixel.
 *
 * Ela não é decorativa e não é opcional: as outras linhas deste painel saem de disco, de git ou de
 * vetor, e qualquer pessoa as recalcula. Esta saiu de um gesto de gente, e apresentá-la com a mesma
 * voz de medida ensina o operador a confiar na coisa errada.
 */
function procedencia(l) {
  const linha = el('div', 'marca-proveniencia');
  // A data em ISO, não `toLocaleDateString`: esta coluna é de INSTRUMENTO, e o formato longo do
  // `pt-BR` ("9 de ago. de 2026") não cabe na régua do painel.
  linha.textContent = `VOCÊ MARCOU · ${l.por} · ${String(l.em).slice(0, 10)} · ${l.corpus}`;
  return linha;
}

/** Os chips de aparência do contexto, com o escolhido em `select` sólido. */
function escolhas(node, l) {
  const nomes = Object.keys(l.aceitas);
  if (!nomes.length) return [];
  const caixa = el('div', 'marca-aparencias');
  for (const nome of nomes) {
    caixa.append(
      button({
        variant: 'select',
        size: 'xs',
        label: l.aceitas[nome].rotulo,
        on: l.aparencia === nome,
        title: `${l.aceitas[nome].arquivo} · ${l.aceitas[nome].licenca}`,
        /*
         * ⚠️ O clique lê o estado AGORA, não o que estava desenhado quando o chip nasceu. `l` é a
         * leitura do desenho, e um handler que a consulta decide por um pixel que pode não valer mais
         * — é a mesma família do proxy que expira sem avisar. O `on` do botão pode envelhecer sem
         * estrago (o painel repinta); a AÇÃO, não.
         */
        onClick: () => escolher(node, leitura(node)?.aparencia === nome ? null : nome),
      })
    );
  }
  return [caixa];
}

/**
 * O bloco FAVORITO do painel de CONTEXTO.
 *
 * Vive aqui e não em `apps/context.js` porque o oráculo tem de desenhar os quatro estados num DOM de
 * mentira sem montar o widget inteiro — e um desenho que só existe dentro do host é um desenho que
 * nenhuma lei alcança.
 *
 * @returns {HTMLElement[]} as linhas, na forma que o painel já concatena
 */
export function desenharFavorito(node) {
  const l = leitura(node);
  const linhas = [titulo('FAVORITO')];
  if (!l || l.impedimento) {
    linhas.push(el('div', 'widget-empty', l?.impedimento || 'sem leitura'));
    return linhas;
  }

  if (l.estado === ESTADO.NAO_MARCADO) {
    /*
     * O não-marcado não afirma nada: uma linha de AÇÃO, sem procedência e sem motivo. Escrever
     * "sem aparência" aqui juntaria os dois nulos que o modelo separa — *"não marquei"* e
     * *"marquei e não escolhi"* são fatos diferentes.
     */
    const linha = button({
      variant: 'row',
      size: 'row',
      title: 'marcar este corpo para acompanhar',
      onClick: () => alternar(node),
    });
    linha.append(el('span', 'fs-glyph', '☆'));
    linha.append(el('span', 'fs-name', 'MARCAR'));
    linha.append(el('span', 'fs-meta', 'F'));
    linhas.push(linha);
    return linhas;
  }

  if (l.estado === ESTADO.DEGRADADA) {
    linhas.push(faixa(ESTADO.DEGRADADA, '⚠', 'MARCA DEGRADADA', l.motivo));
  } else {
    linhas.push(faixa(l.estado, '★', 'VOCÊ MARCOU', l.estado === ESTADO.SEM_APARENCIA ? l.motivo : null));
  }
  linhas.push(procedencia(l));

  if (l.foraDoCeu) {
    // Marca feita em outro céu ANUNCIA. Esconder faria a afinação evaporar ao trocar de corpus, e
    // os caminhos se repetem entre corpora — a marca pode estar sobre um arquivo homônimo.
    linhas.push(el('div', 'marca-motivo', `marcada no céu ${l.corpus}; esta sessão é ${l.corpusAtual}`));
  }

  if (l.aparencia) {
    linhas.push(vital('APARÊNCIA', l.aceitas[l.aparencia]?.rotulo || l.aparencia, 'escolha sua'));
    /*
     * ⚠️ `disponivel` tem TRÊS valores e a tela não pode colapsá-los — **e este bloco os colapsava
     * enquanto o comentário acima dizia que não.** Declarar a invariante não a implementa, e é a
     * quinta vez que esta base paga por isso.
     *
     * O do meio é o que some primeiro: `false` significa *"medi e FALTA"*, e escrevê-lo como
     * presença afirma o OPOSTO do fato — com o motivo do modelo contradizendo a linha, na mesma
     * tela. `null` é *"ninguém me disse o que existe"*, que não é falta nem presença.
     */
    const disco =
      l.disponivel === true
        ? `${l.arquivo} — em disco`
        : l.disponivel === false
          ? `${l.arquivo} — NÃO está em disco; a pele procedural continua desenhando`
          : `${l.arquivo} — disco não verificado; a pele procedural continua desenhando`;
    linhas.push(el('div', 'widget-hint', disco));
  }
  linhas.push(...escolhas(node, l));

  /*
   * O fecho, no mesmo idioma que os ASSUNTOS já usam para inferência: a seção declara de que
   * natureza é o que ela afirma. Aqui a natureza é ESCOLHA, e é o oposto do que o resto do painel
   * publica — sem esta linha um corpo com cara de Júpiter passa por medida.
   */
  linhas.push(el('div', 'widget-hint', 'marca do operador — não é medida, e não decide o que o corpo é'));

  const soltar = button({
    variant: 'row',
    size: 'row',
    title: 'desmarcar — apaga a marca e as escolhas dela',
    onClick: () => alternar(node),
  });
  soltar.append(el('span', 'fs-glyph', '☆'));
  soltar.append(el('span', 'fs-name', 'DESMARCAR'));
  soltar.append(el('span', 'fs-meta', 'F'));
  linhas.push(soltar);
  return linhas;
}
