/**
 * Simbolo do Polen Track (nao e simbolo de terceiro). Mora fora de
 * `brand-icons.tsx` de proposito: aquele arquivo segue as regras de uso das
 * plataformas (cor oficial, sem redesenhar); este e do produto.
 *
 * O desenho sao os quatro circulos do logo oficial, com as mesmas medidas do
 * arquivo que o dono entregou (caixa de 668 x 735).
 *
 * A cor vem da variavel `--tinta-texto`, que na paleta do produto e o amarelo
 * nas duas telas (login e console). Nao escreva a cor em hexadecimal aqui: o
 * teste de tema (`npm run test:tema`) reprova os hex da paleta em qualquer
 * `.ts`/`.tsx` fora dos dois `layout.tsx`.
 */

/** Caixa do desenho original. O simbolo e mais alto do que largo. */
const LARGURA = 668;
const ALTURA = 735;

interface Props {
  /** Altura, em px. A largura acompanha a proporcao do simbolo. */
  size?: number;
  /** true = ornamento (aria-hidden). false = conteudo (role="img" + label). */
  decorative?: boolean;
  className?: string;
}

export function AppMark({ size = 40, decorative = true, className = '' }: Props) {
  return (
    <svg
      width={Math.round((size * LARGURA) / ALTURA)}
      height={size}
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      fill="var(--tinta-texto)"
      className={className}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': 'Polen Track' })}
    >
      <circle cx="469" cy="197.5" r="198" />
      <circle cx="109" cy="257" r="109.5" />
      <circle cx="212" cy="578.5" r="156" />
      <circle cx="548" cy="553.5" r="109" />
    </svg>
  );
}

export default AppMark;
