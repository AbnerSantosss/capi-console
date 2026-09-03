import { NextRequest, NextResponse } from 'next/server';
import { lerIntegracoes } from '@/lib/config-store';
import { enviarRelay, listarEntregas } from '@/lib/relay';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ entregas: await listarEntregas(50) });
}

/** Testa um destino enviando um ping. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const cfg = await lerIntegracoes();
  const destino = cfg.saida.find((d) => d.id === body.destinoId);

  if (!destino) {
    return NextResponse.json({ erro: 'Destino não encontrado.' }, { status: 404 });
  }

  const entrega = await enviarRelay(destino, 'teste', {
    teste: true,
    mensagem: 'Ping do Meta CAPI Console.',
  });

  return NextResponse.json({ entrega });
}
