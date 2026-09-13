'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Target } from 'lucide-react';

import { useBrandStore, type MarcaPublica } from '@/stores/useBrandStore';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Callout } from '@/components/common/primitives';
import { RegiaoDeEspera, Spinner } from '@/components/common/Esqueleto';
import { cn } from '@/lib/utils';

/**
 * O UNICO seletor de Pixel do produto (7.B / IA-4).
 *
 * Antes dele a mesma escolha tinha quatro formas — lista com botao "Usar",
 * caixa de selecao dentro de um dialogo, caixa de selecao inline, e um
 * `Select` do Design System usado ali do lado para evento e modo. O usuario
 * reaprendia a mesma operacao quatro vezes.
 *
 * Sao dois modos, e so dois:
 *   modo="unico"   -> `Select` do Design System. E "um entre N" (IA-R6).
 *   modo="varios"  -> `Checkbox` em `fieldset` com `legend`. E "N entre N" (IA-R7).
 *
 * FONTE DE DADOS UNICA (IA-R8): tudo vem do `useBrandStore`. As leituras
 * independentes que `RulesSection` e `InboxList` faziam sozinhas foram
 * eliminadas. Duas listas de Pixel divergentes na mesma sessao, num produto
 * que envia conversao real, e risco de mandar a venda para o destino errado.
 *
 * O RISCO DESSA CENTRALIZACAO, e como ele e tratado aqui: passar a depender
 * do store cria uma ordem de carregamento nova, e store vazio na primeira
 * renderizacao apareceria como seletor sem nenhuma opcao — indistinguivel de
 * "nao ha Pixel nenhum". Por isso este componente NUNCA mostra lista vazia em
 * silencio: enquanto nao ha resposta ele diz que esta carregando, se a leitura
 * falhou ele diz que falhou e oferece tentar de novo, e se realmente nao ha
 * Pixel ele diz isso com todas as letras e aponta o caminho de cadastrar.
 */

/** Motivo, escrito, de um Pixel aparecer desabilitado (IA-R10 / P21). */
const MOTIVO_SEM_TOKEN = 'sem token — nada sai por aqui';

/**
 * O nome de um Pixel para leitura humana, com desfecho honesto quando ele nao
 * existe mais (8.B).
 *
 * Nunca devolve o `id` interno (`marca_lx8k2p`): ele nao significa nada para
 * ninguem e aparecia justo quando a informacao mais importa — no historico de
 * um disparo cujo Pixel foi apagado. O numero devolvido e o ID do Pixel, que e
 * rastreavel no Gerenciador de Eventos da Meta.
 *
 * Registro antigo, gravado antes de o ID do Pixel ser guardado junto: devolve
 * "Pixel removido" sem numero, e nao quebra.
 */
export function nomeDoPixel(
  marca: Pick<MarcaPublica, 'nome'> | undefined,
  pixelId?: string
): string {
  if (marca) return marca.nome;
  const numero = pixelId?.trim();
  return numero ? `Pixel removido (${numero})` : 'Pixel removido';
}

interface PropsComuns {
  /** Id do controle. Em `modo="unico"` liga o rotulo ao gatilho do Select. */
  id?: string;
  /** Rotulo visivel. Em `modo="varios"` e a `legend` do `fieldset`. */
  rotulo?: string;
  className?: string;
}

export type SeletorDePixelProps = PropsComuns &
  (
    | { modo: 'unico'; valor: string; onChange: (id: string) => void }
    | { modo: 'varios'; valor: string[]; onChange: (ids: string[]) => void }
  );

