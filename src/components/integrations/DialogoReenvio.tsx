'use client';

/**
 * Confirmação do "mandar de novo" das recusadas (T-M10).
 *
 * Irmão menor do DialogoLote: aqui não se escolhe Pixel. Cada evento volta só
 * para o Pixel que o recusou, e essa conta chega pronta de `separarRecusadas`
 * (src/lib/inbox-lote.ts). A janela só mostra para onde vai e pede o "ciente".
 */
import { useState } from 'react';
import { AlertTriangle, FlaskConical, RotateCcw } from '@/components/ui/icones';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Callout } from '@/components/common/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Insignia } from '@/components/empresa/SeletorDeEmpresa';
import { useBrandStore } from '@/stores/useBrandStore';
import { useEmpresaStore } from '@/stores/useEmpresaStore';

/** Um evento recusado e os ids dos Pixels cadastrados que o recusaram. */
export interface ItemDoReenvio {
  item: { id: string };
  marcas: string[];
}

export function DialogoReenvio({
  aberto,
  onFechar,
  itens,
  descricaoFiltro,
  onConfirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  itens: ItemDoReenvio[];
  descricaoFiltro: string;
  onConfirmar: () => void;
}) {
  const [ciente, setCiente] = useState(false);
  const marcas = useBrandStore((s) => s.marcas);
  const empresa = useEmpresaStore((s) => s.ativa());

  const ids = new Set(itens.flatMap((r) => r.marcas));
  const pixels = marcas.filter((m) => ids.has(m.id));
  const emProducao = pixels.filter((m) => !m.testCode?.trim());
  const soTeste = pixels.length > 0 && emProducao.length === 0;
  const total = itens.length;

  const textoCiente = soTeste
    ? 'Entendo que estes eventos vão só para o Testar eventos da Meta e não contam nas campanhas.'
    : 'Entendo que são eventos reais e serão contados nas campanhas.';
  const podeMandar = total > 0 && pixels.length > 0 && ciente;

  const fechar = () => {
    setCiente(false);
    onFechar();
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) fechar();
      }}
    >
      <DialogContent variant="console" className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-heading font-semibold text-fg-strong">
            <RotateCcw className="size-5 text-tinta-texto" aria-hidden />
            {total === 1
              ? 'Mandar de novo 1 evento recusado pela Meta'
              : `Mandar de novo ${total} eventos recusados pela Meta`}
          </DialogTitle>
          <DialogDescription className="text-body text-fg-muted">
            A Meta respondeu e não aceitou estes eventos. Use depois de corrigir o que ela apontou
            (o token do Pixel, por exemplo). O que a Meta já aceitou não vai de novo.
          </DialogDescription>
        </DialogHeader>

        {empresa && (
          <div className="flex items-center gap-2.5 rounded-control border border-line-strong bg-surface-2 p-2.5">
            <Insignia empresa={empresa} className="size-8 overflow-hidden" />
            <div className="min-w-0">
              <p className="text-label font-semibold text-fg-muted">Enviando pela empresa</p>
              <p className="truncate text-label font-semibold text-fg-strong">{empresa.nome}</p>
            </div>
          </div>
        )}

        <div className="rounded-control border border-line-strong bg-surface-2 p-2.5">
          <p className="text-label font-semibold text-fg-muted">Pixels que vão receber</p>
          <p className="mt-1 text-body text-fg-body">
            {pixels.length > 0
              ? pixels.map((m) => m.nome).join(', ')
              : 'Nenhum Pixel desta empresa recusou estes eventos.'}
          </p>
          <p className="mt-1 text-caption text-fg-muted">
            Cada evento volta só para o Pixel que o recusou.
          </p>
        </div>

        <div className="rounded-control border border-line-strong bg-surface-2 p-2.5">
          <p className="text-label font-semibold text-fg-muted">Filtro que produziu esta lista</p>
          <p className="mt-1 text-body text-fg-body">{descricaoFiltro}</p>
        </div>

        {emProducao.length > 0 && (
          <Callout tone="danger" icon={AlertTriangle} title="Isto entra nas métricas reais">
            {emProducao.length === 1
              ? `O Pixel ${emProducao[0].nome} está sem código de teste. O que a Meta aceitar agora conta nas campanhas.`
              : `${emProducao.length} Pixels estão sem código de teste (${emProducao
                  .map((m) => m.nome)
                  .join(', ')}). O que a Meta aceitar agora conta nas campanhas.`}
          </Callout>
        )}
        {soTeste && (
          <Callout tone="warning" icon={FlaskConical} title="Todos os Pixels estão em modo de teste">
            Os eventos vão só para o Testar eventos da Meta e não contam nas campanhas.
          </Callout>
        )}

        <label className="group/field-label flex cursor-pointer items-start gap-2.5 rounded-control border border-line-strong bg-surface-2 p-2.5">
          <Checkbox
            checked={ciente}
            onCheckedChange={(v) => setCiente(v === true)}
            className="mt-0.5"
            aria-label={textoCiente}
          />
          <span className="text-body text-fg-body">{textoCiente}</span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button
            disabled={!podeMandar}
            onClick={() => {
              setCiente(false);
              onConfirmar();
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            Mandar de novo {total}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
