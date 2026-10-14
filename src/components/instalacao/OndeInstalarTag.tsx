'use client';

/**
 * "Escolha como instalar": a pergunta do GTM, o aviso dos dois caminhos, os
 * passos do caminho escolhido e o código pronto dele.
 *
 * O erro mais caro aqui não é colar no lugar errado: é colar nos DOIS, e a
 * Meta passar a contar cada visita duas vezes, sem erro visível. Por isso o
 * aviso fica ENTRE a pergunta e os cartões, com a `CenaDaDuplicidade` ao
 * lado (§12, O1).
 *
 * E3 (14/10): um caminho só na tela. A escolha é estado de `TagDoSite`
 * (desce por prop, porque "Eventos extras" e a faixa "Próximo passo" usam o
 * mesmo caminho), não grava nada e não detecta GTM. O outro caminho fica com
 * `hidden`, montado. O passo já está inteiro na linha, então o clique no
 * passo deixou de abrir o modal.
 *
 * O gerador de código continua NÃO importado aqui: as tags chegam prontas por
 * prop, vindas de `/api/tag/gerar` via `TagDoSite`.
 */

import React from 'react';
import { AlertTriangle, Check, Code2, Container, Copy, Repeat } from '@/components/ui/icones';

import { IconeDoAssunto, SeloDePasso, type Assunto } from '@/components/cenas';
import { Callout, StatusDot } from '@/components/common/primitives';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { RegraRoteamento } from '@/lib/config-store';
import { CenaDaDuplicidade } from './CenaDaDuplicidade';
import { CenaDoGtm } from './CenaDoGtm';
import { estadoDaRegra, type TagGerada } from './tag-estado';

/** O id do caminho é literalmente o nome do formato de tag. */
export type CaminhoDeInstalacao = 'gtm' | 'site';

/**
 * Título de bloco sem caixa (um só nível de caixa dentro da `Section`), com o
 * ícone do assunto que entra uma vez (§12, O3). `desenho` recebe um dos
 * ícones da Instalação que já vêm na própria moldura (`icones-animados`);
 * sem ele, `IconeDoAssunto` com o ícone do barril.
 */
export function TituloDoBloco({
  icone,
  desenho,
  assunto = 'tag',
  acao,
  id,
  children,
}: {
  icone?: React.ComponentType<{ className?: string }>;
  desenho?: React.ReactNode;
  assunto?: Assunto;
  acao?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={id} className="flex min-w-0 items-center gap-2 text-label font-semibold text-fg-strong">
        {desenho ?? <IconeDoAssunto assunto={assunto} icone={icone} />}
        {children}
      </h3>
      {acao}
    </div>
  );
}

interface Caminho {
  id: CaminhoDeInstalacao;
  titulo: string;
  escolha: string;
  quando: string;
  icone: typeof Code2;
  passos: React.ReactNode[];
}

const CAMINHOS: Caminho[] = [
  {
    id: 'gtm',
    titulo: 'Google Tag Manager',
    escolha: 'Sim, usar GTM',
    quando: 'O site já tem GTM? Use este.',
    icone: Container,
    passos: [
      <>
        Abra o GTM: <strong>Tags → Nova</strong>.
      </>,
      <>
        Tipo: <strong>HTML personalizado</strong>.
      </>,
      <>
        Cole o código (aba <strong>Para o GTM</strong>). Não marque{' '}
        <em>document.write</em>.
      </>,
      <>
        Acionamento: <strong>All Pages</strong>.
      </>,
      <>
        Clique em <strong>Visualizar</strong>. A tag deve aparecer como{' '}
        <em>acionada</em>.
      </>,
      <>
        <strong>Publique.</strong> Tag salva e não publicada não coleta.
      </>,
    ],
  },
  {
    id: 'site',
    titulo: 'Direto no código do site',
    escolha: 'Não, colar no site',
    quando: 'Sem GTM? Cole no site.',
    icone: Code2,
    passos: [
      <>
        Copie o código (aba <strong>Para colar no site</strong>).
      </>,
      <>
        Cole antes de <code className="font-mono">&lt;/head&gt;</code>, em todas as
        páginas, inclusive a de obrigado.
      </>,
      <>WordPress? Use um plugin de cabeçalho.</>,
      <>
        <strong>Publique.</strong>
      </>,
      <>
        Confira em <strong>Eventos → Fila</strong>.
      </>,
    ],
  },
];

export interface OndeInstalarTagProps {
  /** Tags já geradas pelo servidor para o site escolhido (vazio antes de cadastrar). */
  tags: TagGerada[];
  /** Regras de roteamento: o StatusDot ao lado do código diz o destino real do evento. */
  regras: RegraRoteamento[];
  /** true com pelo menos um site cadastrado: aí, sem tags, a geração está em voo ou falhou. */
  temDominio: boolean;
  copiar: (texto: string, chave: string) => void | Promise<void>;
  copiado: string | null;
  caminho: CaminhoDeInstalacao;
  aoEscolherCaminho: (caminho: CaminhoDeInstalacao) => void;
  /** Rola até o campo de cadastro do site. */
  aoCadastrarSite: () => void;
}

