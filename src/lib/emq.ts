/**
 * Event Match Quality — calculo puro, sem React.
 *
 * Fonte unica de verdade dos pesos e das descricoes. Consumido por:
 *   - QualityPanel  (painel de controle)
 *   - QualityModal  (detalhe dos 9 parametros)
 *   - /guia         (secao "Entendendo o EMQ")
 *   - relay.ts      (payload de saida dos webhooks)
 *
 * Nao duplique estes textos em nenhum outro lugar.
 */

export type EmqNivel = 'alto' | 'medio' | 'baixo';

export interface CamposEmq {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string;
  fbc?: string;
  fbp?: string;
  ip?: string;
  userAgent?: string;
  sourceUrl?: string;
  eventId?: string;
}

export interface ParametroEmq {
  id: string;
  /** Nome curto para a interface. */
  nome: string;
  /** Sigla mostrada nos chips compactos. */
  sigla: string;
  categoria: string;
  peso: number;
  presente: boolean;
  critico: boolean;
  /** Se vai criptografado em SHA-256 antes de sair. */
  hash: boolean;
  /** Valor truncado para exibicao. Nunca o valor completo de dado pessoal. */
  amostra: string | null;
  /** O que fazer para obter este parametro. Substitui os tooltips antigos. */
  comoObter: string;
}

export interface ResultadoEmq {
  parametros: ParametroEmq[];
  /** 0.0 a 10.0 */
  nota: number;
  notaFormatada: string;
  percentual: number;
  nivel: EmqNivel;
  rotulo: string;
  presentes: number;
  total: number;
  temFbc: boolean;
  /** Ausentes ordenados pelo peso — o primeiro e o que mais compensa preencher. */
  faltando: ParametroEmq[];
}

const corta = (v: string | undefined, n: number): string | null => {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
};

