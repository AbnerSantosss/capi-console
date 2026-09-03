import 'server-only';

import { NextRequest, NextResponse, after } from 'next/server';
import { lerIntegracoes, segredoConfere, acharRegra } from '@/lib/config-store';
import { registrarEntrada, mascararEmail } from '@/lib/inbox';
import { parseWebhook } from '@/lib/parser';
import { calcularEmq } from '@/lib/emq';
import { transmitir } from '@/lib/relay';
import { guardarPerfil } from '@/lib/perfil-atribuicao';
import { dispararItem } from '@/lib/auto-dispatch';

/**
 * Handler único do recebimento de webhook, usado por duas rotas:
 *
 *   POST /api/webhook/in            -> segredo no header X-CAPI-Secret
 *   POST /api/webhook/in/<segredo>  -> segredo no caminho da URL
 *
 * A segunda existe porque o backoffice do xWinner só oferece o campo
 * "URL (https)" ao cadastrar um endpoint de saída — não há onde colocar um
 * header customizado. É o mesmo formato que a própria plataforma já usa em
 * outras integrações (`/api/webhook/auto-xxxxxx`) e o padrão de Slack e
 * Discord: o segredo é o caminho.
 *
 * O segredo NÃO vai em query string de propósito: query string vaza em
 * `Referer`, em log de proxy e em histórico com muito mais facilidade que o
 * caminho, e alguns gateways registram a query inteira em texto claro.
 */
export async function processarWebhook(
  request: NextRequest,
  segredoDaUrl?: string
) {
  const cfg = await lerIntegracoes();

  const enviado = segredoDaUrl ?? request.headers.get('x-capi-secret') ?? '';
  if (!segredoConfere(enviado, cfg.entrada.segredo)) {
    return NextResponse.json(
      {
        erro: segredoDaUrl
          ? 'Segredo inválido no caminho da URL.'
          : 'Segredo inválido ou ausente no header X-CAPI-Secret.',
      },
      { status: 401 }
    );
  }

  // Um corpo gigante não pode consumir a memória do container.
  const tamanho = Number(request.headers.get('content-length') || 0);
  if (tamanho > 1_000_000) {
    return NextResponse.json({ erro: 'Payload acima de 1 MB.' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { erro: 'O corpo não é um JSON válido.' },
      { status: 400 }
    );
  }

  // O parser nunca pode derrubar o recebimento: se falhar, guardamos cru.
  let campos: Record<string, string | boolean> = {};
  let evento: string | undefined;
  let eventoOrigem: string | undefined;
  let conhecido = false;
  let ignorarPeloParser = false;
  try {
    const r = parseWebhook(JSON.stringify(payload));
    campos = r.fields;
    evento = r.eventName;
    eventoOrigem = r.eventoOrigem;
    conhecido = r.eventoConhecido;
    ignorarPeloParser = r.ignorar;
  } catch {
    /* segue com o payload cru */
  }

  const texto = (k: string) =>
    typeof campos[k] === 'string' ? (campos[k] as string) : undefined;

  const emq = calcularEmq({
    email: texto('email'),
    phone: texto('phone'),
    firstName: texto('firstName'),
    lastName: texto('lastName'),
    externalId: texto('externalId'),
    fbc: texto('fbc'),
    fbp: texto('fbp'),
    ip: texto('ip'),
    userAgent: texto('userAgent'),
    sourceUrl: texto('sourceUrl'),
    eventId: texto('eventId'),
  });

  // Nome original do evento na plataforma, para aparecer na caixa de entrada
  // mesmo quando o parser não souber mapear (ex.: subscription_started).
  const bruto = payload as Record<string, unknown> | null;
  const nomeOriginal =
    eventoOrigem ?? (typeof bruto?.event === 'string' ? (bruto.event as string) : undefined);

  // A regra decide evento da Meta, pixels e modo. Sem regra: o que o parser
  // disser — e se ele mandou ignorar, ignoramos (abandono não é conversão).
  const regra = nomeOriginal ? acharRegra(cfg, nomeOriginal) : undefined;
  const modo: 'auto' | 'fila' | 'ignorar' = regra
    ? regra.modo
    : ignorarPeloParser
      ? 'ignorar'
      : 'fila';
  const eventoFinal =
    regra && regra.modo !== 'ignorar' && regra.eventoMeta ? regra.eventoMeta : evento;
  const marcas = regra?.marcas?.length ? regra.marcas : ['default'];

  // Qualquer evento que traga fbc/fbp/ip/ua alimenta o perfil do comprador.
  // É isso que salva o Purchase do PIX, que chega sem atribuição nenhuma.
  await guardarPerfil(campos).catch(() => {});

  const item = await registrarEntrada({
    origem: request.headers.get('user-agent') ?? 'desconhecida',
    evento: eventoFinal ?? nomeOriginal,
    eventoOrigem: nomeOriginal,
    eventoMeta: eventoFinal,
    regraId: regra?.id,
    modo,
    conhecido,
    valor: texto('value') ? Number(texto('value')) : undefined,
    moeda: texto('currency'),
    emailMascarado: mascararEmail(texto('email')),
    orderId: texto('orderId'),
    temFbc: Boolean(texto('fbc')),
    temFbp: Boolean(texto('fbp')),
    emq: emq.nota,
    payload,
    status: modo === 'ignorar' ? 'ignorado' : 'novo',
  });

  // O relay não pode fazer o remetente receber erro.
  void transmitir('inbox.received', {
    entrada: {
      id: item.id,
      evento: item.evento,
      eventoOrigem: nomeOriginal,
      modo,
      valor: item.valor,
      moeda: item.moeda,
      orderId: item.orderId,
      emq: item.emq,
    },
  }).catch(() => {});

  // A plataforma espera resposta rápida e tenta de novo se demorar. O disparo
  // roda depois da resposta, com after(), para o 202 sair em menos de 1 s.
  if (modo === 'auto' && eventoFinal) {
    after(async () => {
      try {
        await dispararItem({ item, campos, eventoMeta: eventoFinal, marcas, origem: 'auto' });
      } catch (e) {
        console.error('[webhook] auto-dispatch falhou:', e);
      }
    });
  }

  return NextResponse.json(
    {
      ok: true,
      id: item.id,
      eventoOrigem: nomeOriginal,
      eventoMeta: eventoFinal ?? null,
      modo,
      regra: regra?.id ?? null,
      emq: emq.nota,
    },
    { status: 202 }
  );
}
