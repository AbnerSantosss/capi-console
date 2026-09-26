/**
 * Dados de teste para a aba "Teste" (`/e/<slug>/teste`) — módulo puro.
 *
 * Nenhum Next, nenhum `window`, nenhum disco: roda igual no navegador (o
 * preenchimento automático da aba) e no teste (`scripts/enviar-teste.test.mjs`).
 *
 * TUDO AQUI TEM CARA DE TESTE, e de propósito: e-mail em `example.com`
 * (domínio reservado, RFC 2606), `external_id` começando com `teste-`, pedido
 * `TESTE-…`, IP da faixa de documentação 203.0.113.0/24 (RFC 5737) e o
 * `fbclid` com `teste_capi`. Se um desses eventos escapasse do "Testar
 * eventos" da Meta, qualquer pessoa o reconheceria de olho. Nenhuma pessoa de
 * verdade e nenhuma venda de verdade saem daqui.
 *
 * Quem garante que nada disso conta como conversão é a rota
 * `/api/enviar-teste`, que só envia com `test_event_code`.
 */

/** Os 8 eventos da aba, na ordem do funil. A rota só aceita estes nomes. */
export const EVENTOS_DE_TESTE = [
  'PageView',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Lead',
  'CompleteRegistration',
  'Purchase',
] as const;

export type EventoDeTeste = (typeof EVENTOS_DE_TESTE)[number];

export function ehEventoDeTeste(nome: unknown): nome is EventoDeTeste {
  return typeof nome === 'string' && (EVENTOS_DE_TESTE as readonly string[]).includes(nome);
}

/** O que o operador lê ao lado de cada evento. */
export const ROTULO_DO_EVENTO: Record<EventoDeTeste, string> = {
  PageView: 'Visita à página',
  ViewContent: 'Viu o produto',
  AddToCart: 'Pôs no carrinho',
  InitiateCheckout: 'Abriu o checkout',
  AddPaymentInfo: 'Informou o pagamento',
  Lead: 'Deixou o contato',
  CompleteRegistration: 'Concluiu o cadastro',
  Purchase: 'Comprou',
};

/**
 * O código de teste do "Testar eventos" da Meta: `TEST` e depois letras e
 * números (ex.: `TEST12345`). Qualquer outra coisa é recusada antes de sair.
 */
export const RE_CODIGO_DE_TESTE = /^TEST[A-Z0-9]{1,40}$/i;

export function ehCodigoDeTeste(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && RE_CODIGO_DE_TESTE.test(codigo.trim());
}

export interface DadosDeTeste {
  firstName: string;
  lastName: string;
  email: string;
  /** Celular brasileiro em E.164: +55, DDD e 9 dígitos começando com 9. */
  phone: string;
  externalId: string;
  fbc: string;
  fbp: string;
  ip: string;
  userAgent: string;
  /** Vazio quando a empresa não tem domínio. */
  sourceUrl: string;
  value: number;
  currency: 'BRL';
  orderId: string;
  contentName: string;
}

export interface OpcoesDeTeste {
  /** Agora, em milissegundos (`Date.now()`). Vem de fora para o módulo ser puro. */
  agora: number;
  userAgent?: string;
  /** Domínio da empresa (ex.: `loja.com.br`), sem protocolo. */
  dominio?: string;
  /** Fonte de aleatoriedade em [0, 1). Padrão: `Math.random`. */
  aleatorio?: () => number;
}

const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabi', 'Hugo'];
const SOBRENOMES = ['Teste', 'Silva Teste', 'Souza Teste', 'Lima Teste', 'Costa Teste'];
/** DDDs reais, de capitais diferentes. */
const DDDS = ['11', '21', '31', '41', '51', '61', '71', '81', '85', '62'];

const ALFANUMERICO = 'abcdefghijklmnopqrstuvwxyz0123456789';

function inteiro(aleatorio: () => number, min: number, max: number): number {
  return min + Math.floor(aleatorio() * (max - min + 1));
}

function escolher<T>(aleatorio: () => number, lista: readonly T[]): T {
  return lista[inteiro(aleatorio, 0, lista.length - 1)];
}

