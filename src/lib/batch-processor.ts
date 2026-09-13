/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';

import { parseWebhook, ehTesteInterno } from './parser';
import { montarEvento, validar, enviarParaMeta, type MetaEvent, type EventInput } from './meta-capi';
import { calcularEmq, type ResultadoEmq } from './emq';
import { extrairAtribuicao, registrarDisparo, type Atribuicao } from './attribution-log';
import { acharMarca } from './config-store';
import { jaEnviado, marcarEnviado } from './dedup';

export interface WebhookDeliveryRaw {
  id?: string | number;
  event?: string;
  eventName?: string;
  created_at?: string;
  occurred_at?: string;
  session_token?: string;
  payload?: any;
  data?: any;
}

export interface EventoFila {
  id: string;
  rawEvent: string;
  metaEventName: 'Lead' | 'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase' | 'CompleteRegistration' | 'Subscribe' | 'Custom';
  userKey: string;
  userEmail?: string;
  userPhone?: string;
  userName?: string;
  orderId?: string;
  value?: number;
  currency: string;
  eventTime: number; // Unix seconds
  eventTimeIso: string;
  eventSourceUrl?: string;
  temFbc: boolean;
  temFbp: boolean;
  temIp: boolean;
  temUa: boolean;
  emq: ResultadoEmq;
  atribuicao: Atribuicao;
  eventInput: EventInput;
  metaEvent: MetaEvent;
  valido: boolean;
  errosValidacao: string[];
  expirado7Dias: boolean;
  status: 'pendente' | 'enviado' | 'erro' | 'ignorado';
  respostaMeta?: {
    httpStatus: number;
    eventsReceived?: number;
    fbtraceId?: string;
    erro?: string;
  };
}

export interface ResumoFila {
  totalEntregasBrutas: number;
  totalIgnoradosTestes: number;
  /** Eventos sem equivalente na Meta (abandono, estorno, chargeback...). */
  totalIgnoradosPorRegra: number;
  totalEventosFila: number;
  porEvento: Record<string, number>;
  usuariosUnicos: number;
  fila: EventoFila[];
}

function normalizarChaveUsuario(email?: string, phone?: string, cpf?: string): string {
  if (email && email.includes('@')) {
    return email.trim().toLowerCase();
  }
  if (phone) {
    const d = phone.replace(/\D+/g, '');
    if (d) return `phone_${d}`;
  }
  if (cpf) {
    const c = cpf.replace(/\D+/g, '');
    if (c) return `cpf_${c}`;
  }
  return '';
}

