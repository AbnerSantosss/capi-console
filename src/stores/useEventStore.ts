import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EventFields } from '@/lib/event-schema';
import { validarEvento, type ErroCampo } from '@/lib/event-schema';

/**
 * Fonte unica de verdade dos campos do evento.
 *
 * Tres componentes irmaos leem os mesmos valores — painel de qualidade, barra
 * de disparo e o importador de JSON, que escreve neles. Por isso o estado vive
 * aqui e nao num form state paralelo. A validacao roda por cima, com zod
 * (src/lib/event-schema.ts), no blur de cada campo e no submit.
 *
 * `persist` cobre a regra de rascunho: recarregar a pagina nao perde o que foi
 * digitado. Erros e campos tocados nao sao persistidos.
 */

export function agoraLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const INICIAL: EventFields = {
  eventName: 'Purchase',
  customEventName: '',
  eventTime: '',
  eventId: '',
  orderId: '',
  contentName: '',
  value: '',
  currency: 'BRL',
  sourceUrl: '',
  email: '',
  phone: '',
  addDDI: true,
  firstName: '',
  lastName: '',
  externalId: '',
  fbc: '',
  fbp: '',
  ip: '',
  userAgent: '',
};

interface EventState extends EventFields {
  jsonPayload: string;
  /** Campos que ja perderam o foco — so eles mostram erro. */
  tocados: Record<string, boolean>;
  /** true depois de uma tentativa de disparo: revela todos os erros. */
  submetido: boolean;

  setField: <K extends keyof EventFields>(k: K, v: EventFields[K]) => void;
  setMultiple: (f: Partial<EventFields>) => void;
  /**
   * Substitui o evento inteiro pelo que veio de um payload.
   * Zera antes de aplicar: campo que o parser nao achou tem que ficar VAZIO,
   * nunca herdar o valor do payload anterior.
   */
  carregarDoParser: (f: Partial<EventFields>, eventName?: string) => void;
  setJsonPayload: (p: string) => void;
  tocar: (campo: string) => void;
  marcarSubmetido: (v: boolean) => void;
  reset: () => void;
  /** Todos os erros, independentemente de o campo ter sido tocado. */
  erros: () => ErroCampo[];
  /** So os erros que devem aparecer agora na tela. */
  errosVisiveis: () => Record<string, string>;
  camposEvento: () => EventFields;
}

export const useEventStore = create<EventState>()(
  persist(
    (set, get) => ({
      ...INICIAL,
      jsonPayload: '',
      tocados: {},
      submetido: false,

      setField: (k, v) =>
        set((s) => ({
          [k]: v,
          // digitar de novo num campo com erro limpa o estado de "submetido"
          // so daquele campo, para o erro sumir assim que for corrigido
          tocados: s.tocados,
        }) as Partial<EventState>),

      setMultiple: (f) => set(f as Partial<EventState>),

      carregarDoParser: (f, eventName) =>
        set({
          ...INICIAL,
          ...(eventName ? { eventName } : {}),
          ...f,
          jsonPayload: get().jsonPayload,
          tocados: {},
          submetido: false,
        } as Partial<EventState>),
      setJsonPayload: (p) => set({ jsonPayload: p }),
      tocar: (campo) =>
        set((s) => ({ tocados: { ...s.tocados, [campo]: true } })),
      marcarSubmetido: (v) => set({ submetido: v }),

      reset: () =>
        set({
          ...INICIAL,
          eventTime: agoraLocal(),
          jsonPayload: '',
          tocados: {},
          submetido: false,
        }),

      camposEvento: () => {
        const s = get();
        return {
          eventName: s.eventName,
          customEventName: s.customEventName,
          eventTime: s.eventTime,
          eventId: s.eventId,
          orderId: s.orderId,
          contentName: s.contentName,
          value: s.value,
          currency: s.currency,
          sourceUrl: s.sourceUrl,
          email: s.email,
          phone: s.phone,
          addDDI: s.addDDI,
          firstName: s.firstName,
          lastName: s.lastName,
          externalId: s.externalId,
          fbc: s.fbc,
          fbp: s.fbp,
          ip: s.ip,
          userAgent: s.userAgent,
        };
      },

      erros: () => validarEvento(get().camposEvento()),

      errosVisiveis: () => {
        const { tocados, submetido } = get();
        const saida: Record<string, string> = {};
        for (const e of validarEvento(get().camposEvento())) {
          if (submetido || tocados[e.campo]) saida[e.campo] = e.mensagem;
        }
        return saida;
      },
    }),
    {
      name: 'capi_rascunho_v3',
      // rascunho persistido: valores sim, estado de validacao nao
      partialize: (s) =>
        Object.fromEntries(
          Object.entries(s).filter(
            ([k]) =>
              k in INICIAL || k === 'jsonPayload'
          )
        ) as Partial<EventState>,
    }
  )
);
