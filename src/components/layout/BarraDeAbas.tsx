'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { SECOES, secaoAtiva } from '@/components/layout/Header';
import { cn } from '@/lib/utils';

/**
 * A navegação de celular e tablet, onde o polegar alcança (R-04).
 *
 * Ela substitui a tira de cinco abas que vivia colada no cabeçalho: lá em cima
 * as cinco seções empurravam a altura do cabeçalho para 305px no celular e
 * "Instalação" ainda aparecia truncada em "Instal…". Aqui cada aba tem uma
 * coluna inteira, o rótulo curto cabe por extenso e o alvo de toque passa dos
 * 44px de altura.
 *
 * As seções são as MESMAS cinco do cabeçalho (`SECOES`), importadas e não
 * copiadas: duas listas paralelas viram duas navegações que discordam na
 * primeira mudança. Teto de cinco itens (IA-R1').
 *
 * 🔴 Some a partir de 80rem, exatamente onde o menu do cabeçalho aparece
 * (`xl:flex` lá, `xl:hidden` aqui). Se os dois usassem breakpoints diferentes
 * haveria uma faixa de largura com duas navegações ou com nenhuma.
 *
 * O espaço para ela não é cravado aqui: `.page` já reserva
 * `calc(var(--altura-barra-abas) + env(safe-area-inset-bottom) + 1.5rem)` de
 * respiro embaixo até 80rem, e 4rem daí para cima — por isso nada de conteúdo
 * fica atrás da barra.
 */
export function BarraDeAbas() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface-0/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md xl:hidden"
    >
      {SECOES.map((item) => {
        const Icon = item.icon;
        const ativo = secaoAtiva(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? 'page' : undefined}
            className={cn(
              // A linha de 2px na tinta da área fica em CIMA, encostada na
              // borda da barra — é o espelho da régua do cabeçalho.
              'relative flex min-h-[var(--altura-barra-abas)] flex-col items-center justify-center gap-1 px-1 text-caption font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-tinta-texto',
              ativo
                ? 'text-fg-strong before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-tinta'
                : 'text-fg-muted hover:text-fg-body'
            )}
          >
            {/* Ícone na tinta da área quando ativo: a cor confirma o rótulo,
                nunca substitui ele (o rótulo está sempre escrito). */}
            <Icon
              className={cn(
                'size-[1.25rem] shrink-0',
                ativo && '[color:var(--tinta)]'
              )}
              strokeWidth={ativo ? 2 : 1.75}
              aria-hidden
            />
            <span className="max-w-full truncate">{item.curto}</span>
            {/* Só quando o rótulo curto não é o completo: com os dois iguais o
                leitor de tela anunciava "Pixels Pixels". */}
            {item.curto !== item.rotulo && (
              <span className="sr-only">{item.rotulo}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export default BarraDeAbas;
