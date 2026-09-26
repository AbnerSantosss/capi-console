'use client';

import Link from 'next/link';

import consoleStyles from '@/components/layout/console.module.css';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * As 4 vistas da aba Eventos (V7 do v7), na ordem do dia a dia: o resumo, as
 * compras, a Fila e o envio manual.
 *
 * O `?vista=` do endereço é quem escolhe a vista (`e/[slug]/eventos/page.tsx`
 * lê); este seletor só escreve links para ele. Cada vista é um LINK de verdade
 * (`render={<Link />}`), como as abas da empresa: abrir numa aba nova, copiar
 * o endereço e voltar pelo navegador funcionam. A vista ativa vem da página
 * (do endereço), nunca de estado local, então o risco nunca discorda da tela.
 *
 * Os outros parâmetros da busca (o período: `?dias=`, `?de=`, `?ate=`) passam
 * adiante: trocar de Resumo para Compras mantém a janela escolhida. O
 * `?evento=` não passa: ele é o recorte "quem mandou este evento", que só
 * existe a partir do resumo. O Resumo é o endereço sem `vista`.
 */

export const VISTAS = [
  { valor: 'resumo', rotulo: 'Resumo' },
  { valor: 'compras', rotulo: 'Compras' },
  { valor: 'fila', rotulo: 'Fila' },
  { valor: 'manual', rotulo: 'Envio manual' },
] as const;

export type Vista = (typeof VISTAS)[number]['valor'];

/** Parâmetros que não atravessam a troca de vista. */
const NAO_PASSAM = new Set(['vista', 'evento']);

/** O endereço de uma vista, com os demais parâmetros da busca atual. */
export function enderecoDaVista(
  slug: string,
  vista: Vista,
  busca: Record<string, string | string[] | undefined> = {}
): string {
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(busca)) {
    if (NAO_PASSAM.has(chave) || valor === undefined) continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) parametros.append(chave, v);
  }
  if (vista !== 'resumo') parametros.set('vista', vista);
  const texto = parametros.toString();
  return `/e/${slug}/eventos${texto ? `?${texto}` : ''}`;
}

export function SeletorDeVista({
  slug,
  ativa,
  busca,
}: {
  slug: string;
  /** A vista aberta. `null` no recorte "quem mandou este evento" (nenhuma das 4). */
  ativa: Vista | null;
  /** A busca da página, para o período atravessar a troca de vista. */
  busca?: Record<string, string | string[] | undefined>;
}) {
  return (
    <Tabs value={ativa} className="gap-0">
      {/* Tamanho do texto no pai, como em `AbasDaEmpresa`: o tailwind-merge
          das abas leria `text-body` como cor e jogaria fora a cor da inativa. */}
      <div className={`${consoleStyles.tabsViewport} text-body`}>
        <TabsList variant="line" aria-label="Vistas de Eventos" className="gap-1 pb-1">
          {VISTAS.map((v) => (
            <TabsTrigger
              key={v.valor}
              value={v.valor}
              nativeButton={false}
              render={<Link href={enderecoDaVista(slug, v.valor, busca)} />}
              aria-current={v.valor === ativa ? 'page' : undefined}
              className="h-10 flex-none px-3"
            >
              {v.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}

export default SeletorDeVista;
