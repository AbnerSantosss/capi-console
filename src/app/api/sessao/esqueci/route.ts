import { NextResponse, type NextRequest } from 'next/server';

import { emailConfigurado, enviarEmail } from '@/lib/email';
import { TROCA_VALIDADE_MIN, assinarTokenTroca, usuarioConfigurado } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

/**
 * POST — "Esqueci minha senha".
 *
 * Se o e-mail digitado for o do acesso, manda para ele um link de troca válido
 * por 30 minutos. A resposta é sempre a mesma, exista ou não o e-mail, para
 * não revelar qual é o endereço do acesso. Freio: 1 envio a cada 2 minutos.
 */
let ultimoEnvio = 0;
const INTERVALO_MS = 2 * 60_000;

const RESPOSTA = {
  ok: true,
  mensagem: 'Se este for o e-mail do acesso, o link para criar uma senha nova chega em instantes.',
};

function semCache(corpo: unknown, status = 200) {
  return NextResponse.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const tipo = req.headers.get('content-type') || '';
  const site = req.headers.get('sec-fetch-site');
  if (!tipo.toLowerCase().includes('application/json') || (site && site !== 'same-origin' && site !== 'none')) {
    return semCache({ erro: 'Requisição não permitida.' }, 403);
  }
  if (!emailConfigurado()) {
    return semCache({ erro: 'O envio de e-mail não está configurado no servidor.' }, 503);
  }

  const corpo = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof corpo?.email === 'string' ? corpo.email.trim().toLowerCase() : '';
  if (!email) return semCache({ erro: 'Digite o seu e-mail no campo acima.' }, 400);

  const doAcesso = usuarioConfigurado().trim().toLowerCase();
  if (email !== doAcesso || Date.now() - ultimoEnvio < INTERVALO_MS) {
    return semCache(RESPOSTA);
  }

  const token = assinarTokenTroca();
  const base = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/+$/, '');
  if (!token) return semCache(RESPOSTA);

  const link = `${base}/login/nova-senha?t=${encodeURIComponent(token)}`;
  ultimoEnvio = Date.now();
  try {
    await enviarEmail(
      doAcesso,
      'Polen Track: criar uma senha nova',
      `Alguém pediu para trocar a senha do Polen Track.\n\nPara criar a senha nova, abra o link (vale por ${TROCA_VALIDADE_MIN} minutos):\n${link}\n\nSe não foi você, ignore este e-mail. A senha atual continua valendo.`,
      `<p>Alguém pediu para trocar a senha do <strong>Polen Track</strong>.</p>
<p><a href="${link}">Criar a senha nova</a> (o link vale por ${TROCA_VALIDADE_MIN} minutos).</p>
<p>Se não foi você, ignore este e-mail. A senha atual continua valendo.</p>`
    );
  } catch {
    ultimoEnvio = 0;
    console.error('[esqueci] falha ao enviar o e-mail de troca de senha');
    return semCache({ erro: 'Não foi possível mandar o e-mail agora. Tente de novo em alguns minutos.' }, 502);
  }
  return semCache(RESPOSTA);
}
