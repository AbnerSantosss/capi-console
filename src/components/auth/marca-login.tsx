import Image from 'next/image';

/**
 * Assinatura do produto na tela de entrada: o logo horizontal do Polen Track
 * (simbolo amarelo + nome em branco). E uma imagem pronta, em
 * `public/brand/polen-track-horizontal-branco.png` (1264 x 200 px).
 *
 *   • hero     — grande, no pe da coluna do video (desktop).
 *   • compacta — pequena, no rodape da coluna do formulario (celular).
 *
 * A sombra fica porque o logo aparece por cima de video.
 *
 * O arquivo e o componente continuam se chamando `marca-login` / `MarcaLogin`
 * para nao mexer em quem importa.
 */

interface Props {
  variante: 'hero' | 'compacta';
  className?: string;
}

export function MarcaLogin({ variante, className = '' }: Props) {
  const hero = variante === 'hero';

  return (
    <Image
      src="/brand/polen-track-horizontal-branco.png"
      alt="Polen Track"
      width={1264}
      height={200}
      sizes={hero ? '354px' : '202px'}
      className={`${hero ? 'h-14' : 'h-8'} w-auto select-none drop-shadow-[0_2px_12px_rgb(0_0_0/0.6)] ${className}`}
    />
  );
}
