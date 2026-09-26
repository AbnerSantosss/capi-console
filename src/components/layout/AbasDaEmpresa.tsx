'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ABAS_DO_TOPO, abaAtiva, enderecoDaAba } from '@/lib/abas-empresa';
import styles from './console.module.css';

/**
 * As 7 abas de uma empresa, no topo do conteúdo (V3 do v7).
 *
 * Elas substituem as duas navegações que existiam: o menu de 5 seções do
 * cabeçalho (só a partir de 80rem) e a barra fixa de baixo (só abaixo). Agora
 * é UMA navegação em qualquer largura: abaixo de `lg` a lista rola na
 * horizontal (`.tabsViewport`), e a aba ativa entra na tela sozinha.
 *
 * Cada aba é um LINK de verdade (`render={<Link />}`): abrir numa aba nova,
 * copiar o endereço e voltar pelo navegador funcionam como em qualquer página.
 * O `Tabs` do `ui/tabs.tsx` dá o risco de 3px da aba ativa e a navegação por
 * setas; a aba ativa sai do ENDEREÇO (`abaAtiva`), nunca de um estado local,
 * então o risco nunca discorda da tela que está aberta.
 *
 * A ilustração é decorativa (`alt=""`): o rótulo está escrito ao lado, e o
 * leitor de tela diria a mesma coisa duas vezes. Sem quadrado atrás, como no
 * desenho do dono. O arquivo tem 72px e é mostrado a 36px, nítido em tela de
 * alta densidade.
 */
export function AbasDaEmpresa({ slug }: { slug: string }) {
  const pathname = usePathname();
  const ativa = abaAtiva(pathname, slug);
  const lista = React.useRef<HTMLDivElement>(null);

  // No celular, a aba aberta pode estar fora da faixa visível (Regras,
  // Configurações): ela rola para dentro sem mexer na rolagem da página.
  React.useEffect(() => {
    const alvo = lista.current?.querySelector<HTMLElement>('[aria-current="page"]');
    alvo?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [ativa]);

  return (
    <Tabs value={ativa} className="gap-0">
      {/* O tamanho do texto mora AQUI, e não na aba: o `cn` das abas passa
          pelo tailwind-merge, que lê `text-body` como COR e descartaria o
          `text-fg-muted` da aba inativa. Herdado do pai, não briga com nada. */}
      <div ref={lista} className={`${styles.tabsViewport} text-body`}>
        <TabsList variant="line" aria-label="Abas da empresa" className="gap-1 pb-1">
          {ABAS_DO_TOPO.map((aba) => {
            const estaAtiva = aba.segmento === ativa;
            return (
              <TabsTrigger
                key={aba.segmento || 'visao-geral'}
                value={aba.segmento}
                nativeButton={false}
                render={<Link href={enderecoDaAba(slug, aba.segmento)} />}
                aria-current={estaAtiva ? 'page' : undefined}
                className="h-12 flex-none gap-2 px-2.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={aba.icone}
                  width={36}
                  height={36}
                  alt=""
                  decoding="async"
                  className="size-9 shrink-0"
                />
                {aba.rotulo}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
    </Tabs>
  );
}

export default AbasDaEmpresa;
