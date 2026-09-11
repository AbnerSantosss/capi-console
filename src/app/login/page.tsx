import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/LoginForm';
import {
  COOKIE_SESSAO,
  SENHA_MIN,
  senhaForte,
  validarDestino,
  verificarSessao,
} from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Entrar · Abner Traker',
  robots: { index: false, follow: false },
};

/**
 * Tela de entrada (F4).
 *
 * Fica fora da proteção do proxy — é onde os operadores chegam para se autenticar.
 * Valida o parâmetro de destino para evitar redirecionamentos abertos (D5).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const bruto = typeof params.destino === 'string' ? params.destino : '';
  const destino = validarDestino(bruto);
  const preview = params.preview === '1';

  const jar = await cookies();
  const sessao = verificarSessao(jar.get(COOKIE_SESSAO)?.value);
  if (sessao && !preview) {
    redirect(destino);
  }

  return (
    <LoginForm
      destino={destino}
      consoleFechado={!senhaForte(process.env.CONSOLE_PASSWORD)}
      senhaMin={SENHA_MIN}
      // ATALHO DE DEV — desativado em produção (remover antes de subir à VPS)
      atalhoDev={process.env.NODE_ENV !== 'production'}
    />
  );
}