export function SeletorDePixel(props: SeletorDePixelProps) {
  const { id, rotulo, className } = props;

  const marcas = useBrandStore((s) => s.marcas);
  const carregado = useBrandStore((s) => s.carregado);
  const erro = useBrandStore((s) => s.erro);
  const carregar = useBrandStore((s) => s.carregar);

  // Uma leitura por sessao de tela. O estado e lido de `getState()` e nao das
  // dependencias de proposito: a intencao e "busque se ninguem buscou ainda",
  // e nao "busque de novo toda vez que a lista mudar".
  React.useEffect(() => {
    const atual = useBrandStore.getState();
    if (!atual.carregado && !atual.carregando) void carregar();
  }, [carregar]);

  const rotuloId = id ? `${id}-rotulo` : undefined;
  const textoDoRotulo =
    rotulo ?? (props.modo === 'varios' ? 'Pixels de destino' : 'Pixel de destino');

  /* ---------------------------------------------------------------- */
  /* Os tres estados que NAO podem virar uma lista vazia em silencio   */
  /* ---------------------------------------------------------------- */

  let aviso: React.ReactNode = null;

  if (!carregado) {
    aviso = (
      <RegiaoDeEspera rotulo="Carregando os Pixels">
        <p className="flex items-center gap-2 rounded-control border border-line-strong bg-surface-2 p-2.5 text-caption text-fg-muted">
          <Spinner />
          Carregando os Pixels…
        </p>
      </RegiaoDeEspera>
    );
  } else if (erro) {
    aviso = (
      <Callout tone="danger" icon={AlertTriangle} title="Não foi possível ler os Pixels">
        {erro} Sem esta lista não dá para escolher o destino — e lista vazia aqui
        não quer dizer que não há Pixel.
        <span className="mt-2 block">
          <Button size="sm" variant="outline" onClick={() => void carregar()}>
            Tentar de novo
          </Button>
        </span>
      </Callout>
    );
  } else if (marcas.length === 0) {
    aviso = (
      <Callout tone="warning" icon={Target} title="Nenhum Pixel cadastrado">
        Não existe destino para onde enviar.
        <span className="mt-2 block">
          <Link href="/pixels" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            Cadastrar um Pixel
          </Link>
        </span>
      </Callout>
    );
  }

  /* ---------------------------------------------------------------- */
  /* modo="varios" — N entre N                                         */
  /* ---------------------------------------------------------------- */

  if (props.modo === 'varios') {
    const { valor, onChange } = props;
    return (
      <fieldset className={cn('flex min-w-0 flex-col gap-2', className)}>
        <legend className="mb-1 text-label font-medium text-fg-body">
          {textoDoRotulo}
        </legend>
        {aviso ?? (
          <div className="flex flex-col gap-2">
            {marcas.map((m) => {
              const marcado = valor.includes(m.id);
              // Sem token o Pixel nao pode virar destino NOVO. Continua podendo
              // ser desmarcado quando ja estava la: travar os dois lados
              // deixaria uma regra presa num destino que nao recebe nada.
              const travado = !m.temToken && !marcado;
              return (
                <label
                  key={m.id}
                  className={cn(
                    'flex min-w-0 cursor-pointer items-center gap-2.5 rounded-control border border-line-strong bg-surface-2 p-2.5 text-caption text-fg-body',
                    travado && 'cursor-not-allowed'
                  )}
                >
                  <Checkbox
                    checked={marcado}
                    disabled={travado}
                    onCheckedChange={(v) =>
                      onChange(v ? [...valor, m.id] : valor.filter((x) => x !== m.id))
                    }
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-label font-medium text-fg-body">
                      {m.nome}
                    </span>
                    <span className="wrap-token font-mono text-caption text-fg-muted tabular">
                      {m.pixelId || 'sem ID de Pixel'}
                    </span>
                  </span>
                  {m.testCode?.trim() ? <Badge variant="aviso">teste</Badge> : null}
                  {!m.temToken && <Badge variant="perigo">{MOTIVO_SEM_TOKEN}</Badge>}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
    );
  }

  /* ---------------------------------------------------------------- */
  /* modo="unico" — um entre N                                         */
  /* ---------------------------------------------------------------- */

  const { valor, onChange } = props;
  const escolhida = marcas.find((m) => m.id === valor);

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <p id={rotuloId} className="text-label font-medium text-fg-body">
        {textoDoRotulo}
      </p>
      {aviso ?? (
        <Select value={valor} onValueChange={(v) => v && onChange(v as string)}>
          <SelectTrigger
            id={id}
            aria-labelledby={rotuloId}
            className="h-auto w-full py-2 whitespace-normal"
          >
            <span className="flex min-w-0 flex-col items-start text-left">
              <span className="truncate text-title font-medium text-fg-strong">
                {escolhida ? escolhida.nome : 'Escolher Pixel'}
              </span>
              <span className="wrap-token font-mono text-caption text-fg-muted tabular">
                {escolhida?.pixelId || '—'}
              </span>
            </span>
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {marcas.map((m) => (
              <SelectItem key={m.id} value={m.id} disabled={!m.temToken}>
                <span className="flex min-w-0 flex-col">
                  <span className="text-label font-medium text-fg-body">{m.nome}</span>
                  <span className="wrap-token font-mono text-caption text-fg-muted tabular">
                    {m.pixelId || 'sem ID de Pixel'}
                  </span>
                  {!m.temToken && (
                    <span className="text-caption text-danger">{MOTIVO_SEM_TOKEN}</span>
                  )}
                  {m.testCode?.trim() ? (
                    <span className="text-caption text-warning">
                      código de teste — nada conta como conversão real
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export default SeletorDePixel;
