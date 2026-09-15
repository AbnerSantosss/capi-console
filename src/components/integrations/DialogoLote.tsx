'use client';

/**
 * Confirmação do DISPARO EM LOTE — a última porta antes de eventos reais
 * saírem em série para a Meta.
 *
 * 🔴 Regra 1 do `CLAUDE.md` do projeto e E-7 do plano: nenhum evento fictício,
 * e nada dispara sozinho. O lote não inventa evento nenhum — ele percorre
 * itens que JÁ chegaram e chama, um por um, a mesma rota do botão "Disparar
 * direto" de uma linha. Ainda assim é a única operação do console que manda
 * dezenas de conversões com um clique, e conversão enviada não se apaga: por
 * isso este diálogo mostra a CONTAGEM, o FILTRO em palavras, os PIXELS de
 * destino e a lista do que fica de fora com o motivo — e exige uma caixa de
 * seleção marcada à mão antes de habilitar o botão.
 *
 * O que fica de fora vem de `separarParaLote` (`src/lib/inbox-lote.ts`), a
 * única autoridade sobre elegibilidade. A tela acrescenta um motivo próprio
 * ('sem-evento-meta'), e só no sentido de EXCLUIR mais — nunca de incluir.
 */

import React, { useState } from 'react';
import { AlertTriangle, FlaskConical, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Callout, StatusDot } from '@/components/common/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SeletorDePixel } from '@/components/pixels/SeletorDePixel';
import { Insignia } from '@/components/empresa/SeletorDeEmpresa';
import { useBrandStore } from '@/stores/useBrandStore';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import type { MotivoInelegivel } from '@/lib/inbox-lote';

/**
 * Os motivos de `inbox-lote.ts` mais um que só a tela sabe: o item não tem
 * evento padrão da Meta escolhido, então nem botão "Disparar direto" ele tem.
 * Mandá-lo assim renderia 400 na rota — barulho, não evento. Fica de fora com
 * nome próprio para o operador entender que falta uma REGRA, não permissão.
 */
export type MotivoFora = MotivoInelegivel | 'sem-evento-meta';

export const TEXTO_MOTIVO: Record<MotivoFora, string> = {
  'ja-enviado': 'já foram enviados à Meta',
  ignorado: 'estão marcados para não enviar',
  'teste-interno': 'são teste da equipe ou ping da plataforma',
  'sem-evento-meta': 'ainda não têm evento padrão da Meta (falta regra)',
};

/** Ordem de exibição: do motivo mais caro de errar para o mais banal. */
const ORDEM_MOTIVO: MotivoFora[] = [
  'ja-enviado',
  'teste-interno',
  'ignorado',
  'sem-evento-meta',
];

/** O mínimo para listar um item no resumo. Estrutural, como nos outros diálogos. */
export interface ItemResumoLote {
  id: string;
  evento?: string;
  eventoOrigem?: string;
}

const nome = (i: ItemResumoLote) => i.eventoOrigem ?? i.evento ?? 'sem nome de evento';

