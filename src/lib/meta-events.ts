import {
  ShoppingBag,
  ShoppingCart,
  UserPlus,
  CreditCard,
  Eye,
  UserCheck,
  PhoneCall,
  Sliders,
  Repeat,
  FlaskConical,
  ClipboardCheck,
  CalendarClock,
  Heart,
  Palette,
  HandHeart,
  MapPin,
  Search,
  FileText,
  type LucideIcon,
} from 'lucide-react';

export interface EventoMeta {
  /** Nome tecnico. E exatamente o que vai em event_name e o que aparece no Gerenciador. */
  value: string;
  /** Nome curto — o que aparece no seletor. Nunca traduzir: e o mesmo do event_name. */
  label: string;
  /** Rotulo em portugues, exibido AO LADO do nome tecnico, nunca no lugar dele. */
  rotuloPt: string;
  /** Uma linha. Sem parenteses explicativos. */
  descricao: string;
  etapa: 'Topo' | 'Meio' | 'Fundo' | 'Personalizado';
  icon: LucideIcon;
  /** Se a Meta exige value + currency. */
  exigeValor?: boolean;
  /**
   * true quando NENHUM evento de origem da plataforma/gateway produz este nome.
   * Serve so para a tela de regras nao oferecer o que a plataforma nunca manda.
   */
  somenteManual?: boolean;
}

/** Entrada de escape do formulario manual. Fica fora dos nomes padrao da Meta. */
const PERSONALIZADO = {
  value: 'Custom',
  label: 'Personalizado',
  rotuloPt: 'Evento personalizado',
  descricao: 'Um nome próprio registrado no Gerenciador de Eventos.',
  etapa: 'Personalizado',
  icon: Sliders,
} as const satisfies EventoMeta;

/**
 * Catalogo de eventos padrao da Meta (mais a entrada "Custom").
 *
 * Purchase vem primeiro por ser o evento do projeto, nao por prioridade de
 * fallback: nenhuma funcao deste arquivo cai no primeiro item da lista.
 *
 * Quem produz cada um esta em MAPA_EVENTOS_ORIGEM (src/lib/parser.ts). Os
 * marcados com somenteManual nao tem evento de origem nenhum hoje — existem
 * para o formulario de envio manual e para nao inventarmos nome quando a
 * plataforma passar a emitir um deles.
 */
export const EVENTOS_META = [
  {
    value: 'Purchase',
    label: 'Purchase',
    rotuloPt: 'Compra aprovada',
    descricao: 'Compra concluída. O evento de maior peso para otimizar ROAS.',
    etapa: 'Fundo',
    icon: ShoppingBag,
    exigeValor: true,
  },
  {
    value: 'Subscribe',
    label: 'Subscribe',
    rotuloPt: 'Assinatura iniciada',
    descricao: 'Iniciou uma assinatura paga recorrente.',
    etapa: 'Fundo',
    icon: Repeat,
    exigeValor: true,
  },
  {
    value: 'StartTrial',
    label: 'StartTrial',
    rotuloPt: 'Teste gratuito iniciado',
    descricao: 'Começou um período de teste, pago ou gratuito.',
    etapa: 'Fundo',
    icon: FlaskConical,
    somenteManual: true,
  },
  {
    value: 'InitiateCheckout',
    label: 'InitiateCheckout',
    rotuloPt: 'Checkout iniciado',
    descricao: 'O comprador chegou à página de pagamento.',
    etapa: 'Fundo',
    icon: ShoppingCart,
  },
  {
    value: 'AddPaymentInfo',
    label: 'AddPaymentInfo',
    rotuloPt: 'Pagamento gerado',
    descricao: 'Escolheu o método de pagamento ou inseriu os dados do cartão.',
    etapa: 'Fundo',
    icon: CreditCard,
  },
  {
    value: 'Lead',
    label: 'Lead',
    rotuloPt: 'Contato capturado',
    descricao: 'Capturou um contato: e-mail, WhatsApp ou formulário.',
    etapa: 'Meio',
    icon: UserPlus,
  },
  {
    value: 'CompleteRegistration',
    label: 'CompleteRegistration',
    rotuloPt: 'Cadastro concluído',
    descricao: 'Finalizou um cadastro na plataforma ou no evento.',
    etapa: 'Meio',
    icon: UserCheck,
  },
  {
    value: 'SubmitApplication',
    label: 'SubmitApplication',
    rotuloPt: 'Inscrição enviada',
    descricao: 'Enviou uma candidatura ou inscrição que passa por aprovação.',
    etapa: 'Meio',
    icon: ClipboardCheck,
    somenteManual: true,
  },
  {
    value: 'Schedule',
    label: 'Schedule',
    rotuloPt: 'Agendamento feito',
    descricao: 'Marcou uma call, consulta ou visita.',
    etapa: 'Meio',
    icon: CalendarClock,
    somenteManual: true,
  },
  {
    value: 'Contact',
    label: 'Contact',
    rotuloPt: 'Contato iniciado',
    descricao: 'Clicou para falar no WhatsApp ou no chat.',
    etapa: 'Meio',
    icon: PhoneCall,
    somenteManual: true,
  },
  {
    value: 'AddToCart',
    label: 'AddToCart',
    rotuloPt: 'Adicionou ao carrinho',
    descricao: 'Adicionou o produto ao carrinho.',
    etapa: 'Meio',
    icon: ShoppingCart,
    somenteManual: true,
  },
  {
    value: 'AddToWishlist',
    label: 'AddToWishlist',
    rotuloPt: 'Salvou na lista de desejos',
    descricao: 'Guardou o produto para comprar depois.',
    etapa: 'Meio',
    icon: Heart,
    somenteManual: true,
  },
  {
    value: 'CustomizeProduct',
    label: 'CustomizeProduct',
    rotuloPt: 'Personalizou o produto',
    descricao: 'Escolheu variação, plano ou configuração do produto.',
    etapa: 'Meio',
    icon: Palette,
    somenteManual: true,
  },
  {
    value: 'Donate',
    label: 'Donate',
    rotuloPt: 'Doação feita',
    descricao: 'Fez uma doação para a causa ou projeto.',
    etapa: 'Fundo',
    icon: HandHeart,
    somenteManual: true,
  },
  {
    value: 'FindLocation',
    label: 'FindLocation',
    rotuloPt: 'Buscou um local',
    descricao: 'Procurou uma loja, unidade ou ponto de retirada.',
    etapa: 'Topo',
    icon: MapPin,
    somenteManual: true,
  },
  {
    value: 'Search',
    label: 'Search',
    rotuloPt: 'Fez uma busca',
    descricao: 'Usou a busca do site ou do catálogo.',
    etapa: 'Topo',
    icon: Search,
    somenteManual: true,
  },
  {
    value: 'ViewContent',
    label: 'ViewContent',
    rotuloPt: 'Visualizou a página',
    descricao: 'Visualizou a página de vendas ou um produto do catálogo.',
    etapa: 'Topo',
    icon: Eye,
    somenteManual: true,
  },
  {
    value: 'PageView',
    label: 'PageView',
    rotuloPt: 'Visita à página',
    descricao: 'Abriu qualquer página do site. É o que o Pixel já manda sozinho.',
    etapa: 'Topo',
    icon: FileText,
    somenteManual: true,
  },
  PERSONALIZADO,
] as const satisfies readonly EventoMeta[];