/** Um código pronto: rótulo, destino real, copiar e "Ver código" recolhido. */
function CodigoPronto({
  id,
  rotulo,
  codigo,
  origem,
  regras,
  principal,
  chave,
  copiar,
  copiado,
}: {
  id: string;
  rotulo: string;
  codigo: string;
  origem: string;
  regras: RegraRoteamento[];
  principal: boolean;
  chave: string;
  copiar: OndeInstalarTagProps['copiar'];
  copiado: string | null;
}) {
  const estado = estadoDaRegra(regras, origem);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-body font-semibold text-fg-strong">{rotulo}</span>
          <span title={estado.explicacao}>
            <StatusDot tone={estado.tom}>{estado.texto}</StatusDot>
          </span>
        </div>
        <Button
          size="sm"
          variant={principal ? 'default' : 'outline'}
          onClick={() => copiar(codigo, chave)}
        >
          {copiado === chave ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {principal ? 'Copiar código' : 'Copiar'}
        </Button>
      </div>
      <details className="group min-w-0">
        <summary className="w-fit cursor-pointer text-caption font-medium text-fg-strong underline underline-offset-2">
          Ver código
        </summary>
        <Textarea
          id={id}
          readOnly
          spellCheck={false}
          rows={8}
          value={codigo}
          aria-label={`Código do ${rotulo}`}
          className="wrap-token mt-2 font-mono text-caption"
        />
      </details>
    </div>
  );
}

export function OndeInstalarTag({
  tags,
  regras,
  temDominio,
  copiar,
  copiado,
  caminho,
  aoEscolherCaminho,
  aoCadastrarSite,
}: OndeInstalarTagProps) {
  const pageview = tags.find((t) => t.evento.origem === 'tag.pageview');
  const viewcontent = tags.find((t) => t.evento.origem === 'tag.viewcontent');
  const outro: CaminhoDeInstalacao = caminho === 'gtm' ? 'site' : 'gtm';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TituloDoBloco icone={Container}>Escolha como instalar</TituloDoBloco>

      <p className="text-body font-semibold text-fg-strong">O site do cliente já usa GTM?</p>

      <div className="flex min-w-0 flex-col gap-3">
        <Callout tone="danger" icon={AlertTriangle} title="Use um caminho por evento.">
          Nos dois, o evento conta em dobro na Meta, sem aviso.
          <details className="mt-1">
            <summary className="w-fit cursor-pointer font-medium text-fg-strong underline underline-offset-2">
              Como conferir se já está instalado
            </summary>
            <p className="mt-1">Procure o endereço do coletor no código-fonte do site.</p>
          </details>
        </Callout>
        <CenaDaDuplicidade />
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2" role="group" aria-label="Como instalar a tag">
        {CAMINHOS.map((c) => {
          const Icone = c.icone;
          const ativo = caminho === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => aoEscolherCaminho(c.id)}
              className={cn(
                'flex min-w-0 flex-col items-start gap-1.5 rounded-panel border bg-surface-2 p-4 text-left transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto',
                ativo ? 'border-tinta' : 'border-line'
              )}
            >
              <span className="flex w-full flex-wrap items-center gap-2">
                <Icone aria-hidden className="size-5 shrink-0 text-tinta" />
                <span className="text-body font-semibold text-fg-strong">{c.escolha}</span>
                {c.id === 'gtm' && (
                  <span className="rounded-full border border-tinta px-2 text-caption font-semibold text-fg-strong">
                    Recomendado
                  </span>
                )}
                {ativo && <Check aria-hidden className="ml-auto size-4 shrink-0 text-tinta" />}
              </span>
              <span className="text-caption text-fg-muted">{c.quando}</span>
            </button>
          );
        })}
      </div>

      {CAMINHOS.map((c) => (
        <section
          key={c.id}
          hidden={caminho !== c.id}
          aria-labelledby={`instalar-${c.id}`}
          className="flex min-w-0 flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 id={`instalar-${c.id}`} className="text-label font-semibold text-fg-strong">
              Passos: {c.titulo}
            </h4>
            <Button size="sm" variant="ghost" onClick={() => aoEscolherCaminho(outro)}>
              <Repeat className="size-3.5" aria-hidden />
              Trocar caminho
            </Button>
          </div>

          {c.id === 'gtm' && caminho === 'gtm' && <CenaDoGtm />}

          <ol className="flex flex-col gap-2.5">
            {c.passos.map((passo, indice) => (
              // Índice como chave: a lista é estática e a ordem é a identidade.
              <li key={indice} className="flex min-w-0 items-center gap-3 text-body text-fg-body">
                <SeloDePasso numero={indice + 1} assunto="tag" estado="proximo" />
                <span className="min-w-0">{passo}</span>
              </li>
            ))}
          </ol>

          <div className="flex min-w-0 flex-col gap-4 border-t border-line pt-4">
            {tags.length === 0 ? (
              temDominio ? (
                <p className="text-body text-fg-body">O código aparece aqui assim que a tag for gerada.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-body text-fg-body">Cadastre um site para ver o código aqui.</p>
                  <Button size="sm" onClick={aoCadastrarSite}>
                    Cadastrar site
                  </Button>
                </div>
              )
            ) : (
              <>
                {pageview && (
                  <CodigoPronto
                    id={`codigo-pageview-${c.id}`}
                    rotulo="PageView"
                    codigo={pageview[c.id]}
                    origem={pageview.evento.origem}
                    regras={regras}
                    principal
                    chave={`pv-${c.id}`}
                    copiar={copiar}
                    copiado={copiado}
                  />
                )}
                {viewcontent && (
                  <CodigoPronto
                    id={`codigo-viewcontent-${c.id}`}
                    rotulo="ViewContent"
                    codigo={viewcontent[c.id]}
                    origem={viewcontent.evento.origem}
                    regras={regras}
                    principal={false}
                    chave={`vc-${c.id}`}
                    copiar={copiar}
                    copiado={copiado}
                  />
                )}
              </>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export default OndeInstalarTag;
