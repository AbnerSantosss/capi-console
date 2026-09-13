// Import de TIPO nos dois casos: config-store.ts comeca com 'server-only' e
// este catalogo tambem e lido pela tela do console. Tipo some na compilacao,
// entao a tela importa daqui sem arrastar o modulo de servidor para o bundle.
import type { RegraRoteamento } from './config-store';
import type { NomeEventoMetaPadrao } from './meta-events';

/** Um evento que a tag do navegador tem permissao de disparar. */
export interface EventoTag {
  /** Nome padrao da Meta que sai em event_name. Tipado: errar uma letra nao compila. */
  evento: NomeEventoMetaPadrao;
  /**
   * Nome de origem que a tag envia ao coletor, sempre no prefixo 'tag.'.
   * E o que casa com RegraRoteamento.eventoOrigem — o prefixo existe para o
   * operador nunca confundir, na tela de regras, um evento do navegador com um
   * evento do webhook da plataforma, que tem autenticacao e peso diferentes.
   */
  origem: string;
  /** Rotulo em portugues, exibido AO LADO do nome tecnico, nunca no lugar dele. */
  rotuloPt: string;
  /** Uma linha. O que este evento significa para a campanha. */
  descricao: string;
  /** Em que momento da pagina a tag dispara. Vai impresso no gerador de tag. */
  quando: string;
  /** true = a tag ja nasce pronta quando o operador cadastra um dominio. */
  padrao: boolean;
}

/**
 * Catalogo do que a tag do navegador PODE disparar.
 *
 * Os dois primeiros vem ligados porque o webhook da plataforma nao manda
 * PageView nenhum: sem a tag, a Meta nao ve visita alguma no site e o algoritmo
 * otimiza as de audiencia sem sinal de topo. O resto fica disponivel mas
 * desligado — cada evento a mais e um evento que o operador precisa conferir
 * antes de confiar.
 *
 * `as const satisfies` e de proposito: sem ele, 'PageVeiw' passaria no tsc,
 * chegaria na Meta com HTTP 200 e criaria um evento personalizado inutil no
 * Gerenciador — erro indistinguivel de sucesso.
 */
export const EVENTOS_TAG = [
  {
    evento: 'PageView',
    origem: 'tag.pageview',
    rotuloPt: 'Visita à página',
    descricao: 'Abriu uma página do site. É o sinal de topo que o webhook nunca manda.',
    quando: 'Assim que a página abre, antes de qualquer clique.',
    padrao: true,
  },
  {
    evento: 'ViewContent',
    origem: 'tag.viewcontent',
    rotuloPt: 'Visualizou a página',
    descricao: 'Leu a página de vendas de verdade, não só abriu e saiu.',
    quando: 'Alguns segundos depois da abertura, ou quando o visitante rola a página.',
    padrao: true,
  },
  {
    evento: 'InitiateCheckout',
    origem: 'tag.initiatecheckout',
    rotuloPt: 'Checkout iniciado',
    descricao: 'Saiu da página de vendas em direção ao pagamento.',
    quando: 'No clique do botão que leva ao checkout.',
    padrao: false,
  },
  {
    evento: 'Lead',
    origem: 'tag.lead',
    rotuloPt: 'Contato capturado',
    descricao: 'Deixou um contato em formulário da própria página.',
    quando: 'No envio do formulário, depois da validação dos campos.',
    padrao: false,
  },
  {
    evento: 'AddToCart',
    origem: 'tag.addtocart',
    rotuloPt: 'Adicionou ao carrinho',
    descricao: 'Escolheu o produto sem ter ido ao pagamento ainda.',
    quando: 'No clique de adicionar ao carrinho.',
    padrao: false,
  },
  {
    evento: 'Search',
    origem: 'tag.search',
    rotuloPt: 'Fez uma busca',
    descricao: 'Procurou algo dentro do site.',
    quando: 'Ao enviar a busca, com o termo já digitado.',
    padrao: false,
  },
  {
    evento: 'CompleteRegistration',
    origem: 'tag.completeregistration',
    rotuloPt: 'Cadastro concluído',
    descricao: 'Terminou um cadastro feito na própria página.',
    quando: 'Na tela de confirmação do cadastro.',
    padrao: false,
  },
  {
    evento: 'Contact',
    origem: 'tag.contact',
    rotuloPt: 'Contato iniciado',
    descricao: 'Foi falar com a equipe por WhatsApp ou chat.',
    quando: 'No clique do botão de WhatsApp ou do chat.',
    padrao: false,
  },
  {
    evento: 'AddPaymentInfo',
    origem: 'tag.addpaymentinfo',
    rotuloPt: 'Pagamento gerado',
    descricao: 'Escolheu a forma de pagamento ainda dentro da página.',
    quando: 'Ao selecionar o meio de pagamento ou preencher os dados do cartão.',
    padrao: false,
  },
] as const satisfies readonly EventoTag[];

/**
 * Eventos que a tag do navegador NUNCA pode criar.
 *
 * Sao os eventos de dinheiro. A tag vive no HTML da pagina de vendas, com a
 * chave publica a vista de qualquer visitante que abrir o codigo-fonte. Se o
 * navegador pudesse criar um destes, qualquer pessoa forjaria uma venda que
 * nunca existiu: a Meta contaria a receita falsa, o algoritmo aprenderia com
 * publico que nao compra e o trafego iria para quem nunca converteria — alem
 * de violar a regra 1 do CLAUDE.md (somente eventos reais).
 *
 * Purchase e Subscribe vem SO do webhook da plataforma, autenticado por segredo
 * que nunca sai do servidor.
 */
export const EVENTOS_TAG_PROIBIDOS: ReadonlySet<string> = new Set([
  'Purchase',
  'Subscribe',
  'StartTrial',
  'Donate',
]);

/**
 * Resolve o nome de origem que chegou do navegador ('tag.pageview') na entrada
 * do catalogo. undefined para qualquer coisa fora da lista — o coletor recusa.
 *
 * Cinto e suspensorio: mesmo achando a entrada, recusa se o evento resolvido
 * estiver em EVENTOS_TAG_PROIBIDOS. Assim, incluir Purchase em EVENTOS_TAG por
 * descuido continua nao virando uma venda forjada.
 */
export function eventoTagPermitido(origem: string): EventoTag | undefined {
  const chave = String(origem ?? '').trim();
  if (!chave) return undefined;
  const entrada = EVENTOS_TAG.find((e) => e.origem === chave);
  if (!entrada) return undefined;
  if (EVENTOS_TAG_PROIBIDOS.has(entrada.evento)) return undefined;
  return entrada;
}

/**
 * Uma regra de roteamento para cada evento do catalogo, para o operador ver na
 * tela de Integracoes o destino de tudo que a tag manda — inclusive do que esta
 * desligado, que aparece como 'ignorar' em vez de sumir sem explicacao.
 *
 * NENHUMA nasce em 'auto', igual REGRAS_SEMENTE: nesta casa nada vai sozinho
 * para a Meta antes de um humano ver o evento chegando na aba Eventos de teste.
 * Ligar o automatico e sempre uma decisao consciente, feita na tela.
 */
export function regrasSementeTag(): RegraRoteamento[] {
  return EVENTOS_TAG.map((e) => ({
    id: `r-tag-${e.origem.replace(/^tag\./, '')}`,
    eventoOrigem: e.origem,
    eventoMeta: e.evento,
    marcas: [],
    modo: e.padrao ? 'fila' : 'ignorar',
    ativo: true,
  }));
}