/** Todo nome do catalogo, inclusive 'Custom'. */
export type NomeEventoMeta = (typeof EVENTOS_META)[number]['value'];

/**
 * Nomes padrao da Meta — o que pode virar event_name sem criar evento
 * personalizado no Gerenciador. MAPA_EVENTOS_ORIGEM e as regras semente sao
 * tipados com isto: errar uma letra quebra o `tsc --noEmit` do `npm run check`.
 */
export type NomeEventoMetaPadrao = Exclude<NomeEventoMeta, 'Custom'>;

/** Fonte unica em runtime. Use para recusar nome que nao e padrao da Meta. */
export const NOMES_PADRAO_META: ReadonlySet<string> = new Set(
  EVENTOS_META.filter((e) => e.value !== 'Custom').map((e) => e.value)
);

export function ehNomePadraoMeta(nome: string): boolean {
  return NOMES_PADRAO_META.has(String(nome ?? '').trim());
}

/** Achatado para comparar erro de digitacao: 'purchase ' e 'Purchase' colidem aqui. */
function achatar(nome: string): string {
  return String(nome ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Nome padrao que o operador provavelmente quis digitar, quando o que ele
 * escreveu so difere por caixa, espaco ou hifen. A Meta aceitaria 'purchase'
 * com HTTP 200 e criaria um evento personalizado inutil — erro indistinguivel
 * de sucesso. undefined quando nao ha parecido.
 */
export function nomePadraoParecido(nome: string): string | undefined {
  const cru = String(nome ?? '').trim();
  if (!cru || ehNomePadraoMeta(cru)) return undefined;
  const chave = achatar(cru);
  if (!chave) return undefined;
  for (const padrao of NOMES_PADRAO_META) {
    if (achatar(padrao) === chave) return padrao;
  }
  return undefined;
}

/** Entrada exata do catalogo, ou undefined. Quem chama decide o que fazer. */
export function acharEventoPadrao(value: string): EventoMeta | undefined {
  return EVENTOS_META.find((e) => e.value === value);
}

/**
 * Entrada para pintar a tela. Nome fora do catalogo cai em "Personalizado" —
 * NUNCA em Purchase: antes, `acharEvento('Subscribe')` devolvia Purchase e a
 * tela mentia sobre o que seria enviado.
 */
export function acharEvento(value: string): EventoMeta {
  return acharEventoPadrao(value) ?? PERSONALIZADO;
}