export function montarFilaDisparo(entregas: WebhookDeliveryRaw[]): ResumoFila {
  const agora = Math.floor(Date.now() / 1000);
  const seteDias = 7 * 24 * 3600;

  // 1. Tabela de atribuição acumulada por usuário (alimentada principalmente por precheckout_opened)
  const mapaAtribuicaoUsuario: Record<string, Record<string, any>> = {};

  // Primeiro passo: mapear todos os dados de atribuição por usuário
  for (const item of entregas) {
    try {
      const parsed = parseWebhook(typeof item === 'string' ? item : JSON.stringify(item));
      const userKey = normalizarChaveUsuario(
        parsed.fields.email as string,
        parsed.fields.phone as string,
        parsed.fields.externalId as string
      );
      if (!userKey) continue;

      if (!mapaAtribuicaoUsuario[userKey]) {
        mapaAtribuicaoUsuario[userKey] = {};
      }

      // Copiar dados não vazios para o perfil do usuário
      for (const [k, v] of Object.entries(parsed.fields)) {
        if (v && !mapaAtribuicaoUsuario[userKey][k]) {
          mapaAtribuicaoUsuario[userKey][k] = v;
        }
      }
    } catch {
      // Ignora erro de parse individual
    }
  }

  // 2. Processar e mapear cada entrega para evento Meta
  const candidatosPorChaveEvento: Record<string, EventoFila> = {};
  let totalIgnoradosTestes = 0;
  let totalIgnoradosPorRegra = 0;

  for (const item of entregas) {
    try {
      const jsonStr = typeof item === 'string' ? item : JSON.stringify(item);
      const parsed = parseWebhook(jsonStr);

      if (ehTesteInterno(parsed.fields, parsed.fields.eventId as string)) {
        totalIgnoradosTestes++;
        continue;
      }

      // A tabela do parser manda ignorar (abandono, estorno, chargeback...):
      // nao existe evento padrao da Meta para isso e enviar seria evento ficticio.
      if (parsed.ignorar) {
        totalIgnoradosPorRegra++;
        continue;
      }

      const userKey = normalizarChaveUsuario(
        parsed.fields.email as string,
        parsed.fields.phone as string,
        parsed.fields.externalId as string
      );
      if (!userKey) continue;

      // Mesclar atribuição cruzada do usuário
      const perfilUsuario = mapaAtribuicaoUsuario[userKey] || {};
      const fieldsMerged: Record<string, any> = {
        ...perfilUsuario,
        ...parsed.fields, // Campos do próprio evento têm precedência
      };

      // Garantir que campos de atribuição venham do perfil se o evento atual não tiver
      if (!fieldsMerged.fbc && perfilUsuario.fbc) fieldsMerged.fbc = perfilUsuario.fbc;
      if (!fieldsMerged.fbp && perfilUsuario.fbp) fieldsMerged.fbp = perfilUsuario.fbp;
      if (!fieldsMerged.ip && perfilUsuario.ip) fieldsMerged.ip = perfilUsuario.ip;
      if (!fieldsMerged.userAgent && perfilUsuario.userAgent) fieldsMerged.userAgent = perfilUsuario.userAgent;
      if (!fieldsMerged.sourceUrl && perfilUsuario.sourceUrl) fieldsMerged.sourceUrl = perfilUsuario.sourceUrl;

      const metaEventName = (parsed.eventName || 'Lead') as EventoFila['metaEventName'];
      const rawEvent = (item.event || item.eventName || (item.payload as any)?.event || metaEventName) as string;

      // Calcular timestamp
      let unixTime = agora;
      if (fieldsMerged.eventTime) {
        const d = new Date(fieldsMerged.eventTime);
        if (!isNaN(d.getTime())) unixTime = Math.floor(d.getTime() / 1000);
      } else if (item.created_at || item.occurred_at) {
        const d = new Date(item.created_at || item.occurred_at || '');
        if (!isNaN(d.getTime())) unixTime = Math.floor(d.getTime() / 1000);
      }

      const expirado7Dias = unixTime < agora - seteDias + 120;

      // Montar input para meta-capi
      const eventInput: EventInput = {
        event_name: metaEventName,
        event_time: unixTime,
        event_id: fieldsMerged.eventId ? String(fieldsMerged.eventId) : undefined,
        event_source_url: fieldsMerged.sourceUrl ? String(fieldsMerged.sourceUrl) : undefined,
        action_source: 'website',
        user: {
          email: fieldsMerged.email,
          phone: fieldsMerged.phone,
          addDDI: true,
          firstName: fieldsMerged.firstName,
          lastName: fieldsMerged.lastName,
          externalId: fieldsMerged.externalId,
          fbc: fieldsMerged.fbc,
          fbp: fieldsMerged.fbp,
          ip: fieldsMerged.ip,
          userAgent: fieldsMerged.userAgent,
        },
        custom: {
          value: fieldsMerged.value !== undefined ? Number(fieldsMerged.value) : undefined,
          currency: (fieldsMerged.currency as string) || 'BRL',
          orderId: fieldsMerged.orderId ? String(fieldsMerged.orderId) : undefined,
          contentName: fieldsMerged.contentName ? String(fieldsMerged.contentName) : 'Acesso Código Vencedor',
        },
      };

      const metaEvent = montarEvento(eventInput);
      const errosValidacao = validar(metaEvent);

      const emq = calcularEmq({
        email: fieldsMerged.email,
        phone: fieldsMerged.phone,
        firstName: fieldsMerged.firstName,
        lastName: fieldsMerged.lastName,
        externalId: fieldsMerged.externalId,
        fbc: fieldsMerged.fbc,
        fbp: fieldsMerged.fbp,
        ip: fieldsMerged.ip,
        userAgent: fieldsMerged.userAgent,
        sourceUrl: fieldsMerged.sourceUrl,
        eventId: fieldsMerged.eventId,
      });

      const atribuicao = extrairAtribuicao(fieldsMerged.sourceUrl || '', {
        quando: new Date(unixTime * 1000),
      });

      const eventoFila: EventoFila = {
        id: String(item.id || `ev_${userKey}_${metaEventName}_${unixTime}`),
        rawEvent,
        metaEventName,
        userKey,
        userEmail: fieldsMerged.email,
        userPhone: fieldsMerged.phone,
        userName: [fieldsMerged.firstName, fieldsMerged.lastName].filter(Boolean).join(' ') || undefined,
        orderId: fieldsMerged.orderId,
        value: fieldsMerged.value !== undefined ? Number(fieldsMerged.value) : undefined,
        currency: (fieldsMerged.currency as string) || 'BRL',
        eventTime: unixTime,
        eventTimeIso: new Date(unixTime * 1000).toISOString(),
        eventSourceUrl: fieldsMerged.sourceUrl,
        temFbc: Boolean(fieldsMerged.fbc),
        temFbp: Boolean(fieldsMerged.fbp),
        temIp: Boolean(fieldsMerged.ip),
        temUa: Boolean(fieldsMerged.userAgent),
        emq,
        atribuicao,
        eventInput,
        metaEvent,
        valido: errosValidacao.length === 0,
        errosValidacao,
        expirado7Dias,
        status: 'pendente',
      };

      // DEDUPLICAÇÃO EXATA: (userKey, metaEventName)
      // Se for o mesmo usuário para o mesmo evento Meta, mantém o melhor (maior EMQ ou mais recente)
      const chaveDeduplicacao = `${userKey}__${metaEventName}`;
      const existente = candidatosPorChaveEvento[chaveDeduplicacao];

      if (!existente) {
        candidatosPorChaveEvento[chaveDeduplicacao] = eventoFila;
      } else {
        // Se o novo tem EMQ maior ou se tem dados mais completos, substitui
        if (eventoFila.emq.nota > existente.emq.nota || (eventoFila.emq.nota === existente.emq.nota && eventoFila.eventTime > existente.eventTime)) {
          candidatosPorChaveEvento[chaveDeduplicacao] = eventoFila;
        }
      }
    } catch {
      // Ignora erro
    }
  }

  // Converter mapa de deduplicação para array e ordenar cronologicamente
  const fila = Object.values(candidatosPorChaveEvento).sort((a, b) => {
    // Ordena por timestamp
    if (a.eventTime !== b.eventTime) return a.eventTime - b.eventTime;
    // Se no mesmo segundo, ordena por ordem natural do funil
    const pesos: Record<EventoFila['metaEventName'], number> = {
      CompleteRegistration: 0, Lead: 1, InitiateCheckout: 2, AddPaymentInfo: 3, Purchase: 4, Subscribe: 5, Custom: 6,
    };
    return (pesos[a.metaEventName] || 99) - (pesos[b.metaEventName] || 99);
  });

  const porEvento: Record<string, number> = {};
  const usuariosSet = new Set<string>();

  for (const ev of fila) {
    porEvento[ev.metaEventName] = (porEvento[ev.metaEventName] || 0) + 1;
    usuariosSet.add(ev.userKey);
  }

  return {
    totalEntregasBrutas: entregas.length,
    totalIgnoradosTestes,
    totalIgnoradosPorRegra,
    totalEventosFila: fila.length,
    porEvento,
    usuariosUnicos: usuariosSet.size,
    fila,
  };
}

