/**
 * Moeda: o que entra de fora e o que vai para a tela.
 *
 * Módulo NEUTRO de propósito — sem `import 'server-only'` —, como
 * `deteccao-de-teste.ts`: o servidor normaliza na chegada do webhook e a tela
 * formata com a MESMA régua. Antes cada tela chamava `Intl.NumberFormat` por
 * conta própria com o que estivesse gravado, e um único evento com
 * `"currency": "R$"` (Globaltech, 06/10/2026) lançava `RangeError: Invalid
 * currency code` e derrubava a página inteira — sem botão para sair, porque o
 * item fica gravado.
 *
 * 🔴 Regra de ouro: **nada aqui lança**. A normalização roda no caminho de
 * recebimento do webhook, e a formatação roda dentro do render.
 *
 * 🔴 Moeda que o console não reconhece NÃO vira BRL por palpite. Mandar à Meta
 * um valor na moeda errada é pior do que não mandar: ela otimiza a campanha em
 * cima de um faturamento que não existe. O item fica na fila, sem automático,
 * com o texto original à vista.
 */

/** A moeda de quem não mandou moeda nenhuma. É o comportamento de sempre (xWinner). */
export const MOEDA_PADRAO = 'BRL';

/**
 * Símbolos e nomes que só têm UMA leitura possível. `$` sozinho fica de fora
 * de propósito: é dólar americano, peso argentino, peso uruguaio, peso
 * mexicano… e a origem que mandou `$` é quem sabe qual.
 */
const SINONIMOS: Record<string, string> = {
  'R$': 'BRL',
  REAL: 'BRL',
  REAIS: 'BRL',
  'US$': 'USD',
  'U$S': 'USD',
  'U$': 'USD',
  '€': 'EUR',
  EURO: 'EUR',
  EUROS: 'EUR',
  '£': 'GBP',
};

let codigosConhecidos: ReadonlySet<string> | null | undefined;

/** Lista ISO 4217 do próprio runtime. `null` quando o runtime é antigo demais para ter a lista. */
function listaIso(): ReadonlySet<string> | null {
  if (codigosConhecidos !== undefined) return codigosConhecidos;
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    codigosConhecidos = supported ? new Set(supported('currency')) : null;
  } catch {
    codigosConhecidos = null;
  }
  return codigosConhecidos;
}

/** Três letras maiúsculas E moeda que existe. `XYZ` tem a forma certa e não é moeda de ninguém. */
export function ehCodigoDeMoeda(codigo: string): boolean {
  if (!/^[A-Z]{3}$/.test(codigo)) return false;
  const lista = listaIso();
  return lista ? lista.has(codigo) : true;
}

export interface MoedaNormalizada {
  /** Código ISO 4217, ou `null` quando o texto não foi reconhecido. */
  codigo: string | null;
  /** O que veio, só aparado. Vazio quando não veio nada. */
  original: string;
  /** `true` = não veio moeda nenhuma (o código é o padrão, `BRL`). */
  ausente: boolean;
  /** `true` = há um código ISO confiável em `codigo`. */
  reconhecida: boolean;
  /** `true` = o código saiu de um símbolo ou nome (`R$` → `BRL`), não veio pronto. */
  convertida: boolean;
}

/**
 * Lê a moeda como a origem mandou e devolve o código ISO 4217.
 *
 * - ausente (`''`, `null`, `undefined`) → `BRL`, como sempre foi;
 * - `brl`, ` BRL ` → `BRL`;
 * - `R$` → `BRL`, `US$` → `USD`, `€` → `EUR`;
 * - `$`, `XYZ`, `pesos`, número, objeto → não reconhecida (`codigo: null`).
 */
export function normalizarMoeda(bruto: unknown): MoedaNormalizada {
  if (bruto === null || bruto === undefined) {
    return { codigo: MOEDA_PADRAO, original: '', ausente: true, reconhecida: true, convertida: false };
  }
  if (typeof bruto !== 'string') {
    let original = '';
    try {
      original = String(bruto).slice(0, 24);
    } catch {
      /* objeto sem toString */
    }
    return { codigo: null, original, ausente: false, reconhecida: false, convertida: false };
  }
  const original = bruto.trim().slice(0, 24);
  if (!original) {
    return { codigo: MOEDA_PADRAO, original: '', ausente: true, reconhecida: true, convertida: false };
  }
  const chave = original.toUpperCase().replace(/\s+/g, '');
  if (ehCodigoDeMoeda(chave)) {
    return { codigo: chave, original, ausente: false, reconhecida: true, convertida: false };
  }
  const sinonimo = SINONIMOS[chave];
  if (sinonimo) {
    return { codigo: sinonimo, original, ausente: false, reconhecida: true, convertida: true };
  }
  return { codigo: null, original, ausente: false, reconhecida: false, convertida: false };
}

function numeroPtBr(valor: number, casas: number): string {
  try {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  } catch {
    return valor.toFixed(casas).replace('.', ',');
  }
}

/**
 * Dinheiro para a tela. O ÚNICO lugar do console que chama o `Intl` com
 * `style: 'currency'`.
 *
 * Moeda reconhecida → `R$ 10,00`. Moeda não reconhecida → o número em pt-BR
 * com o texto original do lado (`10,00 XYZ`), para o operador ver o que chegou.
 * Valor ausente ou não numérico → `—`.
 */
export function formatarDinheiro(
  valor: number | null | undefined,
  moeda?: string | null,
  opcoes?: { semCentavosQuandoInteiro?: boolean }
): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
  const casas = opcoes?.semCentavosQuandoInteiro && Number.isInteger(valor) ? 0 : 2;
  const m = normalizarMoeda(moeda);
  if (m.codigo) {
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: m.codigo,
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      }).format(valor);
    } catch {
      /* cai no texto cru abaixo */
    }
  }
  const rotulo = m.original || m.codigo || '';
  return rotulo ? `${numeroPtBr(valor, casas)} ${rotulo}` : numeroPtBr(valor, casas);
}
