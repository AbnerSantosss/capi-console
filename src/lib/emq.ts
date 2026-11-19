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
import { jaEhSha256 } from './hash-detect';

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
  /** Se vai transformado em hash SHA-256 antes de sair. */
  hash: boolean;
  /**
   * So existe quando `hash` e true (T-M36): o valor que chegou JA e um
   * SHA-256, e vai como esta. `false` = chegou em claro (ou nao chegou).
   */
  jaEmHash?: boolean;
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

/** true quando ha ao menos um valor preenchido e TODOS os preenchidos ja sao SHA-256. */
const todosEmHash = (...valores: (string | undefined)[]): boolean => {
  const preenchidos = valores.filter((v): v is string => Boolean(v && v.trim()));
  return preenchidos.length > 0 && preenchidos.every((v) => jaEhSha256(v));
};

/** O que o selo do hash mostra na tabela de qualidade (T-M36). */
export interface SeloDoHash {
  /** O texto curto, sempre visivel. */
  texto: string;
  /** A frase inteira, para quem passa o mouse. */
  explicacao: string;
}

/**
 * O selo diz o caso que o console viu, e nao so "SHA-256":
 *  - o dado nao veio          -> "SHA-256" (e a regra geral do campo);
 *  - veio ja em hash          -> "já em SHA-256" (vai como esta);
 *  - veio em claro            -> "SHA-256 no envio" (o servidor faz o hash).
 * `null` para o parametro que nao vai em hash (fbc, fbp, ip...).
 */
export function seloDoHash(
  p: Pick<ParametroEmq, 'hash' | 'presente' | 'jaEmHash'>
): SeloDoHash | null {
  if (!p.hash) return null;
  if (!p.presente) {
    return { texto: 'SHA-256', explicacao: 'Quando este dado vier, ele vai à Meta em hash SHA-256.' };
  }
  if (p.jaEmHash) {
    return {
      texto: 'já em SHA-256',
      explicacao: 'Chegou já em hash SHA-256. Vai como está, sem hash de novo.',
    };
  }
  return {
    texto: 'SHA-256 no envio',
    explicacao: 'Chegou em claro. O servidor transforma em hash SHA-256 antes de enviar à Meta.',
  };
}

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
      // T-M36: e-mail que ja chega em SHA-256 nao tem "@", mas a Meta o recebe.
      presente: Boolean(c.email && (c.email.includes('@') || jaEhSha256(c.email))),
      critico: true,
      hash: true,
      jaEmHash: todosEmHash(c.email),
      amostra: corta(c.email, 26),
      comoObter:
        'Vem do checkout ou do CRM. É normalizado em minúsculas e transformado em hash SHA-256 antes do envio.',
    },
    {
      id: 'phone',
      nome: 'Telefone',
      sigla: 'ph',
      categoria: 'Correspondência principal',
      peso: 1.5,
      // T-M36: telefone ja em SHA-256 vale como presente, tenha quantos digitos tiver.
      presente: Boolean(
        c.phone && (jaEhSha256(c.phone) || c.phone.replace(/\D/g, '').length >= 10)
      ),
      critico: false,
      hash: true,
      jaEmHash: todosEmHash(c.phone),
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
        'IP público do comprador no momento da compra. Vai como está, sem hash, por exigência da Meta. IP de proxy ou de rede interna não serve.',
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
        'Qualquer identificador estável do pedido, como order_118. Evita contagem dupla se o Pixel do navegador também enviar o mesmo evento.',
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
      // T-M36: so e "ja em hash" quando nome E sobrenome preenchidos sao hash.
      jaEmHash: todosEmHash(c.firstName, c.lastName),
      amostra: corta([c.firstName, c.lastName].filter(Boolean).join(' '), 26),
      comoObter:
        'Nome e sobrenome do checkout. São normalizados sem acentos e transformados em hash SHA-256.',
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
