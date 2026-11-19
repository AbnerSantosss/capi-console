'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  FlaskConical,
  Gauge,
  Globe,
  Inbox,
  Plug,
  Settings,
  Target,
  Workflow,
  type Icone,
} from '@/components/ui/icones';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ABAS_DO_TOPO, abaAtiva, enderecoDaAba, type AbaDoTopo } from '@/lib/abas-empresa';
import styles from './console.module.css';

/** O glifo de cada aba, pelo segmento do endereço (D-R3, 18/11/2026). */
const ICONE_DA_ABA: Record<AbaDoTopo['segmento'], Icone> = {
  '': Gauge,
  dominio: Globe,
  fontes: Plug,
  pixels: Target,
  eventos: Inbox,
  teste: FlaskConical,
  regras: Workflow,
  configuracoes: Settings,
};

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
 * O `Tabs` do `ui/tabs.tsx` dá o risco amarelo de 2px da aba ativa e a
 * navegação por setas; a aba ativa sai do ENDEREÇO (`abaAtiva`), nunca de um
 * estado local, então o risco nunca discorda da tela que está aberta.
 *
 * Redesenho de 18/11/2026 (D-R3): a ilustração de 36px deu lugar a um ícone
 * Phosphor de 16px, decorativo (`aria-hidden`): o rótulo está escrito ao lado,
 * e o leitor de tela diria a mesma coisa duas vezes. Aba de 40px em
 * `text-label`.
 */
export function AbasDaEmpresa({ slug }: { slug: string }) {
  const pathname = usePathname();
  const ativa = abaAtiva(pathname, slug);
  const lista = React.useRef<HTMLDivElement>(null);

  // No celular, a aba aberta pode estar fora da faixa visível (Regras,
  // Configurações): ela rola para dentro sem mexer na rolagem da página.
  // Espera a fonte carregar e um quadro passar: medida antes disso, a aba
  // (agora com ícone) ainda não tem a largura final e fica meio cortada.
  React.useEffect(() => {
    let vivo = true;
    let quadro = 0;
    void document.fonts.ready.then(() => {
      if (!vivo) return;
      quadro = requestAnimationFrame(() => {
        const alvo = lista.current?.querySelector<HTMLElement>('[aria-current="page"]');
        alvo?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    });
    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
    };
  }, [ativa]);

  return (
    <Tabs value={ativa} className="gap-0">
      <div ref={lista} className={styles.tabsViewport}>
        <TabsList variant="line" aria-label="Abas da empresa" className="gap-1">
          {ABAS_DO_TOPO.map((aba) => {
            const estaAtiva = aba.segmento === ativa;
            const IconeDaAba = ICONE_DA_ABA[aba.segmento];
            return (
              <TabsTrigger
                key={aba.segmento || 'visao-geral'}
                value={aba.segmento}
                nativeButton={false}
                render={<Link href={enderecoDaAba(slug, aba.segmento)} />}
                aria-current={estaAtiva ? 'page' : undefined}
                className="h-10 flex-none gap-1.5 px-3 text-label font-medium"
              >
                <IconeDaAba aria-hidden className="size-4 shrink-0" />
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
