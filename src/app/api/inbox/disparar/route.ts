import { NextRequest, NextResponse } from 'next/server';
import { acharEntrada } from '@/lib/inbox';
import { parseWebhook } from '@/lib/parser';
import { lerIntegracoes, acharRegra } from '@/lib/config-store';
import { dispararItem } from '@/lib/auto-dispatch';

export const dynamic = 'force-dynamic';

/**
 * "Disparar agora": manda um item da caixa de entrada para a Meta sem passar
 * pelo formulario. Roda no servidor pelo mesmo caminho do modo automatico, para
 * que as travas (teste interno, heranca de atribuicao, dedup) sejam identicas.
 *
 * POST { id, marcas?: string[], eventoMeta?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: string; marcas?: string[]; eventoMeta?: string };
    const item = await acharEntrada(String(body.id || ''));
    if (!item) return NextResponse.json({ erro: 'Entrada não encontrada.' }, { status: 404 });

    const r = parseWebhook(JSON.stringify(item.payload));
    const cfg = await lerIntegracoes();
    const regra = r.eventoOrigem ? acharRegra(cfg, r.eventoOrigem) : undefined;
    const eventoMeta = String(body.eventoMeta || regra?.eventoMeta || r.eventName || '');
    if (!eventoMeta) {
      return NextResponse.json(
        { erro: 'Não sei qual evento da Meta usar. Informe eventoMeta.' },
        { status: 400 }
      );
    }

    const marcas: string[] = Array.isArray(body.marcas) && body.marcas.length
      ? body.marcas
      : regra?.marcas?.length
        ? regra.marcas
        : ['default'];

    const resultados = await dispararItem({ item, campos: r.fields, eventoMeta, marcas, origem: 'manual' });
    return NextResponse.json({ resultados });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
