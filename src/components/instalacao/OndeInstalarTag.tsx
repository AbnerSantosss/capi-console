'use client';

/**
 * O código da tag do caminho escolhido, com o "Copiar" à vista, e o resto
 * recolhido: "Onde colar" (os passos) e "Variável do Pixel" (só no GTM).
 *
 * T-R04 (seção 3.2 do redesenho): o trabalho do dia a dia é copiar o código, e
 * ele vem primeiro. A escolha GTM ou site virou uma linha compacta em cima do
 * código. O aviso dos dois caminhos e a `CenaDaDuplicidade` saíram daqui: vão
 * no "Por que um caminho só", no fim da página.
 *
 * E3 (14/10): um caminho só na tela. A escolha é estado de `TagDoSite`
 * (desce por prop, porque "Eventos extras" usa o mesmo caminho), não grava
 * nada e não detecta GTM. O outro caminho fica com `hidden`, montado.
 *
 * O gerador de código continua NÃO importado aqui: as tags chegam prontas por
 * prop, vindas de `/api/tag/gerar` via `TagDoSite`.
 */

import React from 'react';
import { Check, Copy } from '@/components/ui/icones';

import { IconeDoAssunto, SeloDePasso, type Assunto } from '@/components/cenas';
import { StatusDot } from '@/components/common/primitives';
import { Recolhido } from '@/components/common/Recolhido';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { RegraRoteamento } from '@/lib/config-store';
import { CenaDoGtm } from './CenaDoGtm';
import { estadoDaRegra, type TagGerada } from './tag-estado';
import { VariavelDoPixel } from './VariavelDoPixel';

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
  escolha: string;
  passos: React.ReactNode[];
}

const CAMINHOS: Caminho[] = [
  {
    id: 'gtm',
    escolha: 'Sim, usar GTM',
    passos: [
      <>
        Abra o GTM: <strong>Tags → Nova</strong>.
      </>,
      <>
        Tipo: <strong>HTML personalizado</strong>.
      </>,
      <>
        Cole o código. Não marque <em>document.write</em>.
      </>,
      <>
        Acionamento: <strong>Initialization - All Pages</strong> no PageView e{' '}
        <strong>All Pages</strong> no ViewContent.
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
    escolha: 'Não, colar no site',
    passos: [
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
  /** Tags já geradas pelo servidor para o site escolhido (vazio enquanto gera). */
  tags: TagGerada[];
  /** Regras de roteamento: o StatusDot ao lado do código diz o destino real do evento. */
  regras: RegraRoteamento[];
  copiar: (texto: string, chave: string) => void | Promise<void>;
  copiado: string | null;
  caminho: CaminhoDeInstalacao;
  aoEscolherCaminho: (caminho: CaminhoDeInstalacao) => void;
  /** true quando a tag é o passo que falta: o "Copiar" do PageView fica amarelo. */
  principal: boolean;
}

/**
 * Um código pronto: rótulo, destino real e copiar. O código fica à vista
 * (`aberto`, o PageView) ou recolhido em "Ver código" (o ViewContent).
 */
function CodigoPronto({
  id,
  rotulo,
  codigo,
  origem,
  regras,
  principal,
  aberto,
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
  aberto: boolean;
  chave: string;
  copiar: OndeInstalarTagProps['copiar'];
  copiado: string | null;
}) {
  const estado = estadoDaRegra(regras, origem);
  const campo = (
    <Textarea
      id={id}
      readOnly
      spellCheck={false}
      rows={aberto ? 4 : 8}
      value={codigo}
      aria-label={`Código do ${rotulo}`}
      className="wrap-token font-mono text-caption"
    />
  );
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
          Copiar
        </Button>
      </div>
      {aberto ? campo : <Recolhido titulo="Ver código">{campo}</Recolhido>}
    </div>
  );
}

export function OndeInstalarTag({
  tags,
  regras,
  copiar,
  copiado,
  caminho,
  aoEscolherCaminho,
  principal,
}: OndeInstalarTagProps) {
  const pageview = tags.find((t) => t.evento.origem === 'tag.pageview');
  const viewcontent = tags.find((t) => t.evento.origem === 'tag.viewcontent');

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* A escolha do caminho numa linha só, em cima do código. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-body text-fg-body">O site do cliente já usa GTM?</p>
        <div
          className="flex max-w-full flex-wrap gap-1 rounded-control border border-line-control bg-surface-2 p-1"
          role="group"
          aria-label="Como instalar a tag"
        >
          {CAMINHOS.map((c) => {
            const ativo = caminho === c.id;
            return (
              <Button
                key={c.id}
                size="sm"
                variant={ativo ? 'secondary' : 'ghost'}
                aria-pressed={ativo}
                onClick={() => aoEscolherCaminho(c.id)}
              >
                {ativo && <Check className="size-3.5" aria-hidden />}
                {c.escolha}
              </Button>
            );
          })}
        </div>
      </div>

      {CAMINHOS.map((c) => (
        <section
          key={c.id}
          hidden={caminho !== c.id}
          aria-label={c.escolha}
          className="flex min-w-0 flex-col gap-4"
        >
          {tags.length === 0 ? (
            <p className="text-body text-fg-body">O código aparece aqui assim que a tag for gerada.</p>
          ) : (
            <>
              {pageview && (
                <CodigoPronto
                  id={`codigo-pageview-${c.id}`}
                  rotulo="PageView"
                  codigo={pageview[c.id]}
                  origem={pageview.evento.origem}
                  regras={regras}
                  principal={principal}
                  aberto
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
                  aberto={false}
                  chave={`vc-${c.id}`}
                  copiar={copiar}
                  copiado={copiado}
                />
              )}
            </>
          )}

          <Recolhido titulo="Onde colar">
            <div className="flex min-w-0 flex-col gap-4">
              {c.id === 'gtm' && caminho === 'gtm' && <CenaDoGtm />}
              <ol className="flex flex-col gap-2">
                {c.passos.map((passo, indice) => (
                  // Índice como chave: a lista é estática e a ordem é a identidade.
                  <li key={indice} className="flex min-w-0 items-center gap-3 text-body text-fg-body">
                    <SeloDePasso numero={indice + 1} assunto="tag" estado="proximo" />
                    <span className="min-w-0">{passo}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Recolhido>

          {c.id === 'gtm' && (
            <VariavelDoPixel
              tags={[pageview, viewcontent]}
              copiar={copiar}
              copiado={copiado}
            />
          )}
        </section>
      ))}
    </div>
  );
}

export default OndeInstalarTag;
