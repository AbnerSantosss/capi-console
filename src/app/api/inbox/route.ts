import { NextRequest, NextResponse } from 'next/server';
import {
  listarEntradas,
  acharEntrada,
  marcarStatus,
  limparEntradas,
  type ItemInbox,
  type StatusEntrada,
} from '@/lib/inbox';
import { EMPRESA_DEFAULT_ID } from '@/lib/config-store';
import { empresaDaRequisicao } from '@/lib/empresa-ativa';
import { exigirSessao } from '@/lib/sessao';
import { erroDeRota, respostaErro } from '@/lib/erro-api';
import { parseWebhook } from '@/lib/parser';

export const dynamic = 'force-dynamic';

/**
 * B-11 (§14.8.2) — os três handlers deste arquivo dependiam SÓ do matcher do
 * proxy (`proxy.ts:90`). Hoje o matcher cobre, mas é uma linha de defesa só: se
 * alguém acrescentar uma exclusão a ele, o DELETE abaixo — que apaga
 * `inbox.jsonl` e `inbox-resultados.jsonl` inteiros — fica aberto na internet,
 * e o GET/PATCH passam a expor `payload` cru, que é PII de compradores.
 *
 * `exigirSessao()` aqui é defesa em profundidade: soma uma camada, não
 * substitui o proxy. Custa uma linha por handler.
 */

/**
 * O item e desta empresa?
 *
 * Item gravado antes da FASE E nao tem o campo e pertence a `default` (E-3:
 * campo novo e opcional na leitura e tem valor derivado quando falta).
 */
function daEmpresa(item: ItemInbox | undefined, empresaId: string): boolean {
  return item !== undefined && (item.empresaId ?? EMPRESA_DEFAULT_ID) === empresaId;
}

/**
 * O item com o `eventId` que vai (ou foi) para a Meta.
 *
 * `ItemInbox` não guarda o campo: o `event_id` do disparo sai do `payload` pela
 * MESMA chamada que o disparo usa (`parseWebhook`, ver `inbox/disparar`) — o id
 * canônico da plataforma ou `order_<pedido>`. Derivar aqui vale também para
 * item antigo e não toca no log gravado.
 *
 * `emailHash` continua fora: o item já chega sem ele (`paraTela`, C7) e o
 * espalhamento só ACRESCENTA `eventId`. Payload ilegível devolve o item como
 * está, sem `eventId` — nunca um id inventado.
 */
function comEventId(item: ItemInbox): ItemInbox & { eventId?: string } {
  try {
    const id = parseWebhook(JSON.stringify(item.payload ?? null)).fields.eventId;
    return typeof id === 'string' && id !== '' ? { ...item, eventId: id } : item;
  } catch {
    return item;
  }
}

/** `?limite=` clampado em 1..1000 (teto = LIMITE_MEMORIA de inbox.ts). Ausente ou lixo → 50, o de sempre. */
const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 1000;
function limiteDaConsulta(bruto: string | null): number {
  const n = Number.parseInt(bruto ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return LIMITE_PADRAO;
  return Math.min(n, LIMITE_MAXIMO);
}

export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    const empresaId = await empresaDaRequisicao(request);
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      const item = await acharEntrada(id);
      // 404, nunca 403: 403 confirmaria que o id existe em OUTRA empresa. A
      // resposta de item alheio e byte a byte a de item inexistente.
      if (!item || !daEmpresa(item, empresaId)) {
        return respostaErro('Entrada não encontrada.', 404);
      }
      return NextResponse.json({ item: comEventId(item) });
    }
    const limite = limiteDaConsulta(new URL(request.url).searchParams.get('limite'));
    const itens = await listarEntradas(limite, empresaId);
    return NextResponse.json({ itens: itens.map(comEventId) });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível ler a Fila.');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    exigirSessao(request);
    const empresaId = await empresaDaRequisicao(request);
    const body = await request.json();
    // Confere a dona ANTES de escrever: sem isto um id vazado mudaria o status
    // de um item de outro cliente. 404 pelo mesmo motivo do GET.
    if (!daEmpresa(await acharEntrada(String(body.id)), empresaId)) {
      return respostaErro('Entrada não encontrada.', 404);
    }
    const status = String(body.status) as StatusEntrada;
    const item = await marcarStatus(String(body.id), status);
    return NextResponse.json({ item });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível atualizar a entrada — nada foi alterado.');
  }
}

/**
 * Apaga a caixa de entrada DA EMPRESA ATIVA — as linhas dela em
 * `logs/inbox.jsonl` e `logs/inbox-resultados.jsonl`. É destrutivo e
 * irreversível — não há backup desses dois arquivos.
 *
 * O escopo por empresa é o que impede que "limpar a caixa" de um cliente leve
 * junto o histórico de todos os outros. Para a `default` ele inclui as linhas
 * antigas, gravadas antes da FASE E e sem o campo `empresaId`.
 *
 * ⚠️ A assinatura mudou: antes era `DELETE()`, sem o parâmetro `request`, e por
 * isso não tinha como checar sessão nenhuma (§1.7.2).
 *
 * B11-b — confirmação NO SERVIDOR: o corpo precisa trazer `{ "confirmar": true }`.
 * Um DELETE que apaga tudo não pode ser acionável por um clique perdido, por
 * uma aba velha repetindo a requisição, nem por um `curl` de teste.
 */
export async function DELETE(request: NextRequest) {
  try {
    exigirSessao(request);
    const empresaId = await empresaDaRequisicao(request);

    // Corpo ausente ou ilegível NÃO é erro de JSON aqui: é falta de confirmação.
    const corpo: unknown = await request.json().catch(() => null);
    const confirmado =
      typeof corpo === 'object' && corpo !== null && (corpo as { confirmar?: unknown }).confirmar === true;

    if (!confirmado) {
      return respostaErro(
        'Apagar a Fila é irreversível. Confirme a operação para continuar — nada foi apagado.',
        400
      );
    }

    await limparEntradas(empresaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível limpar a Fila — nada foi apagado.');
  }
}