export function DialogoLote({
  aberto,
  onFechar,
  elegiveis,
  fora,
  descricaoFiltro,
  marcasEscolhidas,
  onMarcas,
  onConfirmar,
}: {
  aberto: boolean;
  onFechar: () => void;
  elegiveis: ItemResumoLote[];
  fora: Array<{ item: ItemResumoLote; motivo: MotivoFora }>;
  descricaoFiltro: string;
  marcasEscolhidas: string[];
  onMarcas: (ids: string[]) => void;
  onConfirmar: () => void;
}) {
  // A caixa de seleção nasce DESMARCADA a cada abertura. Nada de lembrar o
  // consentimento da vez passada: o consentimento é sobre estes N eventos.
  const [ciente, setCiente] = useState(false);
  const marcas = useBrandStore((s) => s.marcas);
  const empresa = useEmpresaStore((s) => s.ativa());

  const escolhidasEmProducao = marcas.filter(
    (m) => marcasEscolhidas.includes(m.id) && !m.testCode?.trim()
  );

  const porMotivo = ORDEM_MOTIVO.map((motivo) => ({
    motivo,
    itens: fora.filter((f) => f.motivo === motivo),
  })).filter((g) => g.itens.length > 0);

  const podeDisparar = ciente && marcasEscolhidas.length > 0 && elegiveis.length > 0;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) {
          setCiente(false);
          onFechar();
        }
      }}
    >
      <DialogContent
        variant="console"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-heading font-semibold text-fg-strong">
            <Send className="size-5 text-tinta-texto" aria-hidden />
            Disparar {elegiveis.length} evento{elegiveis.length === 1 ? '' : 's'} para a Meta
          </DialogTitle>
          <DialogDescription className="text-caption text-fg-muted">
            Um envio por evento, na ordem da lista, um de cada vez. Cada um passa pelas mesmas
            travas do botão &ldquo;Disparar direto&rdquo;.
          </DialogDescription>
        </DialogHeader>

        {/* De QUEM e o disparo, com a mesma logo do cabecalho. O console passou
            a ter mais de uma empresa e a lista filtrada nao diz de quem ela e:
            confirmar dezenas de conversoes acreditando estar noutro cliente e
            exatamente o erro que nao volta atras. */}
        {empresa && (
          <div className="flex items-center gap-2.5 rounded-control border border-line-strong bg-surface-2 p-2.5">
            <Insignia empresa={empresa} className="size-8 overflow-hidden" />
            <div className="min-w-0">
              <p className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
                Disparando pela empresa
              </p>
              <p className="truncate text-label font-semibold text-fg-strong">
                {empresa.nome}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-control border border-line-strong bg-surface-2 p-2.5">
          <p className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
            Filtro que produziu esta lista
          </p>
          <p className="mt-1 text-caption text-fg-body">{descricaoFiltro}</p>
        </div>

        <SeletorDePixel
          modo="varios"
          rotulo="Pixels de destino"
          valor={marcasEscolhidas}
          onChange={onMarcas}
        />

        {porMotivo.length > 0 && (
          <div className="rounded-control border border-line-strong bg-surface-2 p-2.5">
            <p className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
              Fica de fora
            </p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {porMotivo.map((g) => (
                <li key={g.motivo} className="text-caption text-fg-body">
                  <StatusDot tone={g.motivo === 'ja-enviado' ? 'success' : 'neutral'}>
                    {g.itens.length} {TEXTO_MOTIVO[g.motivo]}
                  </StatusDot>
                  {/* Os nomes, e não só o número: "3 já enviados" sem dizer
                      quais é o tipo de resumo que ninguém consegue conferir. */}
                  <span className="mt-0.5 block font-mono text-caption text-fg-muted">
                    {g.itens
                      .slice(0, 6)
                      .map((f) => nome(f.item))
                      .join(', ')}
                    {g.itens.length > 6 ? ` e mais ${g.itens.length - 6}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {escolhidasEmProducao.length > 0 ? (
          <Callout tone="danger" icon={AlertTriangle} title="Isto entra nas métricas reais">
            {escolhidasEmProducao.map((m) => m.nome).join(', ')} está sem Código de teste. Os{' '}
            {elegiveis.length} evento{elegiveis.length === 1 ? '' : 's'} vão contar como conversão
            de verdade na campanha, e não há como desfazer.
          </Callout>
        ) : (
          <Callout tone="info" icon={FlaskConical} title="Todos os Pixels estão em modo de teste">
            Com Código de teste preenchido, os eventos aparecem em Testar Eventos e não contam na
            campanha.
          </Callout>
        )}

        <label className="group/field-label flex cursor-pointer items-start gap-2.5 rounded-control border border-line-strong bg-surface-2 p-2.5">
          <Checkbox
            checked={ciente}
            onCheckedChange={(v) => setCiente(v === true)}
            className="mt-0.5"
            aria-label="Entendo que são eventos reais e serão contados nas campanhas"
          />
          <span className="text-caption text-fg-body">
            Entendo que são eventos reais e serão contados nas campanhas.
          </span>
        </label>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setCiente(false);
              onFechar();
            }}
          >
            Cancelar
          </Button>
          <Button
            disabled={!podeDisparar}
            onClick={() => {
              setCiente(false);
              onConfirmar();
            }}
          >
            <Send className="size-4" aria-hidden />
            Disparar {elegiveis.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DialogoLote;
