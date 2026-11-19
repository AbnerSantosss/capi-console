'use client';

/**
 * "O site já tem o Pixel da Meta no GTM?" (T-M20).
 *
 * Quando o site tem a tag daqui E o Pixel da Meta no GTM, o mesmo evento chega
 * à Meta pelos dois lados, e ela só junta os dois quando o ID é igual. Antes, o
 * código gerado pedia para colar o ID do Pixel dentro da tag. Agora o caminho é
 * o contrário, e ninguém edita código: este bloco entrega uma variável do GTM
 * pronta, que a tag do Pixel usa no campo "Event ID".
 *
 * A variável chega pronta do servidor (campo `variavelDoPixel` de cada tag, em
 * `/api/tag/gerar`). O gerador NÃO é importado aqui: ele não pode entrar no
 * pacote do navegador. Sem o campo, o bloco não aparece.
 */

import { Check, Copy } from '@/components/ui/icones';

import { Recolhido } from '@/components/common/Recolhido';
import { Button } from '@/components/ui/button';
import type { TagGerada } from './tag-estado';

export interface VariavelDoPixelProps {
  /** Tags que ganham um botão cada. `undefined` é aceito e ignorado. */
  tags: Array<TagGerada | undefined>;
  copiar: (texto: string, chave: string) => void | Promise<void>;
  copiado: string | null;
}

export function VariavelDoPixel({ tags, copiar, copiado }: VariavelDoPixelProps) {
  const itens = tags.filter((t): t is TagGerada => Boolean(t && t.variavelDoPixel));
  if (itens.length === 0) return null;

  const temPageView = itens.some((t) => t.evento.origem === 'tag.pageview');
  // Só a busca troca de ID a cada envio (janela 0 no gerador). O teste
  // `variavel-do-pixel` avisa se essa lista mudar.
  const temBusca = itens.some((t) => t.evento.origem === 'tag.search');

  return (
    <Recolhido titulo="Variável do Pixel">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-body font-semibold text-fg-strong">O site já tem o Pixel da Meta no GTM?</p>
        <p className="text-body text-fg-body">
          Use o mesmo ID nos dois lados, ou a Meta conta o evento duas vezes. O código da tag
          fica como está.
        </p>
        <ol className="flex flex-col gap-1 text-body text-fg-body">
          <li>
            1. No GTM: <strong>Variáveis → Nova → JavaScript personalizado</strong>. Cole a
            variável copiada aqui embaixo.
          </li>
          <li>
            2. Na tag do Pixel do mesmo evento, escolha essa variável no campo{' '}
            <strong>Event ID</strong>.
          </li>
          <li>
            3. <strong>Publique.</strong>
          </li>
        </ol>
        {temPageView && (
          <p className="text-caption text-fg-muted">
            A tag de PageView daqui precisa rodar antes da tag do Pixel. Por isso o acionamento
            dela é <strong>Initialization - All Pages</strong>.
          </p>
        )}
        {temBusca && (
          <p className="text-caption text-fg-muted">
            Na busca o ID muda a cada envio. Dê à tag do Pixel uma prioridade de acionamento
            maior que a desta tag.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {itens.map((t) => {
            const chave = `var-${t.evento.origem}`;
            return (
              <Button
                key={t.evento.origem}
                size="sm"
                variant="outline"
                onClick={() => copiar(t.variavelDoPixel ?? '', chave)}
              >
                {copiado === chave ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                Copiar variável do {t.evento.evento}
              </Button>
            );
          })}
        </div>
      </div>
    </Recolhido>
  );
}

export default VariavelDoPixel;
