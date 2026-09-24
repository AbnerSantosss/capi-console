import { Unbounded } from 'next/font/google';

/*
 * Assinatura "Abner Traker Soluções" da tela de entrada (22/09/2026, pedido
 * do dono). O vídeo antigo do astronauta trazia o nome desenhado dentro da
 * imagem ("Abner Traker" + "BEYOND THE LIMITS"); os vídeos novos não trazem,
 * e o dono quis o nome de volta ESCRITO, em texto de verdade, numa tipografia
 * especial.
 *
 * Unbounded: geométrica larga, de cantos redondos, com cara de marca espacial
 * sem cair na Orbitron de todo site "tech". Tem Ç e Õ no subconjunto latin.
 * Fica restrita a esta assinatura: o resto do console continua na Plex.
 */
const unbounded = Unbounded({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

interface Props {
  /** `hero` = canto inferior do vídeo do desktop; `compacta` = canto inferior da tela no celular. */
  variante: 'hero' | 'compacta';
  className?: string;
}

export function MarcaLogin({ variante, className = '' }: Props) {
  const hero = variante === 'hero';
  return (
    <div
      className={`${unbounded.className} flex flex-col items-start text-left select-none ${className}`}
    >
      <span
        className={`${hero ? 'text-display' : 'text-data'} font-bold tracking-[-0.02em] text-fg-strong drop-shadow-[0_2px_12px_rgb(0_0_0/0.6)]`}
      >
        Abner Traker
      </span>
      <span
        className={`${hero ? 'mt-3 text-label tracking-[0.6em]' : 'mt-2 text-caption tracking-[0.5em]'} font-normal uppercase text-fg-strong/85 drop-shadow-[0_1px_6px_rgb(0_0_0/0.7)]`}
      >
        Soluções
      </span>
    </div>
  );
}
