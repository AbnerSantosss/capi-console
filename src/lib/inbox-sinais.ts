/**
 * Sinais de leitura de um payload recebido: nome do cliente e atribuição de clique.
 *
 * Por que existe: a caixa de entrada mostra hoje `temFbc`/`temFbp`, que são os
 * cookies. Não é a mesma pergunta que o operador faz olhando a lista — ele quer
 * saber "esta venda veio de anúncio?" e "quem é esta pessoa?" antes de decidir
 * disparar. `fbclid` responde a primeira (é o parâmetro que a Meta usa para
 * atribuir ao criativo exato) e `gclid`/`gbraid`/`wbraid` dizem que o tráfego é
 * do Google — informação de conferência de gasto, nunca de disparo.
 *
 * Por que é NEUTRO (sem `server-only`): a mesma leitura acontece nos dois lados.
 * O servidor calcula ao receber; a tela recalcula sobre o `payload` que já veio
 * no item, sem precisar de uma ida ao servidor só para dizer se há fbclid.
 * Importar `inbox.ts` aqui (que é `server-only`) quebraria o build do cliente,
 * por isso este módulo não conhece `ItemInbox` — ele lê `unknown`.
 *
 * REGRA DE OURO deste arquivo: nunca lança e nunca registra nada. Ele roda no
 * caminho de recebimento do webhook, onde uma exceção custa uma venda PIX real
 * (a plataforma lê erro como "não entregue" e a reentrega dela não é garantida), e
 * um `console.log` de payload despejaria e-mail e telefone de comprador no log
 * do container.
 */

export interface SinaisDoEvento {
  /** Nome do cliente/lead, completo, como veio no payload. Ausente quando não há. */
  nomeCliente?: string;
  /** true quando o payload carrega fbclid (na URL de origem ou em campo próprio). */
  temFbclid: boolean;
  /** true quando o payload carrega gclid / gbraid / wbraid (atribuição do Google). */
  temGclid: boolean;
}

/**
 * Tetos da varredura recursiva.
 *
 * O payload vem de fora: é um corpo de até 1 MB que qualquer um com o segredo
 * pode postar, e o JSON.parse aceita alegremente um objeto de 50 mil nós ou uma
 * cadeia de milhares de níveis. Sem teto, um payload patológico (acidental ou
 * não) transformaria esta função — que roda ANTES da resposta 202 — numa parada
 * do event loop do container inteiro, e aí toda venda que chegasse junto se
 * perderia.
 *
 * 6 níveis cobrem com folga o que existe de verdade: o mais fundo dos formatos
 * reais é `data.attribution.cookies.fbclid` (4) e `attribution.utm.source` (3).
 * 800 nós é a mesma conta com margem larga. Estourar o teto NÃO é erro: a
 * varredura simplesmente para e os sinais saem como `false` — que é o
 * comportamento conservador correto ("não vi fbclid" nunca inventa atribuição).
 */
const PROFUNDIDADE_MAXIMA = 6;
const NOS_MAXIMOS = 800;

/** Chaves cujo valor string é tratado como URL de origem e tem a query lida. */
const CHAVES_DE_URL = new Set([
  'event_source_url',
  'eventsourceurl',
  'source_url',
  'sourceurl',
  'landing_page',
  'landingpage',
  'page_url',
  'pageurl',
  'url',
  'href',
]);

/** Click ids que ligam `temGclid`. Qualquer um dos três basta. */
const IDS_DO_GOOGLE = ['gclid', 'gbraid', 'wbraid'] as const;

/**
 * Caminhos de nome, em ordem de precedência.
 *
 * Os quatro primeiros são o formato A do xWinner (tudo pendurado em `data`);
 * `name`/`nome` na raiz cobrem payload achatado; os últimos são o formato B do
 * gateway, que traz `lead` na raiz, sem o invólucro `data`. Ficam por último de
 * propósito: quando as duas formas aparecem no mesmo corpo, a de dentro de
 * `data` é a que o parser já usa para montar o evento, e nome de tela precisa
 * bater com nome de disparo.
 */
