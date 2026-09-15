/**
 * Marca do proprio app (nao e marca de terceiro).
 *
 * Fica separada de `brand-icons.tsx` de proposito: aquele arquivo guarda os
 * vetores oficiais da Meta, do Pix e do WhatsApp, que tem regras de uso de
 * terceiros. Esta aqui e nossa e pode ser desenhada a vontade.
 *
 * O desenho e uma mira: quatro tracos apontando para um centro vazio, com
 * quatro pontos orbitando. Le como "rastrear" — que e o que o app faz.
 */

interface Props {
  /** Lado do quadrado, em px. */
  size?: number;
  /** true = ornamento (aria-hidden). false = conteudo (role="img" + label). */
  decorative?: boolean;
  className?: string;
}

export function AppMark({ size = 40, decorative = true, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': 'Abner Traker' })}
    >
      {/* Tracos da mira — o vao central e proposital: e o alvo. */}
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M24 4v11" />
        <path d="M24 33v11" />
        <path d="M4 24h11" />
        <path d="M33 24h11" />
      </g>
      {/* Pontos orbitando, na tinta de texto da area. O hex e so o fallback de
          quando o SVG e servido fora do documento (favicon, e-mail); dentro do
          app quem manda e a variavel, que muda com `[data-area]`. */}
      <g fill="var(--tinta-texto, #7dece5)">
        <circle cx="10" cy="10" r="2.5" />
        <circle cx="38" cy="10" r="2.5" />
        <circle cx="10" cy="38" r="2.5" />
        <circle cx="38" cy="38" r="2.5" />
      </g>
    </svg>
  );
}

export default AppMark;