export function calcularEmq(c: CamposEmq): ResultadoEmq {
  const parametros: ParametroEmq[] = [
    {
      id: 'fbc',
      nome: 'Click ID do anúncio',
      sigla: 'fbc',
      categoria: 'Atribuição direta',
      peso: 2.5,
      presente: Boolean(c.fbc && c.fbc.trim().length > 5),
      critico: true,
      hash: false,
      amostra: corta(c.fbc, 28),
      comoObter:
        'Cookie _fbc do navegador do comprador, ou montado a partir do ?fbclid= da URL no formato fb.1.<timestamp>.<fbclid>. Sem ele a Meta não liga a venda ao anúncio específico.',
    },
    {
      id: 'email',
      nome: 'E-mail',
      sigla: 'em',
      categoria: 'Correspondência principal',
      peso: 2.0,
      presente: Boolean(c.email && c.email.includes('@')),
      critico: true,
      hash: true,
      amostra: corta(c.email, 26),
      comoObter:
        'Vem do checkout ou do CRM. É normalizado em minúsculas e criptografado em SHA-256 antes do envio.',
    },
    {
      id: 'phone',
      nome: 'Telefone',
      sigla: 'ph',
      categoria: 'Correspondência principal',
      peso: 1.5,
      presente: Boolean(c.phone && c.phone.replace(/\D/g, '').length >= 10),
      critico: false,
      hash: true,
      amostra: corta(c.phone, 18),
      comoObter:
        'Celular ou WhatsApp com DDD. O DDI 55 é acrescentado automaticamente. Também vai em SHA-256.',
    },
    {
      id: 'fbp',
      nome: 'ID do navegador',
      sigla: 'fbp',
      categoria: 'Sessão e retargeting',
      peso: 1.0,
      presente: Boolean(c.fbp && c.fbp.trim().length > 5),
      critico: false,
      hash: false,
      amostra: corta(c.fbp, 28),
      comoObter:
        'Cookie _fbp, gerado pelo Pixel no seu domínio. Formato fb.1.<timestamp>.<número>.',
    },
    {
      id: 'ip',
      nome: 'IP do cliente',
      sigla: 'ip',
      categoria: 'Validação técnica',
      peso: 1.0,
      presente: Boolean(c.ip && c.ip.trim().length > 6),
      critico: false,
      hash: false,
      amostra: corta(c.ip, 24),
      comoObter:
        'IP público do comprador no momento da compra. Vai sem criptografia, por exigência da Meta. IP de proxy ou de rede interna não serve.',
    },
    {
      id: 'userAgent',
      nome: 'User agent',
      sigla: 'ua',
      categoria: 'Dispositivo',
      peso: 0.5,
      presente: Boolean(c.userAgent && c.userAgent.trim().length > 10),
      critico: false,
      hash: false,
      amostra: corta(c.userAgent, 30),
      comoObter:
        'String do navegador enviada no cabeçalho da requisição de compra. Revela se a compra veio da WebView do Instagram ou do Facebook.',
    },
    {
      id: 'sourceUrl',
      nome: 'URL da página',
      sigla: 'url',
      categoria: 'Rastreio de domínio',
      peso: 0.5,
      presente: Boolean(c.sourceUrl && c.sourceUrl.trim().length > 5),
      critico: false,
      hash: false,
      amostra: corta(c.sourceUrl, 30),
      comoObter:
        'URL completa do checkout ou da página de obrigado, com as UTMs e o fbclid preservados.',
    },
    {
      id: 'eventId',
      nome: 'ID do evento',
      sigla: 'eid',
      categoria: 'Deduplicação',
      peso: 0.5,
      presente: Boolean(c.eventId && c.eventId.trim().length >= 3),
      critico: false,
      hash: false,
      amostra: corta(c.eventId, 24),
      comoObter:
        'Qualquer identificador estável do pedido, como order_118. Evita contagem dupla se o Pixel do navegador também disparar o mesmo evento.',
    },
    {
      id: 'nome',
      nome: 'Nome do comprador',
      sigla: 'fn/ln',
      categoria: 'Dados pessoais',
      peso: 0.5,
      presente: Boolean(
        (c.firstName && c.firstName.trim().length >= 2) ||
          (c.lastName && c.lastName.trim().length >= 2)
      ),
      critico: false,
      hash: true,
      amostra: corta([c.firstName, c.lastName].filter(Boolean).join(' '), 26),
      comoObter:
        'Nome e sobrenome do checkout. São normalizados sem acentos e criptografados em SHA-256.',
    },
  ];

  const nota = parametros.reduce((s, p) => s + (p.presente ? p.peso : 0), 0);
  const percentual = Math.min(100, Math.round((nota / 10) * 100));

  let nivel: EmqNivel = 'baixo';
  let rotulo = 'Qualidade baixa';
  if (nota >= 8) {
    nivel = 'alto';
    rotulo = 'Qualidade excelente';
  } else if (nota >= 5) {
    nivel = 'medio';
    rotulo = 'Qualidade média';
  }

  return {
    parametros,
    nota,
    notaFormatada: nota.toFixed(1),
    percentual,
    nivel,
    rotulo,
    presentes: parametros.filter((p) => p.presente).length,
    total: parametros.length,
    temFbc: parametros[0].presente,
    faltando: parametros.filter((p) => !p.presente).sort((a, b) => b.peso - a.peso),
  };
}

/** Classes de cor por nível. Mantidas aqui para o painel e o modal concordarem. */
export const CORES_EMQ: Record<
  EmqNivel,
  { texto: string; borda: string; fundo: string; barra: string }
> = {
  alto: {
    texto: 'text-success',
    borda: 'border-success/40',
    fundo: 'bg-success/10',
    barra: 'bg-success',
  },
  medio: {
    texto: 'text-warning',
    borda: 'border-warning/40',
    fundo: 'bg-warning/10',
    barra: 'bg-warning',
  },
  baixo: {
    texto: 'text-danger',
    borda: 'border-danger/40',
    fundo: 'bg-danger/10',
    barra: 'bg-danger',
  },
};