const CAMINHOS_DE_NOME: readonly string[][] = [
  ['data', 'lead', 'name'],
  ['data', 'customer', 'name'],
  ['data', 'buyer', 'name'],
  ['data', 'lead', 'nome'],
  ['name'],
  ['nome'],
  ['lead', 'name'],
  ['customer', 'name'],
  ['buyer', 'name'],
  ['lead', 'nome'],
];

/**
 * Bases onde o nome pode vir PARTIDO em dois campos, na mesma ordem de
 * precedência dos caminhos acima.
 *
 * O `parser.ts` (`:332-340`) já monta `first_name + last_name` do `buyer`, e é
 * de lá que vem o nome do item recebido hoje. Aqui a leitura precisa alcançar o
 * mesmo payload: sem isto, uma entrega antiga que só trouxe `buyer.first_name`
 * apareceria com nome no item novo e SEM nome depois de um restart — a mesma
 * venda, dois textos diferentes na tela.
 */
const BASES_DE_NOME_PARTIDO: readonly string[][] = [
  ['data', 'buyer'],
  ['data', 'lead'],
  ['data', 'customer'],
  ['buyer'],
  ['lead'],
  ['customer'],
];

/** Objeto simples navegável (array NÃO conta: array não tem chave nomeada). */
function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * String que vale como valor presente.
 *
 * `'null'` e `'undefined'` entram na lista porque serialização de terceiro
 * transforma ausência em texto com frequência incômoda — e um fbclid literal
 * `"null"` marcaria a venda como vinda de anúncio sem nenhum anúncio existir.
 */
function textoUtil(v: unknown): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  if (!t || t === 'null' || t === 'undefined') return '';
  return t;
}

/**
 * Lê um parâmetro da query/hash de uma URL sem usar `new URL()`.
 *
 * `new URL()` lança em URL relativa e em lixo — e aqui lixo é a regra, não a
 * exceção. Regex simples resolve e não tem como explodir.
 */
function paramDaUrl(url: string, nome: string): string {
  const m = new RegExp('[?&#]' + nome + '=([^&#]*)', 'i').exec(url);
  if (!m) return '';
  try {
    return textoUtil(decodeURIComponent(m[1]));
  } catch {
    // Percent-encoding quebrado (`%zz`): o valor cru já prova a presença.
    return textoUtil(m[1]);
  }
}

/**
 * O cookie `_fbc` no formato `fb.<subdomínios>.<timestamp em ms>.<fbclid>`
 * CONTÉM o fbclid — é literalmente o último segmento dele.
 *
 * Decisão (não é obviedade): tratamos `fbc` bem formado como prova de fbclid.
 * O motivo é que a pergunta da tela é "a Meta consegue atribuir esta venda ao
 * anúncio?", e com o fbc na mão ela consegue, mesmo que o campo `fbclid` cru
 * nunca tenha sido gravado — que é exatamente o caso de todo payload do formato
 * A antigo, onde só o cookie viajava. Dizer "sem fbclid" ali seria mentir sobre
 * uma venda atribuível e empurrar o operador a descartá-la.
 */
function fbcImplicaFbclid(valor: string): boolean {
  return /^fb\.[^.]+\.\d+\.[^.]+/i.test(valor);
}

/** Navega uma sequência de chaves sem nunca lançar. */
function pegarCaminho(raiz: unknown, caminho: readonly string[]): unknown {
  let atual: unknown = raiz;
  for (const chave of caminho) {
    if (!ehObjeto(atual)) return undefined;
    atual = atual[chave];
  }
  return atual;
}

