import { NextRequest, NextResponse } from 'next/server';
import {
  listarMarcas,
  publicarMarca,
  salvarMarca,
  removerMarca,
  acharMarca,
} from '@/lib/config-store';
import { exigirSessao } from '@/lib/sessao';

/** Lista as marcas SEM o token de acesso. */
export async function GET() {
  const marcas = await listarMarcas();
  return NextResponse.json({ marcas: marcas.map(publicarMarca) });
}

/** Cria ou atualiza uma marca. O token so trafega nesta direcao. */
export async function PUT(request: NextRequest) {
  try {
    exigirSessao(request);
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ erro: 'Informe o id da marca.' }, { status: 400 });
    }
    if (!String(body.nome || '').trim()) {
      return NextResponse.json({ erro: 'Informe o nome da marca.' }, { status: 400 });
    }
    if (!String(body.pixelId || '').trim()) {
      return NextResponse.json({ erro: 'Informe o Pixel ID.' }, { status: 400 });
    }

    await salvarMarca({
      id,
      nome: String(body.nome).trim(),
      pixelId: String(body.pixelId).trim(),
      accessToken: body.accessToken === null ? null : String(body.accessToken ?? ''),
      testCode: String(body.testCode ?? '').trim(),
      adAccountId: String(body.adAccountId ?? '').trim() || undefined,
    } as Parameters<typeof salvarMarca>[0]);

    // Devolve a visao mesclada (config + .env), nao o registro cru: uma marca
    // sem token proprio herda o do .env e precisa aparecer como temToken: true.
    const mesclada = await acharMarca(id);
    return NextResponse.json({
      marca: mesclada ? publicarMarca(mesclada) : null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    exigirSessao(request);
    const id = new URL(request.url).searchParams.get('id') ?? '';
    await removerMarca(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
