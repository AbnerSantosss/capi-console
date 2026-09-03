import {
  ShoppingBag,
  ShoppingCart,
  UserPlus,
  CreditCard,
  Eye,
  UserCheck,
  PhoneCall,
  Sliders,
  type LucideIcon,
} from 'lucide-react';

export interface EventoMeta {
  value: string;
  /** Nome curto — o que aparece no seletor. */
  label: string;
  /** Uma linha. Sem parenteses explicativos. */
  descricao: string;
  etapa: 'Topo' | 'Meio' | 'Fundo' | 'Personalizado';
  icon: LucideIcon;
  /** Se a Meta exige value + currency. */
  exigeValor?: boolean;
}

export const EVENTOS_META: EventoMeta[] = [
  {
    value: 'Purchase',
    label: 'Purchase',
    descricao: 'Compra concluída. O evento de maior peso para otimizar ROAS.',
    etapa: 'Fundo',
    icon: ShoppingBag,
    exigeValor: true,
  },
  {
    value: 'InitiateCheckout',
    label: 'InitiateCheckout',
    descricao: 'O comprador chegou à página de pagamento.',
    etapa: 'Fundo',
    icon: ShoppingCart,
  },
  {
    value: 'AddPaymentInfo',
    label: 'AddPaymentInfo',
    descricao: 'Escolheu o método de pagamento ou inseriu os dados do cartão.',
    etapa: 'Fundo',
    icon: CreditCard,
  },
  {
    value: 'Lead',
    label: 'Lead',
    descricao: 'Capturou um contato: e-mail, WhatsApp ou formulário.',
    etapa: 'Meio',
    icon: UserPlus,
  },
  {
    value: 'CompleteRegistration',
    label: 'CompleteRegistration',
    descricao: 'Finalizou um cadastro na plataforma ou no evento.',
    etapa: 'Meio',
    icon: UserCheck,
  },
  {
    value: 'AddToCart',
    label: 'AddToCart',
    descricao: 'Adicionou o produto ao carrinho.',
    etapa: 'Meio',
    icon: ShoppingCart,
  },
  {
    value: 'Contact',
    label: 'Contact',
    descricao: 'Clicou para falar no WhatsApp ou no chat.',
    etapa: 'Meio',
    icon: PhoneCall,
  },
  {
    value: 'ViewContent',
    label: 'ViewContent',
    descricao: 'Visualizou a página de vendas ou um produto do catálogo.',
    etapa: 'Topo',
    icon: Eye,
  },
  {
    value: 'Custom',
    label: 'Personalizado',
    descricao: 'Um nome próprio registrado no Gerenciador de Eventos.',
    etapa: 'Personalizado',
    icon: Sliders,
  },
];

export function acharEvento(value: string): EventoMeta {
  return EVENTOS_META.find((e) => e.value === value) ?? EVENTOS_META[0];
}
