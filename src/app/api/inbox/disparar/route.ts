import { NextRequest, NextResponse } from 'next/server';
import { acharEntrada } from '@/lib/inbox';
import { parseWebhook } from '@/lib/parser';
import { lerIntegracoes, acharRegra } from '@/lib/config-store';
import { dispararItem } from '@/lib/auto-dispatch';
import { exigirSessao } from '@/lib/sessao';
import { ehNomePadraoMeta } from '@/lib/meta-events';

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
    exigirSessao(request);
    const body = (await request.json()) as { id?: string; marcas?: string[]; eventoMeta?: string };
    const item = await acharEntrada(String(body.id || ''));
    if (!item) return NextResponse.json({ erro: 'Entrada não encontrada.' }, { status: 404 });

    const r = parseWebhook(JSON.stringify(item.payload));
    const cfg = await lerIntegracoes();
    const regra = r.eventoOrigem ? acharRegra(cfg, r.eventoOrigem) : undefined;
    // Trava 1: regra em Ignorar nao dispara nem por clique. A tela ja esconde o
    // botao; isto fecha a porta para requisicao repetida, aba velha e curl.
    if (regra?.modo === 'ignorar') {
      return NextResponse.json(
        {
          erro:
            'Esta regra está em Ignorar: o evento não vai para a Meta. Mude o modo na aba Regras se quiser enviá-lo.',
        },
        { status: 409 }
      );
    }

    // `r.eventName` so existe para nome mapeado; NUNCA cair no nome de origem:
    // "ping" viraria um evento personalizado na Meta com HTTP 200 e ninguem veria.
    const eventoMeta = String(body.eventoMeta || regra?.eventoMeta || r.eventName || '');
    if (!eventoMeta) {
      return NextResponse.json(
        { erro: 'Não sei qual evento da Meta usar. Informe eventoMeta.' },
        { status: 400 }
      );
    }

    // Trava 2: so nome padrao da Meta, com a caixa exata. Qualquer outra string
    // e aceita com 200 e vira evento personalizado que nao otimiza campanha.
    if (!ehNomePadraoMeta(eventoMeta)) {
      return NextResponse.json(
        {
          erro: `"${eventoMeta}" não é um evento padrão da Meta. Escolha um evento padrão na aba Regras — nomes fora do padrão viram evento personalizado e não otimizam campanha.`,
        },
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
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
