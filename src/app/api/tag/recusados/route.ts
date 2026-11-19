import { NextRequest, NextResponse } from 'next/server';

import { lerIntegracoes } from '@/lib/config-store';
import { empresaDaRequisicao, empresaParaEscrita } from '@/lib/empresa-ativa';
import { exigirSessao } from '@/lib/sessao';
import { erroDoDominio, normalizarDominio, origemPermitida } from '@/lib/tag-dominios';
import { esquecerSiteRecusado, listarSitesRecusados } from '@/lib/tag-recusados';

export const dynamic = 'force-dynamic';

/**
 * Sites que tentaram enviar pela tag com a chave desta empresa e foram
 * recusados por nao estarem na lista dela (T-M19).
 *
 *   GET    /api/tag/recusados            -> { sites: [{ host, vezes, primeiraVez, ultimaVez }] }
 *   DELETE /api/tag/recusados  { host }  -> { ok: true }
 *
 * Rota COM sessao, como /api/tag/gerar. Nao entra na lista de rotas livres do
 * proxy.ts: quem esta de fora nao tem por que saber quais sites foram
 * recusados.
 *
 * O GET tira da resposta o site que hoje ja e permitido. Por isso "Autorizar"
 * nao precisa apagar nada: depois de salvo, o site some sozinho.
 */
export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    const empresaId = await empresaDaRequisicao(request);
    const cfg = await lerIntegracoes(empresaId);
    const base = process.env.PUBLIC_BASE_URL || '';
    const todos = await listarSitesRecusados(empresaId);
    const sites = todos.filter(
      (s) => !origemPermitida(`https://${s.host}`, cfg.tag.dominios, base)
    );
    return NextResponse.json({ sites });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json(
      { erro: 'Não foi possível ler os sites recusados.' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    exigirSessao(request);
    const empresaId = await empresaParaEscrita(request, 'ignorar');
    const corpo: unknown = await request.json().catch(() => null);
    const cru = corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>).host : '';
    const host = normalizarDominio(typeof cru === 'string' ? cru : '');
    if (!host || erroDoDominio(host) !== null) {
      return NextResponse.json({ erro: 'Diga qual site ignorar.' }, { status: 400 });
    }
    await esquecerSiteRecusado(empresaId, host);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json(
      { erro: 'Não foi possível ignorar o site. Tente de novo.' },
      { status: 400 }
    );
  }
}
