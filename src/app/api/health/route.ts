import { NextResponse } from 'next/server';
import { listarMarcas } from '@/lib/config-store';

export const dynamic = 'force-dynamic';

const inicio = Date.now();

/**
 * Healthcheck do container (Docker HEALTHCHECK, Portainer, uptime externo).
 * Fica FORA do Basic Auth de proposito, entao nao pode devolver segredo nenhum:
 * sem token, sem segredo de entrada, sem e-mail de comprador. O pixelId nao e
 * segredo — ele aparece no HTML de qualquer site que use o Pixel.
 */
export async function GET() {
  const marcas = await listarMarcas();
  return NextResponse.json({
    ok: true,
    servico: 'capi-console',
    versao: process.env.APP_VERSION || 'dev',
    uptimeS: Math.floor((Date.now() - inicio) / 1000),
    marcas: marcas.map((m) => ({
      id: m.id,
      pixelId: m.pixelId,
      temToken: Boolean(m.accessToken),
      modoTeste: Boolean(m.testCode?.trim()),
    })),
  });
}
