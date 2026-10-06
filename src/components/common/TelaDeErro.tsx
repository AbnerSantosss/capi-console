'use client';

import React, { useEffect, useState } from 'react';

import { EstadoVazio } from '@/components/common/EstadoVazio';
import { Button } from '@/components/ui/button';

/**
 * A tela de erro do console, em português (UX-15, 06/10/2026).
 *
 * Antes aparecia a tela padrão do framework, em inglês ("This page couldn't
 * load"), sem nada para reportar. Aqui o operador tem uma frase sobre o que
 * houve, "Tentar de novo" e "Copiar detalhes" (mensagem, código, endereço e
 * hora) para mandar a quem cuida do sistema.
 *
 * Usada por `(console)/error.tsx`, que fica DENTRO do layout do console: o
 * menu e a lista de empresas continuam na tela.
 */
export function TelaDeErro({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    console.error('[console] erro de tela:', error);
  }, [error]);

  const copiar = async () => {
    const detalhes = [
      `Mensagem: ${error.message || 'sem mensagem'}`,
      error.digest ? `Código: ${error.digest}` : null,
      `Endereço: ${window.location.pathname}`,
      `Hora: ${new Date().toLocaleString('pt-BR')}`,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(detalhes);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <EstadoVazio
      cenario="erro"
      titulo="Esta tela não conseguiu abrir"
      motivo={
        <>
          Algo quebrou ao montar esta página. Seus dados não foram alterados e nada foi enviado
          à Meta por causa disso. Tente de novo; se continuar, copie os detalhes e envie para
          quem cuida do sistema.
          {error.digest ? (
            <>
              {' '}
              Código do erro: <span className="font-mono">{error.digest}</span>.
            </>
          ) : null}
        </>
      }
      acao={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()}>Tentar de novo</Button>
          <Button variant="outline" onClick={copiar}>
            {copiado ? 'Detalhes copiados' : 'Copiar detalhes'}
          </Button>
        </div>
      }
    />
  );
}
