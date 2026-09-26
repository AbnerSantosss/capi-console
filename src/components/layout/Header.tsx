'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, Copy, Search } from '@/components/ui/icones';

import { useBrandStore, limparLegado } from '@/stores/useBrandStore';
import { useEmpresaStore, type EmpresaPublica } from '@/stores/useEmpresaStore';
import { CommandPalette } from '@/components/common/CommandPalette';
import type { TagGerada } from '@/components/instalacao/tag-estado';
import { Button, buttonVariants } from '@/components/ui/button';
import { useEstadoNoCabecalho } from '@/components/visao-geral/estado-no-cabecalho';
import { rotuloDaAba, abaAtiva } from '@/lib/abas-empresa';
import type { TomDaEmpresa } from '@/lib/checklist-empresa';
import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import { slugDoEndereco } from '@/lib/empresa-do-endereco';
import { cn } from '@/lib/utils';
import { useListaDeEmpresas } from './LateralDeEmpresas';

/** O ponto do selo, em cor E com o texto ao lado (nunca só a cor). */
const PONTO_DO_ESTADO: Record<TomDaEmpresa, string> = {
  erro: 'bg-danger',
  pendente: 'bg-warning',
  andamento: 'bg-tinta-texto',
  ok: 'bg-success',
};

/**
 * O cabeçalho do console (V3 do v7): trilha, estado da empresa e UMA ação.
 *
 * Saíram daqui o menu de cinco seções, a pílula de ambiente, o sino e o menu
 * do operador. Quem navega agora são as 7 abas da empresa (`AbasDaEmpresa`)
 * e a lateral de empresas; Ajuda, Preferências e Sair moram no pé da
 * lateral (e da gaveta, abaixo de `lg`). O cabeçalho ficou com o que diz ONDE
 * você está e o que fazer AGORA:
 *
 *  - a trilha "Empresas / Gtech / Domínio", que sai do ENDEREÇO (o layout não
 *    re-renderiza na navegação, então ninguém passa nome nem aba por prop);
 *  - o selo de estado da empresa (V5): na Visão geral, o pior passo do
 *    checklist que ela acabou de medir ("Falta configurar", "Com erro"...),
 *    com a causa por extenso; nas outras abas, "—", porque um selo medido
 *    antes de o dono mexer na aba ficaria velho sem avisar;
 *  - uma ação primária por aba. Na Visão geral é o VERBO do próximo passo do
 *    checklist (V5): "Cadastrar um Pixel", "Conectar o webhook de vendas"...;
 *    quando o próximo passo é a tag, o botão copia a tag ali mesmo. As outras
 *    abas ganham o verbo delas em V7.
 *
 * A paleta de comandos (⌘K) continua montada aqui, uma vez só para o console
 * inteiro, e a lupa do cabeçalho abre a mesma paleta.
 *
 * `gaveta` é a gaveta de empresas (abaixo de `lg`), montada pelo layout do
 * servidor com a lista que ele leu. Ela entra por prop, e não por import,
 * para que a lista de empresas passe do servidor para ela sem desvio.
 */
