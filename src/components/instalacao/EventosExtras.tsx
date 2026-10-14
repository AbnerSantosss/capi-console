'use client';

/**
 * "Eventos extras (opcional)" — Tarefa 6 do plano v5 (§6.1 e §6.2 item 4).
 *
 * O dono perguntou se uma tag única disparando Lead, InitiateCheckout e
 * Purchase já resolveria. A resposta, apurada em `tag-script.ts`:
 *
 *   1. As tags já são separadas por evento (`gerarTodasAsTags`) — Lead e
 *      InitiateCheckout já têm código pronto, não há nada para gerar.
 *   2. Purchase é proibida à tag DE PROPÓSITO: a chave é pública, qualquer
 *      visitante forjaria uma venda. Fica de fora daqui e sempre vai ficar.
 *   3. Uma tag única não resolveria nada, porque o que falta não é código —
 *      é o ACIONADOR. Só PageView e ViewContent disparam sozinhos; todos os
 *      outros (todos os que aparecem abaixo) dependem de um acionador do GTM
 *      configurado à mão, ou de uma chamada `window.cvtag.enviar(...)`
 *      escrita no site do cliente.
 *
 * Por isso este bloco não gera nada de novo: reaproveita o código que
 * `/api/tag/gerar` já devolve (a mesma fonte que `OndeInstalarTag` usa para o
 * PageView) e só reorganiza, por evento, o que falta saber para ligar o
 * disparo — o nome exato do acionador do GTM e a chamada JS de quem não usa
 * GTM. Fechado por padrão: são 7 eventos que a maioria das instalações nunca
 * usa, e abrir tudo de cara devolveria a mesma poluição que a Tarefa 6 existe
 * para tirar.
 *
 * E3 (14/10): herda o caminho escolhido em "Escolha como instalar" (GTM ou
 * site) e mostra só ele; o código fica em "Ver código". Recolhido com
 * `hidden`, montado.
 */

import React, { useState } from 'react';
import { Check, ChevronDownIcon, ChevronUpIcon, Copy } from '@/components/ui/icones';
import { IconeExtras } from './icones-animados';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ParamChip, StatusDot } from '@/components/common/primitives';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { estadoDaRegra, type TagGerada } from './tag-estado';
import type { CaminhoDeInstalacao } from './OndeInstalarTag';
import type { RegraRoteamento } from '@/lib/config-store';

const ROTULO_FORMATO: Record<CaminhoDeInstalacao, string> = {
  gtm: 'Para o GTM',
  site: 'Para colar no site',
};

/**
 * O acionador do GTM já sai impresso no comentário do próprio código gerado
 * (`tag-script.ts`, mapa `ACIONADOR_GTM` — não exportado de propósito, o
 * núcleo do coletor não pode entrar no bundle do navegador). Extrair da linha
 * pronta evita duplicar aquele mapa aqui e garante que o texto nunca desalinha
 * do que está de fato dentro do código que o operador copia.
 */
function acionadorDoComentario(gtm: string): string {
  const m = gtm.match(/Acionador:\s*([^\n]*?)\s*-->/);
  return m ? m[1].trim() : '';
}

/** Mesma lógica para a chamada JS de exemplo, embutida no comentário da versão "site". */
function chamadaJsDoComentario(site: string): string {
  const m = site.match(/window\.cvtag\.enviar\([^)]*\);/);
  return m ? m[0] : '';
}

export interface EventosExtrasProps {
  /** Tags já geradas pelo servidor para o domínio escolhido — mesmo array que `OndeInstalarTag` recebe. */
  tags: TagGerada[];
  regras: RegraRoteamento[];
  copiar: (texto: string, chave: string) => void | Promise<void>;
  copiado: string | null;
  /** O caminho escolhido em "Escolha como instalar": só ele aparece aqui. */
  caminho: CaminhoDeInstalacao;
}

