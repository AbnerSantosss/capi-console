/**
 * Vocabulario da tela de Disparo automatico.
 *
 * Um lugar so para responder, em portugues, as duas perguntas que o operador
 * faz olhando a caixa de entrada e a tabela de regras:
 *
 *   1. "este evento da plataforma vira QUAL evento padrao da Meta?"
 *   2. "se nao vira nada, POR QUE nao vira?"
 *
 * O nome tecnico (`Purchase`) nunca e traduzido nem escondido: e ele que vai em
 * `event_name` e e ele que aparece no Gerenciador de Eventos. O portugues entra
 * ao lado, nunca no lugar.
 */

import type { LucideIcon } from '@/components/ui/icones';

import { acharEventoPadrao } from '@/lib/meta-events';
import {
  EVENTOS_TESTE_PLATAFORMA,
  MAPA_EVENTOS_ORIGEM,
  type ClassificacaoEvento,
  type MotivoIgnorar,
} from '@/lib/parser';

export interface ParMeta {
  /** Nome tecnico, exatamente como vai em event_name. */
  tecnico: string;
  /** Rotulo em portugues, exibido ao lado do tecnico. */
  pt: string;
  /** Uma linha explicando o evento. */
  descricao: string;
  /** false quando o nome nao esta no catalogo padrao da Meta. */
  padrao: boolean;
  icon?: LucideIcon;
}

/** O par "nome tecnico + portugues" de um evento da Meta. null quando nao ha evento. */
export function parMeta(nome?: string | null): ParMeta | null {
  const limpo = String(nome ?? '').trim();
  if (!limpo) return null;

  const catalogo = acharEventoPadrao(limpo);
  if (catalogo && catalogo.value !== 'Custom') {
    return {
      tecnico: catalogo.value,
      pt: catalogo.rotuloPt,
      descricao: catalogo.descricao,
      padrao: true,
      icon: catalogo.icon,
    };
  }

  return {
    tecnico: limpo,
    pt: 'Evento personalizado',
    descricao:
      'Nome fora dos padrões da Meta. Vira um evento personalizado no Gerenciador de Eventos e não otimiza campanha.',
    padrao: false,
  };
}

export interface TextoClassificacao {
  rotulo: string;
  explicacao: string;
  tom: 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
}

/** Um rotulo por estado, para o operador nunca ler so "IGNORAR". */
export const TEXTO_CLASSIFICACAO: Record<ClassificacaoEvento, TextoClassificacao> = {
  mapeado: {
    rotulo: 'Tem evento padrão na Meta',
    explicacao: 'Este nome da plataforma tem um evento padrão equivalente na Meta.',
    tom: 'success',
  },
  'sem-equivalente': {
    rotulo: 'Não enviar — a Meta não tem evento padrão equivalente',
    explicacao:
      'Abandono, expiração, estorno, chargeback e movimento financeiro interno não são conversão. Isto é o comportamento correto, não uma falha.',
    tom: 'neutral',
  },
  'teste-plataforma': {
    rotulo: 'Teste de conexão da plataforma — chegou certo, nada a enviar',
    explicacao:
      'É o botão "Testar" do backoffice. Prova que a entrega funciona; não existe venda por trás dele.',
    tom: 'accent',
  },
  desconhecido: {
    rotulo: 'Nome novo, ainda sem regra. Nada foi enviado.',
    explicacao:
      'O nome não está no catálogo conhecido. Nenhum palpite vira conversão sozinho: crie a regra na aba Regras para decidir se ele vai à Meta e para qual Pixel.',
    tom: 'warning',
  },
  'sem-evento': {
    rotulo: 'Chegou sem nome de evento',
    explicacao:
      'O corpo não trouxe o nome do evento — ou nem pôde ser lido. Nada foi enviado à Meta.',
    tom: 'warning',
  },
};

/** Frase curta por motivo, usada quando nao ha classificacao para detalhar. */
export const TEXTO_MOTIVO: Record<MotivoIgnorar, string> = {
  regra: 'a regra deste evento está em Ignorar',
  'sem-equivalente-meta': 'não existe evento padrão equivalente na Meta',
  'teste-plataforma': 'é teste da própria plataforma, não é venda',
  'sem-regra': 'é um nome novo e ainda não há regra dizendo para qual Pixel ele vai',
  'nao-lido': 'o corpo não pôde ser lido (não é JSON ou passou de 1 MB)',
};

