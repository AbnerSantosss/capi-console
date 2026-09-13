'use client';

import * as React from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import type { MarcaPublica } from '@/stores/useBrandStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/common/primitives';
import { MetaGlyph } from '@/components/ui/brand-icons';
import { cn } from '@/lib/utils';

/**
 * Um Pixel, em cartao — nao em linha de tabela (7.3.2).
 *
 * O cartao existe para que o estado do Pixel seja legivel SEM abrir modal
 * nenhum: quem esta em uso, quem tem token, quem esta com codigo de teste.
 * Cor sozinha nao diz nada disso, entao cada um dos tres esta escrito.
 *
 * O que ainda NAO esta aqui, de proposito:
 *   - o estado nomeado de quatro faixas (§12.6) entra na FASE 5, no lugar do
 *     selo "em uso" e dos dois StatusDot abaixo;
 *   - o switch de disparo automatico por Pixel entra na FASE 6, e depende do
 *     campo `autoDisparo`, que ainda nao existe em config/marcas.json.
 * Os dois crescem dentro de `<div className="...detalhes">`, que ja e uma
 * regiao propria justamente para nao virar refatoracao de layout depois.
 */

export interface PixelCardProps {
  marca: MarcaPublica;
  /** E o Pixel para onde o disparo manual esta apontando agora. */
  ativo: boolean;
  onUsar: () => void;
  onEditar: () => void;
  /**
   * Ausente quando o Pixel nao pode ser apagado. O `default` e o caso: e a
   * trava de config-store.ts, nao uma decisao de tela — nao a contorne aqui.
   */
  onApagar?: () => void;
}

export function PixelCard({
  marca,
  ativo,
  onUsar,
  onEditar,
  onApagar,
}: PixelCardProps) {
  const emTeste = Boolean(marca.testCode?.trim());

  return (
    <li
      // A ancora de /pixels#marca_abc (IA-R4). O `id` interno so existe como
      // alvo de rolagem; ele NUNCA e mostrado como texto — ver IA-R9.
      id={marca.id}
      className="scroll-mt-24"
    >
      <article
        className={cn(
          'flex flex-col gap-4 rounded-panel border p-4 transition-colors sm:flex-row sm:items-start',
          ativo
            ? 'border-accent-text bg-accent-text/10'
            : 'border-line-strong bg-surface-1'
        )}
      >
        <MetaGlyph size={36} />

        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-title font-semibold text-fg-strong">
            {marca.nome}
            {ativo && <Badge variant="info">em uso</Badge>}
          </h3>

          <p className="mt-1 wrap-token font-mono text-caption text-fg-muted tabular">
            Pixel {marca.pixelId || '—'}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <StatusDot tone={marca.temToken ? 'success' : 'danger'}>
              {marca.temToken ? 'token configurado' : 'sem token'}
            </StatusDot>
            <StatusDot tone={emTeste ? 'accent' : 'warning'}>
              {emTeste ? `código de teste ${marca.testCode}` : 'sem código de teste'}
            </StatusDot>
          </div>

          {!marca.temToken && (
            <p className="mt-2 text-caption text-fg-muted">
              Sem token da API de Conversões este Pixel não consegue receber
              evento nenhum. Abra <strong>Editar</strong> e informe o token.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {/* "Usar" e a acao que o modal levava embora: e ela que troca o
              destino do disparo manual. Some quando ja e o ativo, porque
              usar o que ja esta em uso nao e acao. */}
          {!ativo && (
            <Button
              size="sm"
              variant="outline"
              onClick={onUsar}
              aria-label={`Usar ${marca.nome} no disparo manual`}
            >
              Usar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onEditar}
            aria-label={`Editar ${marca.nome}`}
          >
            <Pencil className="size-3.5" aria-hidden />
            Editar
          </Button>
          {onApagar && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Apagar ${marca.nome}`}
              onClick={onApagar}
            >
              <Trash2 className="size-3.5 text-danger" aria-hidden />
            </Button>
          )}
        </div>
      </article>
    </li>
  );
}

export default PixelCard;
