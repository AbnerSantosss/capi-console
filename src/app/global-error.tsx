'use client';

import { useEffect } from 'react';

import './globals.css';

/**
 * Erro no layout raiz (UX-15). Esta tela SUBSTITUI o layout e monta o próprio
 * documento, por isso importa o CSS global aqui: as cores vêm dos tokens, e
 * nenhum hex do console é escrito fora do CSS (gate do tema).
 */
export default function ErroGlobal({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[console] erro no layout raiz:', error);
  }, [error]);

  const botao: React.CSSProperties = {
    font: 'inherit',
    fontWeight: 600,
    padding: '10px 16px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    cursor: 'pointer',
    textDecoration: 'none',
  };

  return (
    <html lang="pt-BR" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 16,
          background: 'var(--background)',
          color: 'var(--foreground)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <title>Erro ao abrir o console</title>
        <main role="alert" style={{ maxWidth: 480, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>O console não conseguiu abrir</h1>
          <p style={{ margin: '0 0 16px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            Algo quebrou antes de a tela montar. Seus dados não foram alterados e nada foi
            enviado à Meta por causa disso.
            {error.digest ? ` Código do erro: ${error.digest}.` : ''}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{ ...botao, background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--primary)' }}
            >
              Tentar de novo
            </button>
            {/* Link comum de propósito: o roteador pode ser o que quebrou. */}
            <a href="/empresas" style={{ ...botao, background: 'transparent', color: 'var(--foreground)' }}>
              Ir para as empresas
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
