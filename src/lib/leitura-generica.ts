/**
 * Leitura genérica de webhook (06/10/2026, regra do dono: o console é
 * white-label e cada empresa pode receber de várias origens).
 *
 * `parser.ts` conhece os formatos que já passaram por aqui (xWinner, gateway,
 * payload plano). Este módulo é a REDE DE BAIXO: quando o formato é outro, ele
 * procura os dados pelo NOME do campo, em qualquer nível do payload, e devolve
 * o que achou. Quem chama só usa o que ainda estiver vazio — formato conhecido
 * nunca é sobrescrito por palpite.
 *
 * O que este módulo NÃO faz: decidir o evento da Meta. Nome de evento fora da
 * tabela continua sem caminho automático; o item vai para a fila e o operador
 * cria a regra depois de conferir os dados lidos.
 */

type Obj = Record<string, unknown>;

/** `Customer_Email`, `customer-email` e `customerEmail` viram `customeremail`. */
function chave(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function ehObjeto(v: unknown): v is Obj {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function escalar(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

const EMAIL = ['email', 'mail', 'emailaddress', 'useremail', 'customeremail', 'buyeremail', 'clientemail', 'payeremail', 'correo'];
const TELEFONE = ['phone', 'phonenumber', 'telefone', 'celular', 'mobile', 'mobilephone', 'cellphone', 'checkoutphone', 'whatsapp', 'tel'];
const TELEFONE_QUALIFICADO = ['userphone', 'customerphone', 'buyerphone', 'clientphone', 'payerphone'];
const NOME = ['name', 'nome', 'fullname', 'nomecompleto'];
const NOME_QUALIFICADO = ['username', 'customername', 'buyername', 'clientname', 'payername'];
const PRIMEIRO_NOME = ['firstname', 'primeironome', 'givenname'];
const SOBRENOME = ['lastname', 'sobrenome', 'surname', 'familyname'];
const ID_PESSOA = ['userid', 'customerid', 'buyerid', 'clientid', 'payerid', 'externalid'];

const VALOR_EM_CENTAVOS = ['amountminor', 'amountcents', 'amountincents', 'valuecents', 'totalcents', 'pricecents', 'valorcentavos', 'valoremcentavos'];
const VALOR = ['value', 'valor', 'total', 'price', 'preco', 'totalprice', 'totalvalue', 'ordertotal', 'valortotal', 'valorpago', 'grandtotal'];
/**
 * `amount` não diz a unidade: há plataforma que manda 97 (reais) e plataforma
 * que manda 9700 (centavos). Com casa decimal é unidade de moeda; inteiro fica
 * SEM LER, marcado, porque errar aqui manda à Meta 100 vezes o faturamento.
 */
const VALOR_AMBIGUO = ['amount', 'totalamount', 'paidamount', 'chargeamount'];
const MOEDA = ['currency', 'moeda', 'currencycode', 'currencyvalue'];
const PEDIDO = ['orderid', 'ordernumber', 'transactionid', 'transaction', 'purchaseid', 'paymentid', 'saleid', 'depositid', 'invoiceid', 'chargeid', 'idpedido', 'pedido', 'txid'];

const USER_AGENT = ['useragent', 'clientuseragent'];
const IP = ['ip', 'ipaddress', 'clientip', 'clientipaddress', 'userip', 'remoteip'];
const URL_ORIGEM = ['eventsourceurl', 'pageurl', 'landingpage', 'sourceurl'];
const DOMINIO = ['domain', 'dominio'];
const UTMS = ['source', 'medium', 'campaign', 'content', 'term'] as const;

/** Nomes do campo que carrega o nome do evento em outras plataformas. */
const NOME_DO_EVENTO = ['event', 'eventname', 'evento', 'eventtype', 'webhookeventtype', 'type', 'topic', 'action'];

/**
 * Ramos que não são do comprador nem do pedido: valor de comissão, nome do
 * produto, e-mail do afiliado. Ler daqui trocaria a pessoa ou o faturamento.
 */
const RAMOS_DE_FORA = new Set([
  'product', 'products', 'produto', 'produtos', 'item', 'items', 'itens', 'offer', 'oferta', 'plan', 'plano',
  'affiliate', 'affiliates', 'afiliado', 'producer', 'produtor', 'seller', 'vendedor', 'store', 'loja',
  'company', 'empresa', 'merchant', 'gateway', 'coupon', 'cupom', 'campaign',
  'commission', 'commissions', 'comissao', 'comissoes', 'fee', 'fees', 'taxa', 'taxas', 'tax', 'taxes',
  'discount', 'desconto', 'shipping', 'frete', 'refund', 'reembolso', 'installment', 'installments',
  'parcela', 'parcelas', 'balance', 'saldo', 'bonus',
]);

interface No {
  obj: Obj;
  nivel: number;
}

/** Todos os objetos do payload, do mais raso ao mais fundo, sem os ramos de fora. */
function percorrer(raiz: unknown): No[] {
  const saida: No[] = [];
  if (!ehObjeto(raiz)) return saida;
  const fila: No[] = [{ obj: raiz, nivel: 0 }];
  // Teto defensivo: payload gigante não pode custar tempo no caminho do webhook.
  while (fila.length && saida.length < 200) {
    const no = fila.shift() as No;
    saida.push(no);
    if (no.nivel >= 5) continue;
    for (const [k, v] of Object.entries(no.obj)) {
      if (RAMOS_DE_FORA.has(chave(k))) continue;
      if (ehObjeto(v)) fila.push({ obj: v, nivel: no.nivel + 1 });
      // Lista: só o primeiro elemento (ex.: `customers: [{...}]`).
      else if (Array.isArray(v) && ehObjeto(v[0])) fila.push({ obj: v[0], nivel: no.nivel + 1 });
    }
  }
  return saida;
}

function lerDe(obj: Obj, nomes: string[]): string {
  for (const [k, v] of Object.entries(obj)) {
    if (!nomes.includes(chave(k))) continue;
    const t = escalar(v);
    if (t) return t;
  }
  return '';
}

/** O primeiro valor achado, do nível mais raso para o mais fundo. */
function achar(nos: No[], nomes: string[]): string {
  for (const no of nos) {
    const t = lerDe(no.obj, nomes);
    if (t) return t;
  }
  return '';
}

/** Como `achar`, mas diz também o nome do campo, para a tela mostrar de onde veio. */
function acharCampo(nos: No[], nomes: string[]): { campo: string; texto: string } | null {
  for (const no of nos) {
    for (const [k, v] of Object.entries(no.obj)) {
      if (!nomes.includes(chave(k))) continue;
      const texto = escalar(v);
      if (texto) return { campo: k, texto };
    }
  }
  return null;
}

/** Aceita "97,00", "1.234,56" e "97.00"; texto com outra coisa no meio não é valor. */
function lerNumero(texto: string): number {
  const bruto = texto.replace(/\s/g, '');
  if (!bruto) return NaN;
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(bruto)) return Number(bruto.replace(/\./g, '').replace(',', '.'));
  return Number(bruto.replace(',', '.'));
}

export interface LeituraGenerica {
  email?: string;
  phone?: string;
  nome?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string;
  /** Já em unidade de moeda, com duas casas. */
  value?: string;
  /** Nome do campo de onde o valor saiu, como veio no payload. */
  valorCampo?: string;
  /** true quando o valor veio de um campo que diz "centavos" no nome. */
  valorEraCentavos?: boolean;
  /** Campo `amount` inteiro que ficou sem ler, por não dizer a unidade. */
  valorAmbiguo?: string;
  currency?: string;
  orderId?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  userAgent?: string;
  ip?: string;
  sourceUrl?: string;
  /** Site de onde o evento veio, como o payload escreveu. */
  dominio?: string;
  utms?: Record<string, string>;
}

/** Procura os dados do evento pelo nome do campo, em qualquer nível. */
export function lerGenerico(payload: unknown): LeituraGenerica {
  const nos = percorrer(payload);
  const saida: LeituraGenerica = {};
  if (nos.length === 0) return saida;

  const email = achar(nos, EMAIL);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /^[a-f0-9]{64}$/i.test(email)) saida.email = email;

  // A "pessoa" é o objeto mais raso que tem e-mail. `name` e `phone` soltos só
  // valem ali dentro: fora dele, `name` costuma ser o produto ou a loja.
  const pessoa = nos.find((no) => lerDe(no.obj, EMAIL))?.obj;

  const telefone = (pessoa && lerDe(pessoa, TELEFONE)) || achar(nos, TELEFONE_QUALIFICADO);
  if (telefone) saida.phone = telefone;

  const nome = (pessoa && lerDe(pessoa, [...NOME, ...NOME_QUALIFICADO])) || achar(nos, NOME_QUALIFICADO);
  if (nome) saida.nome = nome;
  const primeiro = (pessoa && lerDe(pessoa, PRIMEIRO_NOME)) || '';
  if (primeiro) saida.firstName = primeiro;
  const sobrenome = (pessoa && lerDe(pessoa, SOBRENOME)) || '';
  if (sobrenome) saida.lastName = sobrenome;

  const idPessoa = achar(nos, ID_PESSOA);
  if (idPessoa) saida.externalId = idPessoa;

  const emCentavos = acharCampo(nos, VALOR_EM_CENTAVOS);
  const emUnidade = acharCampo(nos, VALOR);
  const ambiguo = acharCampo(nos, VALOR_AMBIGUO);
  const positivo = (n: number) => Number.isFinite(n) && n > 0;
  if (emCentavos && positivo(lerNumero(emCentavos.texto))) {
    saida.value = (lerNumero(emCentavos.texto) / 100).toFixed(2);
    saida.valorCampo = emCentavos.campo;
    saida.valorEraCentavos = true;
  } else if (emUnidade && positivo(lerNumero(emUnidade.texto))) {
    saida.value = lerNumero(emUnidade.texto).toFixed(2);
    saida.valorCampo = emUnidade.campo;
  } else if (ambiguo && positivo(lerNumero(ambiguo.texto))) {
    if (/[.,]\d{1,2}$/.test(ambiguo.texto.trim())) {
      saida.value = lerNumero(ambiguo.texto).toFixed(2);
      saida.valorCampo = ambiguo.campo;
    } else {
      saida.valorAmbiguo = ambiguo.campo;
    }
  }

  const moeda = achar(nos, MOEDA);
  if (moeda) saida.currency = moeda;
  const pedido = achar(nos, PEDIDO);
  if (pedido) saida.orderId = pedido;

  const fbp = achar(nos, ['fbp']);
  if (fbp) saida.fbp = fbp;
  const fbc = achar(nos, ['fbc']);
  if (fbc) saida.fbc = fbc;
  const fbclid = achar(nos, ['fbclid']);
  if (fbclid) saida.fbclid = fbclid;
  const ua = achar(nos, USER_AGENT);
  if (ua) saida.userAgent = ua;
  const ip = achar(nos, IP);
  if (ip) saida.ip = ip;
  const url = achar(nos, URL_ORIGEM);
  if (/^https?:\/\//i.test(url)) saida.sourceUrl = url;
  const dominio = achar(nos, DOMINIO);
  if (dominio) saida.dominio = dominio;

  const utms: Record<string, string> = {};
  for (const k of UTMS) {
    const v = achar(nos, ['utm' + k]);
    if (v) utms[k] = v;
  }
  if (Object.keys(utms).length) saida.utms = utms;

  return saida;
}

/**
 * Nome do evento quando ele não vem em `event`: outras plataformas usam
 * `type`, `event_type`, `webhook_event_type`, `topic`. Só olha a raiz:
 * mais fundo, `type` é tipo de pagamento, não de evento.
 */
export function nomeDoEventoGenerico(payload: unknown): string {
  if (!ehObjeto(payload)) return '';
  for (const nome of NOME_DO_EVENTO) {
    const direto = lerDe(payload, [nome]);
    if (direto && direto.length <= 80 && !/\s/.test(direto)) return direto;
  }
  return '';
}

/**
 * A origem disse que este é o primeiro depósito/compra da pessoa?
 * `approved_deposits === 1` (contagem que já inclui o depósito corrente) ou
 * uma marca booleana com esse nome. `undefined` = a origem não informa.
 */
export function ehPrimeiroDeposito(payload: unknown): true | undefined {
  for (const no of percorrer(payload)) {
    for (const [k, v] of Object.entries(no.obj)) {
      const c = chave(k);
      if (c === 'approveddeposits' && Number(v) === 1) return true;
      if (['firstdeposit', 'isfirstdeposit', 'ftd', 'isftd', 'primeirodeposito', 'firstpurchase', 'isfirstpurchase'].includes(c) && (v === true || v === 'true' || v === 1)) return true;
    }
  }
  return undefined;
}
