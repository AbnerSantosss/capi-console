/**
 * Renderiza os textos de conteudo.ts: `entre crases` vira <code>.
 *
 * Existe para o conteudo do guia poder morar num .ts puro, sem JSX — assim
 * um texto nao arrasta estilo junto.
 */
export function RichText({ children }: { children: string }) {
  const partes = children.split(/(`[^`]+`)/g);
  return (
    <>
      {partes.map((parte, i) =>
        parte.startsWith('`') && parte.endsWith('`') && parte.length > 2 ? (
          <code
            key={i}
            className="rounded-control border border-line bg-surface-2 px-1 py-0.5 font-mono text-code-inline text-fg-body"
          >
            {parte.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{parte}</span>
        )
      )}
    </>
  );
}