export function EventosExtras({ tags, regras, copiar, copiado, caminho }: EventosExtrasProps) {
  const [aberto, setAberto] = useState(false);

  // PageView e ViewContent já aparecem em "Escolha como instalar" — disparam
  // sozinhos e não têm acionador nenhum para configurar. Purchase e Subscribe
  // nem chegam a existir em `tags`: `eventoTagPermitido` os barra antes.
  const extras = tags.filter((t) => !t.evento.padrao);

  return (
    <div className="flex min-w-0 flex-col gap-3 border-t border-line pt-6">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls="eventos-extras-conteudo"
        className="flex w-full items-center justify-between gap-2 rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
      >
        <span className="flex items-center gap-2 text-label font-semibold text-fg-strong">
          <IconeExtras />
          Eventos extras (opcional)
        </span>
        {aberto ? (
          <ChevronUpIcon className="size-4 shrink-0 text-fg-muted" aria-hidden />
        ) : (
          <ChevronDownIcon className="size-4 shrink-0 text-fg-muted" aria-hidden />
        )}
      </button>

      <div id="eventos-extras-conteudo" hidden={!aberto} className="flex min-w-0 flex-col gap-3">
        <p className="text-body text-fg-body">
          Estes eventos já têm código. Falta decidir quando enviar.
        </p>

        {extras.length === 0 ? (
          <p className="text-body text-fg-body">Cadastre um site para ver o código aqui.</p>
        ) : (
          <Accordion multiple className="flex flex-col gap-3">
            {extras.map(({ evento, gtm, site }) => {
              const estado = estadoDaRegra(regras, evento.origem);
              const codigo = caminho === 'gtm' ? gtm : site;
              const chaveCopia = `${evento.origem}-${caminho}`;
              const acionador = acionadorDoComentario(gtm);
              const chamada = chamadaJsDoComentario(site);

              return (
                <AccordionItem
                  key={evento.origem}
                  value={evento.origem}
                  className="overflow-hidden rounded-panel border border-line-strong bg-surface-2 last:border-b"
                >
                  <AccordionTrigger className="min-h-14 px-4 py-3 hover:no-underline">
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pr-3">
                      <span className="text-label font-semibold text-fg-strong">
                        {evento.rotuloPt}
                      </span>
                      <ParamChip>{evento.evento}</ParamChip>
                      <StatusDot tone={estado.tom}>{estado.texto}</StatusDot>
                    </span>
                  </AccordionTrigger>

                  <AccordionContent className="border-t border-line px-4 pt-4 pb-4">
                    <p className="text-body text-fg-body">{evento.descricao}</p>

                    {caminho === 'gtm' ? (
                      <dl className="mt-3">
                        <dt className="text-label font-semibold text-fg-strong">Acionador no GTM</dt>
                        <dd className="mt-0.5 text-body text-fg-body">
                          {acionador || evento.quando}
                        </dd>
                      </dl>
                    ) : (
                      <dl className="mt-3">
                        <dt className="text-label font-semibold text-fg-strong">Chamada no site</dt>
                        <dd className="mt-0.5">
                          <code className="wrap-token block rounded border border-line-control bg-surface-2 px-1.5 py-1 font-mono text-caption text-fg-body">
                            {chamada || `window.cvtag.enviar('${evento.origem}')`}
                          </code>
                        </dd>
                      </dl>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-caption text-fg-muted">{ROTULO_FORMATO[caminho]}</span>
                      <Button size="sm" variant="outline" onClick={() => copiar(codigo, chaveCopia)}>
                        {copiado === chaveCopia ? (
                          <Check className="size-3.5 text-success" aria-hidden />
                        ) : (
                          <Copy className="size-3.5" aria-hidden />
                        )}
                        Copiar
                      </Button>
                    </div>

                    <details className="mt-2 min-w-0">
                      <summary className="w-fit cursor-pointer text-caption font-medium text-fg-strong underline underline-offset-2">
                        Ver código
                      </summary>
                      <Textarea
                        readOnly
                        spellCheck={false}
                        rows={8}
                        value={codigo}
                        aria-label={`Código da tag ${evento.evento} — ${ROTULO_FORMATO[caminho]}`}
                        className="wrap-token mt-2 font-mono text-caption"
                      />
                    </details>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    </div>
  );
}

export default EventosExtras;
