import { z } from 'zod';

import { jaEhSha256 } from './hash-detect';

/**
 * Schema unico do evento, compartilhado pelo cliente e por /api/enviar.
 *
 * Os campos chegam como string porque vem direto dos inputs. A validacao de
 * negocio pesada (janela de 7 dias, Purchase exige valor) fica no `superRefine`
 * para que a mensagem possa apontar o campo certo.
 *
 * Observacao de arquitetura: a fonte de verdade dos valores continua sendo o
 * Zustand (useEventStore), porque tres componentes irmaos leem os mesmos campos
 * — painel de qualidade, barra de disparo e o importador de JSON, que escreve
 * neles. Um form state paralelo criaria duas fontes de verdade. A validacao
 * roda sobre o store atraves de `validarEvento`.
 */

const JANELA_DIAS = 7;
const TOLERANCIA_FUTURO_MIN = 10;
/** A Meta rejeita no limite exato; deixamos 2 min de folga. */
const FOLGA_SEG = 120;

export const opcional = (s: z.ZodString) => s.optional().or(z.literal(''));

export const eventFieldsSchema = z.object({
  eventName: z.string().min(1, 'Escolha o evento.'),
  customEventName: z.string().optional(),

  eventTime: z.string().min(1, 'Informe quando o evento aconteceu.'),
  eventId: z.string().optional(),
  orderId: z.string().optional(),
  contentName: z.string().optional(),

  value: z.string().optional(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/, 'Use o código de 3 letras. Ex.: BRL')
    .optional()
    .or(z.literal('')),

  sourceUrl: z
    .string()
    .url('URL inválida. Comece com https://')
    .optional()
    .or(z.literal('')),

  // Aceita e-mail valido OU um SHA-256 de 64 hex ja pronto (formato que a
  // propria Meta documenta). Sem isto, colar um payload ja hasheado era
  // barrado aqui com uma mensagem que nao dizia o que realmente aconteceu.
  email: z
    .string()
    .refine((v) => !v || z.string().email().safeParse(v).success || jaEhSha256(v), {
      message: 'Informe um e-mail válido ou um hash SHA-256 de 64 caracteres.',
    })
    .optional()
    .or(z.literal('')),

  phone: z
    .string()
    .refine((v) => !v || v.replace(/\D/g, '').length >= 10, {
      message: 'Telefone incompleto. Informe DDD + número.',
    })
    .optional()
    .or(z.literal('')),

  addDDI: z.boolean(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),

  externalId: z.string().optional(),

  fbc: z
    .string()
    .regex(
      /^fb\.\d+\.\d+\..+$/,
      'Formato esperado: fb.1.<timestamp>.<fbclid>'
    )
    .optional()
    .or(z.literal('')),

  fbp: z
    .string()
    .regex(
      /^fb\.\d+\.\d+\.\d+$/,
      'Formato esperado: fb.1.<timestamp>.<número>'
    )
    .optional()
    .or(z.literal('')),

  ip: z
    .string()
    .refine(
      (v) =>
        !v ||
        /^(\d{1,3}\.){3}\d{1,3}$/.test(v.trim()) ||
        v.includes(':'),
      { message: 'Informe um IPv4 ou IPv6 válido.' }
    )
    .optional()
    .or(z.literal('')),

  userAgent: z.string().optional(),
});

export type EventFields = z.infer<typeof eventFieldsSchema>;

/** Converte "2026-09-03T14:22:00" (hora local) em Date. */
export function lerEventTime(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface ErroCampo {
  campo: string;
  mensagem: string;
}

/**
 * Valida o evento inteiro. Devolve os erros por campo, na ordem em que os
 * campos aparecem no formulario — a barra de resumo depende dessa ordem.
 */
export function validarEvento(campos: EventFields): ErroCampo[] {
  const erros: ErroCampo[] = [];

  const r = eventFieldsSchema.safeParse(campos);
  if (!r.success) {
    for (const issue of r.error.issues) {
      const campo = String(issue.path[0] ?? '');
      if (campo && !erros.some((e) => e.campo === campo)) {
        erros.push({ campo, mensagem: issue.message });
      }
    }
  }

  // --- regras de negocio da Meta ---------------------------------------

  if (campos.eventName === 'Custom' && !campos.customEventName?.trim()) {
    erros.push({
      campo: 'customEventName',
      mensagem: 'Informe o nome do evento personalizado.',
    });
  }

  const quando = lerEventTime(campos.eventTime);
  if (campos.eventTime && !quando) {
    if (!erros.some((e) => e.campo === 'eventTime')) {
      erros.push({ campo: 'eventTime', mensagem: 'Data ou hora inválida.' });
    }
  } else if (quando) {
    const agora = Date.now();
    const limitePassado = agora - JANELA_DIAS * 86400_000 + FOLGA_SEG * 1000;
    const limiteFuturo = agora + TOLERANCIA_FUTURO_MIN * 60_000;

    if (quando.getTime() < limitePassado) {
      erros.push({
        campo: 'eventTime',
        mensagem: `A Meta rejeita eventos com mais de ${JANELA_DIAS} dias.`,
      });
    } else if (quando.getTime() > limiteFuturo) {
      erros.push({
        campo: 'eventTime',
        mensagem: 'A data está no futuro.',
      });
    }
  }

  if (campos.eventName === 'Purchase') {
    const v = Number(campos.value);
    if (!campos.value || Number.isNaN(v) || v <= 0) {
      erros.push({
        campo: 'value',
        mensagem: 'Purchase exige um valor maior que zero.',
      });
    }
    if (!campos.currency?.trim()) {
      erros.push({ campo: 'currency', mensagem: 'Purchase exige a moeda.' });
    }
  }

  const temAlgumDadoDoCliente = [
    campos.email,
    campos.phone,
    campos.firstName,
    campos.lastName,
    campos.externalId,
    campos.fbc,
    campos.fbp,
    campos.ip,
    campos.userAgent,
  ].some((v) => v && v.trim());

  if (!temAlgumDadoDoCliente) {
    erros.push({
      campo: 'email',
      mensagem:
        'Informe pelo menos um dado do cliente. Sem isso a Meta não consegue corresponder o evento.',
    });
  }

  return erros;
}

/** Quanto ainda resta da janela de 7 dias para este evento. */
export function janelaRestante(eventTime: string): {
  expirado: boolean;
  texto: string;
} | null {
  const d = lerEventTime(eventTime);
  if (!d) return null;
  const limite = d.getTime() + JANELA_DIAS * 86400_000;
  const resta = limite - Date.now();
  if (resta <= 0) return { expirado: true, texto: 'Fora da janela de 7 dias' };
  const dias = Math.floor(resta / 86400_000);
  const horas = Math.floor((resta % 86400_000) / 3600_000);
  return {
    expirado: false,
    texto: dias > 0 ? `Restam ${dias}d ${horas}h` : `Restam ${horas}h`,
  };
}
