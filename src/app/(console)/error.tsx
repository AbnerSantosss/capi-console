'use client';

import consoleStyles from '@/components/layout/console.module.css';
import { TelaDeErro } from '@/components/common/TelaDeErro';

/**
 * Erro de qualquer página do console (UX-15). Este arquivo fica dentro do
 * layout de `(console)`, então o cabeçalho e a lista de empresas continuam na
 * tela e o operador sai daqui pelo menu, sem editar o endereço.
 */
export default function ErroDoConsole({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className={consoleStyles.page}>
      <TelaDeErro error={error} retry={retry} />
    </main>
  );
}
