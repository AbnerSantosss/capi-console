import { NextRequest, NextResponse } from 'next/server';
import {
  listarEntradas,
  acharEntrada,
  marcarStatus,
  limparEntradas,
  type StatusEntrada,
} from '@/lib/inbox';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const item = await acharEntrada(id);
    if (!item) {
      return NextResponse.json({ erro: 'Entrada não encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ item });
  }
  return NextResponse.json({ itens: await listarEntradas(50) });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const status = String(body.status) as StatusEntrada;
  const item = await marcarStatus(String(body.id), status);
  return NextResponse.json({ item });
}

export async function DELETE() {
  await limparEntradas();
  return NextResponse.json({ ok: true });
}