function digitos(aleatorio: () => number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String(inteiro(aleatorio, 0, 9));
  return s;
}

function letras(aleatorio: () => number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += ALFANUMERICO[inteiro(aleatorio, 0, ALFANUMERICO.length - 1)];
  return s;
}

const dois = (n: number) => String(n).padStart(2, '0');

/** `AAAAMMDD-HHMMSS` no fuso de quem chama (o navegador, na aba). */
function carimbo(agora: number): string {
  const d = new Date(agora);
  return (
    `${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}` +
    `-${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`
  );
}

/** O domínio sem protocolo, sem caminho e sem barra; vazio se não parecer domínio. */
function dominioLimpo(dominio?: string): string {
  const d = String(dominio ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
}

/**
 * Um comprador de mentira, completo, para o preenchimento automático.
 * Cada chamada sai diferente (e-mail, telefone, ids), para a Meta não
 * juntar dois testes na mesma pessoa.
 */
export function gerarDadosDeTeste({
  agora,
  userAgent = '',
  dominio,
  aleatorio = Math.random,
}: OpcoesDeTeste): DadosDeTeste {
  // O clique e o cookie do Pixel "aconteceram" uns minutos antes: a Meta
  // avisa quando o fbc tem data no futuro.
  const clique = agora - inteiro(aleatorio, 2, 10) * 60_000;
  const site = dominioLimpo(dominio);
  return {
    firstName: escolher(aleatorio, NOMES),
    lastName: escolher(aleatorio, SOBRENOMES),
    email: `teste.capi+${inteiro(aleatorio, 10000, 99999)}@example.com`,
    phone: `+55${escolher(aleatorio, DDDS)}9${digitos(aleatorio, 8)}`,
    externalId: `teste-${letras(aleatorio, 12)}`,
    fbc: `fb.1.${clique}.teste_capi_${letras(aleatorio, 16)}`,
    fbp: `fb.1.${clique}.${inteiro(aleatorio, 1, 9)}${digitos(aleatorio, 9)}`,
    ip: `203.0.113.${inteiro(aleatorio, 1, 254)}`,
    userAgent: String(userAgent ?? '').trim(),
    sourceUrl: site ? `https://${site}/?utm_source=teste-capi` : '',
    value: 97.0,
    currency: 'BRL',
    orderId: `TESTE-${carimbo(agora)}`,
    contentName: 'Produto de teste',
  };
}

/** Um `event_id` que não repete: o evento, o instante e um sufixo aleatório. */
export function eventIdDeTeste(
  evento: string,
  agora: number,
  aleatorio: () => number = Math.random
): string {
  return `teste-${evento.toLowerCase()}-${agora}-${letras(aleatorio, 6)}`;
}

/** Quais eventos levam valor e moeda (a Meta usa para o valor da conversão). */
const COM_VALOR: ReadonlySet<EventoDeTeste> = new Set<EventoDeTeste>([
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Purchase',
]);

/**
 * O corpo de `event` que a aba manda para `/api/enviar-teste`: o mesmo
 * formato do envio manual (`EventInput` de meta-capi.ts). `event_time` é o
 * `agora` de CADA envio, em segundos.
 */
export function eventoDeTeste(evento: EventoDeTeste, dados: DadosDeTeste, agora: number) {
  const custom: {
    value?: number;
    currency?: string;
    orderId?: string;
    contentName?: string;
  } = {};
  if (evento !== 'PageView') custom.contentName = dados.contentName;
  if (COM_VALOR.has(evento)) {
    custom.value = dados.value;
    custom.currency = dados.currency;
  }
  if (evento === 'Purchase') custom.orderId = dados.orderId;

  return {
    event_name: evento,
    event_time: Math.floor(agora / 1000),
    event_id: eventIdDeTeste(evento, agora),
    event_source_url: dados.sourceUrl || undefined,
    action_source: 'website',
    user: {
      email: dados.email,
      phone: dados.phone,
      addDDI: true,
      firstName: dados.firstName,
      lastName: dados.lastName,
      externalId: dados.externalId,
      fbc: dados.fbc,
      fbp: dados.fbp,
      ip: dados.ip,
      userAgent: dados.userAgent,
    },
    custom,
  };
}
