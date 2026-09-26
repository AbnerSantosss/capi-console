'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Pencil } from '@/components/ui/icones';

import type { EmpresaPublica } from '@/stores/useEmpresaStore';
import { destinoAoTrocar, slugDoEndereco } from '@/lib/empresa-do-endereco';
import { cn } from '@/lib/utils';

/**
 * Quem e a empresa dona de tudo o que esta na tela (P8), e como trocar.
 *
 * V3 (v7): o menu suspenso do cabecalho saiu. As empresas moram agora numa
 * LISTA sempre aberta, na lateral a partir de `lg` e na gaveta abaixo disso
 * (`LateralDeEmpresas`, `GavetaDeEmpresas`). Este arquivo ficou com as duas
 * pecas que as duas usam: a insignia da empresa e a lista.
 *
 * Com varias empresas no mesmo console, errar de empresa custa um evento real
 * disparado para o Pixel errado. Por isso a empresa aberta se le de tres
 * jeitos ao mesmo tempo, e nunca so pela cor: fundo realcado com filete a
 * esquerda, o ✓ ao lado do nome e o `aria-current` para o leitor de tela.
 *
 * O ouvinte de "outra aba trocou a empresa" (C2) morava aqui e mudou para a
 * `LateralDeEmpresas`, que monta uma vez so em toda tela. A lista aparece em
 * dois lugares; o ouvinte, se viesse junto, reagiria duas vezes.
 *
 * 🔴 Nenhum `fetch` aqui (E-8): a leitura e a gravacao moram no
 * `useEmpresaStore`. Este arquivo so mostra e navega.
 *
 * 🔴 Nenhuma cor nova: as classes sao as do DS (`surface-*`, `fg-*`, `line*`,
 * `tinta-texto`). A UNICA cor arbitraria da tela e a `cor` que o operador
 * escolheu para a empresa, e ela entra por `style` — e dado, nao classe.
 */

/* ------------------------------------------------------------------ */
/* A insignia — logo quando existe, iniciais quando nao                */
/* ------------------------------------------------------------------ */

/** Ate duas letras: a inicial da primeira e a da ultima palavra do nome. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * A cor da empresa e escolha do operador, entao ela pode ser clara OU escura —
 * e texto branco sobre amarelo nao se le. Por isso a letra alterna entre o
 * branco que o botao primario ja usa e a propria superficie de fundo do app
 * (`--surface-0`, quase preta). Continua sem cor nova: sao os dois extremos da
 * paleta que ja existem.
 */