export function Header({
  empresas: doServidor,
  gaveta,
}: {
  empresas: EmpresaPublica[];
  gaveta?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const carregar = useBrandStore((s) => s.carregar);
  const carregarEmpresas = useEmpresaStore((s) => s.carregar);
  const empresas = useListaDeEmpresas(doServidor);

  useEffect(() => {
    void carregar();
    // A lista de empresas entra pelo mesmo caminho das marcas: o cabecalho e o
    // unico componente presente em toda tela, entao e dele a montagem que
    // enche os dois stores. A lateral e a gaveta so leem — elas nunca buscam.
    void carregarEmpresas();
    if (limparLegado()) {
      toast.warning('Token removido do navegador', {
        description:
          'Versões anteriores guardavam o token da Meta no localStorage. Ele foi apagado; o token agora fica só no servidor.',
        duration: 10000,
      });
    }
  }, [carregar, carregarEmpresas]);

  const slug = slugDoEndereco(pathname);
  const empresa = slug ? empresas.find((e) => e.slug === slug) : undefined;
  const nomeDaEmpresa = empresa?.nome ?? slug ?? '';
  const aba = slug ? rotuloDaAba(pathname, slug) : null;
  // Só com a empresa achada na lista: um slug que não existe cai na tela
  // "Empresa não encontrada", e ali não há tag nenhuma para copiar.
  const naVisaoGeral = Boolean(empresa) && slug !== null && abaAtiva(pathname, slug) === '';

  // O que a Visão geral mediu desta empresa. Só vale NELA: nas outras abas o
  // dono pode ter acabado de mudar o que o selo diria.
  const medido = useEstadoNoCabecalho(slug);
  const estado = naVisaoGeral ? (medido?.estado ?? null) : null;
  const proximo = naVisaoGeral ? (medido?.proximo ?? null) : null;

  const [copiando, setCopiando] = useState(false);

  /**
   * "Copiar tag do site": o trecho do PageView, o que vai no `<head>` de todas
   * as páginas do cliente. Pede à rota de sempre (`/api/tag/gerar`) e diz a
   * empresa pelo cabeçalho, a do ENDEREÇO, sem depender do store.
   *
   * Sem domínio cadastrado a tag até sai, mas o coletor recusa o evento pela
   * origem: copiar assim seria entregar ao cliente uma tag que não funciona.
   * Então o botão não copia, diz por quê e leva para a aba Fontes, onde moram a
   * tag e o campo do domínio do site desde a V8 (R1 da V8).
   */
  const copiarTag = async () => {
    if (!slug || !empresa) return;
    const irParaFontes = {
      label: 'Abrir Fontes',
      onClick: () => router.push(`/e/${slug}/fontes`),
    };
    setCopiando(true);
    try {
      const resposta = await pedir<{ dominioId: string | null; tags?: TagGerada[] }>(
        '/api/tag/gerar',
        {
          cache: 'no-store',
          headers: { 'X-Empresa-Id': empresa.id },
        }
      );
      if (!resposta.dominioId) {
        toast.warning('Cadastre o domínio do site antes de copiar a tag.', {
          description: 'Sem domínio cadastrado, o console recusa os eventos que o site mandar.',
          action: irParaFontes,
        });
        return;
      }
      const trecho = resposta.tags?.find((t) => t.evento.origem === 'tag.pageview')?.site;
      if (!trecho) {
        toast.error('A tag do site não veio pronta.', {
          description: 'Abra a aba Fontes: a tag completa fica lá, com o botão de copiar.',
          action: irParaFontes,
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(trecho);
      } catch {
        // Área de transferência bloqueada (permissão negada, página em http).
        toast.error('O navegador bloqueou a cópia.', {
          description: 'Abra a aba Fontes: a tag fica num campo que dá para selecionar e copiar à mão.',
          action: irParaFontes,
        });
        return;
      }
      toast.success('Tag do site copiada.', {
        description: 'Cole no <head> de todas as páginas do site.',
      });
    } catch (e) {
      // Sessão expirada já redireciona para o login dentro de `pedir`.
      if (e instanceof SessaoExpirada) return;
      toast.error('Não deu para gerar a tag agora.', {
        description: `${e instanceof Error ? `${e.message} ` : ''}Tente de novo em instantes.`,
      });
    } finally {
      setCopiando(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-0/82 backdrop-blur-md">
      <div className="flex h-[var(--altura-cabecalho)] w-full items-center gap-2.5 px-4 sm:px-6">
        {gaveta}

        {/* A trilha. O último pedaço é a página aberta (`aria-current`), e os
            anteriores são links para subir um nível. Abaixo de `lg` o botão da
            gaveta, logo à esquerda, já diz a empresa: a trilha fica só com a
            aba, e o nome não aparece duas vezes na mesma linha. */}
        <nav aria-label="Trilha" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5 text-label">
            {pathname.startsWith('/guia') ? (
              <li className="truncate font-medium text-fg-strong" aria-current="page">
                Ajuda
              </li>
            ) : (
              <>
                <li className={slug ? 'hidden shrink-0 lg:block' : 'shrink-0'}>
                  {slug ? (
                    <Link
                      href="/empresas"
                      className="rounded-control text-fg-muted transition-colors hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
                    >
                      Empresas
                    </Link>
                  ) : (
                    <span
                      className="font-medium text-fg-strong"
                      aria-current={pathname === '/empresas' ? 'page' : undefined}
                    >
                      Empresas
                    </span>
                  )}
                </li>
                {slug && (
                  <>
                    <li aria-hidden className="hidden shrink-0 text-fg-muted lg:block">
                      /
                    </li>
                    <li className="hidden min-w-0 truncate lg:block">
                      <Link
                        href={`/e/${slug}`}
                        className="rounded-control font-medium text-fg-body transition-colors hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
                      >
                        {nomeDaEmpresa}
                      </Link>
                    </li>
                  </>
                )}
                {slug && aba && (
                  <>
                    <li aria-hidden className="hidden shrink-0 text-fg-muted lg:block">
                      /
                    </li>
                    <li className="truncate font-medium text-fg-strong" aria-current="page">
                      {aba}
                    </li>
                  </>
                )}
              </>
            )}
          </ol>
        </nav>

        {/* O estado da empresa: ponto + texto, nunca só a cor. Sem medida (fora
            da Visão geral, ou antes de ela medir), "—" por extenso para o
            leitor de tela, e nunca um verde que ninguém conferiu. */}
        {slug && estado ? (
          <span
            title={estado.frase}
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-caption font-medium text-fg-body sm:inline-flex"
          >
            <span aria-hidden className={cn('size-1.5 rounded-full', PONTO_DO_ESTADO[estado.tom])} />
            <span aria-hidden>{estado.rotulo}</span>
            <span className="sr-only">Estado da empresa: {estado.frase}</span>
          </span>
        ) : slug ? (
          <span
            title="Estado da empresa: aparece na Visão geral"
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-caption text-fg-muted sm:inline-flex"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-fg-muted" />
            <span aria-hidden>—</span>
            <span className="sr-only">Estado da empresa: aparece na Visão geral</span>
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('capi:abrir-paleta'))}
          aria-label="Buscar pedido, e-mail ou regra"
          title="Buscar pedido, e-mail ou regra (⌘K)"
          className="flex h-control-sm shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface-1 px-2 text-fg-muted shadow-realce transition-colors hover:border-line-control hover:bg-surface-2 hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          {/* O atalho fica à vista a partir de `lg`: é ele que conta que dá para
              buscar digitando. */}
          <kbd
            aria-hidden
            className="hidden rounded-sm border border-line-control px-1.5 font-mono text-caption lg:inline"
          >
            ⌘K
          </kbd>
        </button>

        {/* A ação primária da Visão geral: o verbo do próximo passo. Antes de
            a Visão geral medir, nenhum botão (e não um verbo que trocaria
            logo depois). */}
        {proximo?.acao === 'copiar-tag' ? (
          <Button
            onClick={() => void copiarTag()}
            disabled={copiando}
            ocupado={copiando}
            aria-label={proximo.verbo}
          >
            {!copiando && <Copy aria-hidden />}
            <span className="hidden sm:inline">{proximo.verbo}</span>
          </Button>
        ) : proximo ? (
          <Link href={proximo.href} className={buttonVariants()} aria-label={proximo.verbo} title={proximo.frase}>
            <span className="hidden sm:inline">{proximo.verbo}</span>
            <ArrowRight aria-hidden />
          </Link>
        ) : null}
      </div>

      {/* "Pixel e token" na paleta leva ao lugar onde o Pixel mora: a aba
          Pixels da empresa aberta, ou a rota antiga, que redireciona para a da
          empresa ativa, quando não há empresa no endereço. */}
      <CommandPalette
        onAbrirMarcas={() => router.push(slug ? `/e/${slug}/pixels` : '/pixels')}
      />
    </header>
  );
}

export default Header;
