import type { Metadata } from 'next';

import { NovaSenhaForm } from '@/components/auth/NovaSenhaForm';
import { SENHA_MIN, verificarTokenTroca } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Senha nova · Polen Track',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** Tela aberta pelo link do e-mail de "Esqueci minha senha". */
export default async function NovaSenhaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.t === 'string' ? params.t : '';
  return <NovaSenhaForm token={token} linkValido={verificarTokenTroca(token)} senhaMin={SENHA_MIN} />;
}