function letraEscura(cor: string): boolean {
  const casa = /^#([0-9a-f]{6})$/i.exec(cor.trim());
  if (!casa) return false;
  const n = Number.parseInt(casa[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Luminancia percebida (ITU-R BT.601) — basta para decidir preto x branco.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

export function Insignia({
  empresa,
  className,
}: {
  empresa: EmpresaPublica;
  className?: string;
}) {
  const fonte = empresa.logoDataUrl ?? empresa.logoUrl;

  if (fonte) {
    return (
      // A logo e DECORATIVA (`alt=""`) porque o nome da empresa esta escrito ao
      // lado, em texto: descrever a imagem aqui faria o leitor de tela dizer o
      // nome duas vezes.
      // A logo chega como `data:` URL gravada pelo operador (teto de 150 KB no
      // servidor): o next/image nao otimiza `data:` e nao ha dominio remoto
      // para configurar, entao <img> aqui e a escolha certa, nao um atalho.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fonte}
        alt=""
        className={cn('shrink-0 rounded object-cover', className)}
      />
    );
  }

  const cor = empresa.cor?.trim();

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        cor
          ? letraEscura(cor)
            ? 'text-surface-0'
            : 'text-white'
          : 'bg-surface-2 text-fg-body',
        className
      )}
      style={cor ? { backgroundColor: cor } : undefined}
    >
      {/* O tamanho da letra fica no filho: no mesmo `cn` da cor, o
          tailwind-merge leria `text-caption` como cor e o descartaria. */}
      <span className="text-caption leading-none">{iniciaisDe(empresa.nome)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */

/**
 * O id do aviso fixo de "outra aba trocou a empresa". Um aviso so: trocas
 * seguidas em outra aba atualizam o mesmo toast. Quem o mostra e a
 * `LateralDeEmpresas`; a lista o fecha quando o operador troca daqui.
 */
export const ID_AVISO_OUTRA_ABA = 'empresa-trocada-fora';

/** Pede à lateral que abra a edição desta empresa (o diálogo mora lá). */
export const EVENTO_EDITAR_EMPRESA = 'capi:editar-empresa';

/**
 * A lista de empresas da lateral e da gaveta.
 *
 * A empresa aberta sai do ENDEREÇO (`/e/<slug>/…`), nunca do store: é o
 * endereço que diz de qual empresa são os dados da tela (V2). Em `/empresas`
 * e `/guia` nenhuma linha fica marcada, e isso é o certo: nenhuma empresa
 * está aberta ali.
 *
 * Cada empresa tem um selo de estado. Até a V5 medir de verdade (tag chegando,
 * Pixel respondendo), ele diz "—" com ponto neutro, e por extenso para o
 * leitor de tela: melhor admitir que não mediu do que pintar um verde que
 * ninguém conferiu.
 *
 * `aoEscolher` é para a gaveta se fechar quando o operador escolhe.
 */
export function ListaDeEmpresas({
  empresas,
  aoEscolher,
}: {
  empresas: EmpresaPublica[];
  aoEscolher?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const slugAberto = slugDoEndereco(pathname);

  /**
   * V2 (v7): trocar de empresa é NAVEGAR. O endereço é a única fonte da
   * empresa aberta, então a escolha leva à MESMA aba da empresa nova quando se
   * está numa aba, e à Visão geral dela em qualquer outro lugar
   * (`destinoAoTrocar`). Quem alinha o store, o cookie e os Pixels ao chegar
   * é o `EmpresaDoEndereco`; o proxy grava o cookie já no primeiro pedido.
   */
  const trocar = (empresa: EmpresaPublica) => {
    aoEscolher?.();
    // A tela já é desta empresa: não há para onde ir.
    if (slugAberto === empresa.slug) return;
    // A troca feita AQUI leva a outra tela: o aviso de outra aba perde o objeto.
    toast.dismiss(ID_AVISO_OUTRA_ABA);
    router.push(destinoAoTrocar(pathname, empresa.slug));
    toast.success(`Agora você está em ${empresa.nome}`);
  };

  if (empresas.length === 0) {
    return (
      <p className="px-2 py-1.5 text-label text-fg-muted">
        Nenhuma empresa ainda. Use &quot;Nova empresa&quot;, logo acima, para cadastrar a primeira.
      </p>
    );
  }

  return (
    // O tamanho do texto mora na lista, e não em cada linha: somado a uma cor
    // de texto no mesmo `cn`, o tailwind-merge descartaria a cor.
    <ul className="flex flex-col gap-0.5 text-body">
      {empresas.map((empresa) => {
        const aberta = empresa.slug === slugAberto;
        return (
          <li key={empresa.id} className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => trocar(empresa)}
              aria-current={aberta ? 'page' : undefined}
              title={empresa.nome}
              className={
                'flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-control border-l-2 px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto ' +
                (aberta
                  ? 'border-tinta-texto bg-tinta/15 font-medium text-fg-strong'
                  : 'border-transparent text-fg-body hover:bg-surface-2 hover:text-fg-strong')
              }
            >
              <Insignia empresa={empresa} className="size-6" />
              <span className="min-w-0 flex-1 truncate">{empresa.nome}</span>
              {/* O ✓ é o que diz qual está aberta — cor sozinha não é rótulo. */}
              {aberta && (
                <>
                  <Check className="size-4 shrink-0 text-tinta-texto" aria-hidden />
                  <span className="sr-only">(empresa aberta)</span>
                </>
              )}
              <span className="flex shrink-0 items-center gap-1 text-caption text-fg-muted">
                <span aria-hidden className="size-1.5 rounded-full bg-fg-muted" />
                <span aria-hidden>—</span>
                <span className="sr-only">Estado: ainda não medido</span>
              </span>
            </button>
            {/* Editar só a empresa aberta: é dela que a tela fala. Em V7 a
                edição muda para a aba Configurações. */}
            {aberta && (
              <button
                type="button"
                onClick={() => {
                  aoEscolher?.();
                  window.dispatchEvent(
                    new CustomEvent(EVENTO_EDITAR_EMPRESA, { detail: { id: empresa.id } })
                  );
                }}
                aria-label={`Editar ${empresa.nome}`}
                title={`Editar ${empresa.nome}`}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