export function sinaisDoPayload(payload: unknown): SinaisDoEvento {
  const sinais: SinaisDoEvento = { temFbclid: false, temGclid: false };

  // `null`, string, número, array, undefined: nada disso tem nome de cliente
  // nem atribuição, e o contrato manda devolver os dois sinais em `false` em
  // vez de reclamar. Array na raiz também cai aqui: nenhum formato real entrega
  // um evento dentro de um array sem envelope.
  if (!ehObjeto(payload)) return sinais;

  /* ---------------- nome do cliente: caminhos fixos, em ordem ---------------- */
  for (const caminho of CAMINHOS_DE_NOME) {
    const nome = textoUtil(pegarCaminho(payload, caminho));
    if (nome) {
      // Nome COMPLETO, sem máscara: quem mascara é o e-mail (`mascararEmail`
      // em inbox.ts), porque e-mail é credencial de acesso e nome não é. O
      // operador precisa do nome inteiro para achar a pessoa no backoffice.
      sinais.nomeCliente = nome;
      break;
    }
  }

  // Nome partido em dois campos, só se nenhum caminho inteiro deu resultado.
  if (!sinais.nomeCliente) {
    for (const base of BASES_DE_NOME_PARTIDO) {
      const no = pegarCaminho(payload, base);
      if (!ehObjeto(no)) continue;
      const inteiro = [textoUtil(no.first_name), textoUtil(no.last_name)]
        .filter(Boolean)
        .join(' ');
      if (inteiro) {
        sinais.nomeCliente = inteiro;
        break;
      }
    }
  }

  /* ---------------- atribuição: varredura com teto ---------------- */
  // Pilha explícita em vez de recursão de verdade: com um payload fundo, a
  // recursão estoura a pilha do Node ANTES de o contador de nós agir, e um
  // RangeError aqui seria justamente a exceção que este módulo promete nunca ter.
  const pilha: Array<{ valor: unknown; nivel: number }> = [{ valor: payload, nivel: 0 }];
  let nos = 0;

  while (pilha.length > 0) {
    if (nos >= NOS_MAXIMOS) break;
    if (sinais.temFbclid && sinais.temGclid) break; // nada mais a descobrir

    const atual = pilha.pop();
    if (!atual) break;
    nos++;

    const { valor, nivel } = atual;
    if (nivel > PROFUNDIDADE_MAXIMA) continue;

    if (Array.isArray(valor)) {
      // Array não acrescenta nível: ele é um invólucro, não um degrau de
      // estrutura. `itens[0].url` deve custar o mesmo que `item.url`.
      for (const filho of valor) pilha.push({ valor: filho, nivel });
      continue;
    }

    if (!ehObjeto(valor)) continue;

    for (const [chave, filho] of Object.entries(valor)) {
      const k = chave.toLowerCase();

      if (typeof filho === 'string') {
        const texto = textoUtil(filho);
        if (!texto) continue;

        // Campo próprio: `data.attribution.fbclid`, `data.fbclid`,
        // `attribution.cookies.fbclid` — todos casam por nome de chave, em
        // qualquer nível dentro do teto.
        if (k === 'fbclid') sinais.temFbclid = true;
        if ((IDS_DO_GOOGLE as readonly string[]).includes(k)) sinais.temGclid = true;

        // O cookie `_fbc`/`fbc` vale como fbclid — ver fbcImplicaFbclid().
        if ((k === 'fbc' || k === '_fbc') && fbcImplicaFbclid(texto)) sinais.temFbclid = true;

        // URL de origem: a query string carrega os dois lados da atribuição.
        if (CHAVES_DE_URL.has(k)) {
          if (!sinais.temFbclid && paramDaUrl(texto, 'fbclid')) sinais.temFbclid = true;
          if (!sinais.temGclid) {
            for (const id of IDS_DO_GOOGLE) {
              if (paramDaUrl(texto, id)) {
                sinais.temGclid = true;
                break;
              }
            }
          }
        }
        continue;
      }

      if (filho && typeof filho === 'object') pilha.push({ valor: filho, nivel: nivel + 1 });
    }
  }

  return sinais;
}