export async function dispararFila(params: {
  fila: EventoFila[];
  brandId?: string;
  testEventCode?: string;
  delayMs?: number;
  onProgresso?: (atual: number, total: number, evento: EventoFila) => void;
}): Promise<{
  totalDisparados: number;
  sucesso: number;
  falhas: number;
  resultados: EventoFila[];
}> {
  const marca = await acharMarca(params.brandId || 'default');
  const pixelId = (marca?.pixelId || process.env.PIXEL_ID || '').trim();
  const accessToken = (marca?.accessToken || process.env.ACCESS_TOKEN || '').trim();

  if (!pixelId || !accessToken) {
    throw new Error('Pixel ID ou Access Token ausente na configuração do servidor.');
  }

  const testCode = params.testEventCode !== undefined ? params.testEventCode : marca?.testCode;
  const delay = params.delayMs ?? 250;

  let sucesso = 0;
  let falhas = 0;
  const resultados: EventoFila[] = [];

  for (let i = 0; i < params.fila.length; i++) {
    const ev = params.fila[i];

    if (!ev.valido || ev.expirado7Dias) {
      ev.status = 'ignorado';
      resultados.push(ev);
      continue;
    }

    // O lote roda sobre um histórico inteiro de entregas: sem esta trava, um
    // evento já enviado num lote anterior seria contado de novo.
    if (await jaEnviado(pixelId, ev.metaEvent.event_name, ev.metaEvent.event_id)) {
      ev.status = 'ignorado';
      ev.respostaMeta = { httpStatus: 0, erro: 'event_id já aceito pela Meta neste pixel.' };
      resultados.push(ev);
      continue;
    }

    try {
      const r = await enviarParaMeta({
        pixelId,
        accessToken,
        testEventCode: testCode?.trim() || undefined,
        apiVersion: process.env.API_VERSION,
        evento: ev.metaEvent,
      });

      const resp = r.resposta as {
        events_received?: number;
        fbtrace_id?: string;
        error?: { message?: string };
      };

      const ok = r.httpStatus === 200 && (resp?.events_received ?? 0) > 0;
      ev.status = ok ? 'enviado' : 'erro';
      ev.respostaMeta = {
        httpStatus: r.httpStatus,
        eventsReceived: resp?.events_received,
        fbtraceId: resp?.fbtrace_id,
        erro: resp?.error?.message,
      };

      if (ok) {
        sucesso++;
        await marcarEnviado(pixelId, ev.metaEvent.event_name, ev.metaEvent.event_id);
      } else {
        falhas++;
      }

      // Registrar no log
      try {
        await registrarDisparo({
          eventName: ev.metaEvent.event_name,
          eventId: ev.metaEvent.event_id,
          eventTime: ev.metaEvent.event_time,
          value: ev.metaEvent.custom_data?.value as number | undefined,
          currency: ev.metaEvent.custom_data?.currency as string | undefined,
          orderId: ev.metaEvent.custom_data?.order_id as string | undefined,
          httpStatus: r.httpStatus,
          fbtraceId: resp?.fbtrace_id,
          eventsReceived: resp?.events_received,
          temFbc: ev.temFbc,
          temFbp: ev.temFbp,
          eventSourceUrl: ev.eventSourceUrl,
          atribuicao: ev.atribuicao,
          pixelId,
          // P-12: `acharMarca` cai no primeiro cadastro quando o id nao existe, e a
          // lista sempre tem o 'default' vindo do .env — o `??` e a mesma coisa dita no
          // tipo: o log NAO aceita disparo sem dono. Gravar `undefined` aqui deixaria o
          // historico com uma linha que nao se liga a Pixel nenhum.
          marcaId: marca?.id ?? 'default',
        });
      } catch (logErr) {
        console.error('Erro ao gravar log do disparo:', logErr);
      }

      resultados.push(ev);
      params.onProgresso?.(i + 1, params.fila.length, ev);

      // Delay para rate limit
      if (i < params.fila.length - 1 && delay > 0) {
        await new Promise((res) => setTimeout(res, delay));
      }
    } catch (err) {
      falhas++;
      ev.status = 'erro';
      ev.respostaMeta = {
        httpStatus: 500,
        erro: err instanceof Error ? err.message : String(err),
      };
      resultados.push(ev);
    }
  }

  return {
    totalDisparados: sucesso + falhas,
    sucesso,
    falhas,
    resultados,
  };
}