/** Categorias de nome que a Meta nao tem como representar. */
const FAMILIAS: Array<{ marcas: string[]; motivo: string }> = [
  {
    marcas: ['abandon', 'expir'],
    motivo: 'abandono e expiração não são conversão',
  },
  {
    marcas: ['refund', 'estorn', 'chargeback', 'reversed', 'cancel'],
    motivo: 'estorno, cancelamento e chargeback desfazem a venda, não a criam',
  },
  {
    marcas: ['affiliate', 'commission', 'withdraw'],
    motivo: 'é dinheiro do produtor e do afiliado, não uma ação do comprador',
  },
  {
    marcas: ['renew', 'renov', 'subscription_cancelled', 'subscription_expired'],
    motivo: 'renovação e fim de assinatura não são aquisição nova',
  },
  {
    marcas: ['ebook', 'tool_used', 'onboarding'],
    motivo: 'é engajamento dentro do produto, sem evento padrão equivalente',
  },
];

function familiaDoNome(nome: string): string | undefined {
  const n = nome.toLowerCase();
  return FAMILIAS.find((f) => f.marcas.some((m) => n.includes(m)))?.motivo;
}

export interface DadosDoMotivo {
  eventoOrigem?: string;
  classificacao?: ClassificacaoEvento;
  motivoIgnorar?: MotivoIgnorar;
  testePlataforma?: boolean;
}

/**
 * Por que nada foi para a Meta, com todas as letras. Uma frase, sempre
 * especifica: "IGNORAR" sozinho nao explica nada a quem opera.
 */
export function motivoLegivel(dados: DadosDoMotivo): string {
  const nome = dados.eventoOrigem ?? '';

  if (dados.motivoIgnorar === 'nao-lido') {
    return 'O corpo não pôde ser lido: não é JSON válido ou passou de 1 MB. A entrega ficou registrada aqui para você ver que ela existiu.';
  }

  if (dados.testePlataforma || dados.classificacao === 'teste-plataforma') {
    return 'Teste da plataforma: ela mandou um "ping" para conferir o endereço. A entrega chegou certa e não há venda para enviar.';
  }

  if (dados.classificacao === 'sem-equivalente') {
    const familia = familiaDoNome(nome);
    return familia
      ? `Não existe evento padrão equivalente na Meta — ${familia}.`
      : 'Não existe evento padrão equivalente na Meta para este nome.';
  }

  if (dados.motivoIgnorar === 'regra') {
    return 'A regra deste evento está em Ignorar na aba Regras. Mude a regra lá se quiser que ele passe a ir para a Meta.';
  }

  if (dados.classificacao === 'desconhecido' || dados.motivoIgnorar === 'sem-regra') {
    return 'Nome novo, fora do catálogo conhecido. Nada é enviado por palpite: crie uma regra na aba Regras para decidir se ele vai à Meta e para qual Pixel.';
  }

  if (dados.classificacao === 'sem-evento') {
    return 'O corpo chegou sem nome de evento. Sem nome não há como escolher um evento da Meta.';
  }

  if (dados.motivoIgnorar) {
    return `Nada foi enviado à Meta: ${TEXTO_MOTIVO[dados.motivoIgnorar]}.`;
  }

  return 'Nada foi enviado à Meta.';
}

/**
 * Motivo de uma REGRA em Ignorar, deduzido do nome de origem. A regra nao
 * guarda motivo; quem sabe e a tabela do parser.
 */
export function motivoDaRegraIgnorar(eventoOrigem: string): string {
  const nome = String(eventoOrigem ?? '').trim();
  if (!nome) return 'Nada é enviado à Meta.';
  if (nome === '*') return 'Curinga: nada que caia aqui vai para a Meta.';

  if (EVENTOS_TESTE_PLATAFORMA.has(nome)) {
    return 'Teste da própria plataforma — a entrega chega, nada vai para a Meta.';
  }

  if (nome in MAPA_EVENTOS_ORIGEM) {
    const equivalente = MAPA_EVENTOS_ORIGEM[nome];
    if (equivalente === null) {
      const familia = familiaDoNome(nome);
      return familia
        ? `Não existe evento padrão equivalente na Meta — ${familia}.`
        : 'Não existe evento padrão equivalente na Meta.';
    }
    const par = parMeta(equivalente);
    return `Tem equivalente na Meta (${par?.pt} · ${equivalente}), mas está desligado por decisão do projeto.`;
  }

  return 'Nome fora do catálogo conhecido. Enquanto estiver em Ignorar, nada vai para a Meta.';
}
