'use client';

import * as React from 'react';
import { Menu } from '@base-ui/react/menu';
import {
  AlertTriangle,
  Check,
  Copy,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  ShieldAlert,
  Trash2,
  Zap,
} from '@/components/ui/icones';

import type { MarcaPublica } from '@/stores/useBrandStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MetaGlyph } from '@/components/ui/brand-icons';
import { estadoDePixel, type FaixaDePixel } from '@/components/pixels/estado-pixel';
import { cn } from '@/lib/utils';

/**
 * Um Pixel, em cartao — nao em linha de tabela (7.3.2).
 *
 * O cartao existe para que `/pixels` responda SEM UM CLIQUE: quantos Pixels
 * existem, qual esta ativo, qual tem credencial guardada, qual esta em modo de
 * teste e o que cada um esta fazendo agora (8.4, alteracao 8.A). Antes disto a
 * unica lista morava dentro de um modal fechado, e um Pixel em modo de teste —
 * que significa NENHUMA conversao real — era um selo minusculo la dentro.
 *
 * As nove regras de 8.2.2, e onde cada uma esta:
 *   PX-1  nome em `text-title`, ID do Pixel em `text-caption` mono logo abaixo,
 *         no MESMO bloco: e uma identidade, nao dois rotulos (8.B).
 *   PX-2  o ID do Pixel copia com um clique e usa `.wrap-token`.
 *   PX-3  o estado nomeado aparece sempre, com icone + cor + TEXTO.
 *   PX-4  o valor da credencial nunca aparece, nem mascarado. So o estado dela.
 *   PX-5  codigo de teste preenchido e AVISO em `--warning`, com a consequencia
 *         escrita — nao um valor neutro.
 *   PX-6  rodape com divisoria; o Switch de disparo automatico e o ultimo
 *         bloco do cartao (FASE 6, alteracao 9.C).
 *   PX-7  um so cartao marcado "Ativo".
 *   PX-8  nenhuma acao destrutiva no corpo: Editar e Apagar so no menu `⋯`.
 *   PX-9  o cartao do Pixel `default` nao tem "Apagar" (trava de config-store).
 *
 * O `id` interno da marca (`marca_lx8k2p`) NUNCA aparece como texto (C7 / IA-R9).
 * Ele existe aqui so como alvo de rolagem da ancora `/pixels#marca_...`.
 */

/* ------------------------------------------------------------------ */
/* O estado nomeado — icone + cor + texto, nunca so cor               */
/* ------------------------------------------------------------------ */

const VISUAL: Record<
  FaixaDePixel,
  { Icone: React.ElementType; texto: string; caixa: string }
> = {
  'sem-token': {
    Icone: ShieldAlert,
    texto: 'text-danger',
    caixa: 'border-danger/40 bg-danger/8',
  },
  'so-fila': {
    Icone: PauseCircle,
    texto: 'text-fg-muted',
    caixa: 'border-line-strong bg-surface-2',
  },
  'ligado-sem-regra': {
    Icone: AlertTriangle,
    texto: 'text-warning',
    caixa: 'border-warning/40 bg-warning/8',
  },
  disparando: {
    Icone: Zap,
    texto: 'text-success',
    caixa: 'border-success/40 bg-success/8',
  },
};

/* ------------------------------------------------------------------ */
/* Linha de detalhe — rotulo a esquerda, valor a direita              */
/* ------------------------------------------------------------------ */

function Detalhe({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1">
      <dt className="text-caption text-fg-muted">{rotulo}</dt>
      <dd className="min-w-0 text-caption text-fg-body">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface CardDePixelProps {
  marca: MarcaPublica;
  /** E o Pixel para onde o disparo manual esta apontando agora (PX-7). */
  ativo: boolean;
  /**
   * Quantas regras ATIVAS em modo `auto` apontam para este Pixel. Decide entre
   * 🟡 e 🟢 — e so isso, porque 🔴 e ⚪ vencem antes (8.2.3).
   */
  regrasAuto: number;
  onUsar: () => void;
  onEditar: () => void;
  /**
   * O operador pediu para ligar (true) ou desligar (false) o automatico.
   *
   * O cartao NAO confirma nada e NAO grava nada: a confirmacao de 9.7.1 cita
   * o nome do Pixel e a contagem real de regras em `auto`, e quem tem as duas
   * coisas e a pagina. C-4 — ligar confirma, desligar nao, e essa assimetria
   * mora la, num lugar so, para nao ser reinventada em cada cartao.
   */
  onAlternarAuto: (ligado: boolean) => void;
  /** C-6 — verdadeiro enquanto o PUT deste Pixel nao respondeu. */
  salvandoAuto?: boolean;
  /** 9.7.2 — este e o unico Pixel cadastrado. A tela admite a redundancia. */
  pixelUnico?: boolean;
  /**
   * Ausente quando o Pixel nao pode ser apagado. O `default` e o caso: e a
   * trava de config-store.ts, nao uma decisao de tela — nao a contorne aqui.
   */
  onApagar?: () => void;
}

export function CardDePixel({
  marca,
  ativo,
  regrasAuto,
  onUsar,
  onEditar,
  onAlternarAuto,
  salvandoAuto = false,
  pixelUnico = false,
  onApagar,
}: CardDePixelProps) {
  const [copiado, setCopiado] = React.useState(false);
  const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    []
  );

  const copiarPixelId = async () => {
    if (!marca.pixelId) return;
    try {
      await navigator.clipboard.writeText(marca.pixelId);
      setCopiado(true);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard bloqueado (http, permissao negada) — o numero segue legivel */
    }
  };

  const emTeste = Boolean(marca.testCode?.trim());

  // 🔴 COSTURA DA FASE 6, FECHADA. `=== true` e a UNICA leitura aceita do
  // campo (decisao irreversivel #12 / §9.5.1 regra 1) — e aqui ela e quase
  // redundante de proposito: `MarcaPublica.autoDisparo` ja chega do servidor
  // normalizado por `publicarMarca()`. Quase, e nao totalmente: o dia em que
  // alguem afrouxar o tipo do cliente, esta linha continua desligada.
  //
  // PROIBIDOS aqui e em qualquer outro lugar: `!!marca.autoDisparo`,
  // `marca.autoDisparo ?? true`, `marca.autoDisparo !== false`. Os tres leem
  // "campo ausente" como "ligado", e campo ausente e o estado de TODOS os
  // Pixels gravados antes desta fase.
  const autoLigado = marca.autoDisparo === true;

  const estado = estadoDePixel({
    temToken: marca.temToken,
    autoDisparo: autoLigado,
    regrasAuto,
  });

  const visual = VISUAL[estado.faixa];
  const { Icone } = visual;

  return (
    <li
      // A ancora de /pixels#marca_abc (IA-R4). O `id` interno so existe como
      // alvo de rolagem; ele NUNCA e mostrado como texto — ver IA-R9.
      id={marca.id}
      className="scroll-mt-24"
    >
      <article
        className={cn(
          'rounded-panel border p-4 transition-colors',
          ativo
            ? 'border-tinta-texto bg-tinta/10'
            : 'border-line-strong bg-surface-1'
        )}
      >
        {/* -------- PX-1 / PX-2 — a identidade, um bloco so -------- */}
        <div className="flex items-start gap-3">
          <MetaGlyph size={36} />

          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-2 text-title font-semibold text-fg-strong">
              {marca.nome}
              {/* PX-7 — so o Pixel do disparo manual recebe este selo. */}
              {ativo && <Badge variant="info">Ativo</Badge>}
            </h3>

            {marca.pixelId ? (
              <button
                type="button"
                onClick={() => void copiarPixelId()}
                // PX-2 — um clique copia. O alvo e o proprio numero: e ele que
                // o operador compara com o Gerenciador de Eventos da Meta.
                className="mt-1 flex max-w-full items-center gap-1.5 rounded-control text-left text-fg-muted transition-colors hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
                aria-label={`Copiar o ID do Pixel ${marca.pixelId}`}
              >
                <span className="wrap-token font-mono text-caption tabular">
                  {marca.pixelId}
                </span>
                {copiado ? (
                  <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                ) : (
                  <Copy className="size-3.5 shrink-0" aria-hidden />
                )}
              </button>
            ) : (
              <p className="mt-1 text-caption text-danger">
                Sem número de Pixel — este destino não existe no Gerenciador da
                Meta.
              </p>
            )}
            {/* O aviso de copia vai por regiao viva, e nao por toast: quem usa
                teclado precisa ouvir a confirmacao sem perder o foco do botao. */}
            <span role="status" aria-live="polite" className="sr-only">
              {copiado ? 'ID do Pixel copiado.' : ''}
            </span>
          </div>

          {/* -------- PX-8 — Editar e Apagar SO aqui dentro -------- */}
          <Menu.Root>
            <Menu.Trigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Ações do Pixel ${marca.nome}`}
                />
              }
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
                <Menu.Popup className="min-w-44 origin-(--transform-origin) rounded-panel border border-line-control bg-surface-3 p-1 shadow-lg outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
                  <Menu.Item
                    onClick={onEditar}
                    className="flex cursor-default items-center gap-2 rounded-control border-l-2 border-transparent px-2 py-1.5 text-body text-fg-body outline-none select-none data-highlighted:border-tinta-texto data-highlighted:bg-tinta/15 data-highlighted:text-fg-strong"
                  >
                    <Pencil className="size-4" aria-hidden />
                    Editar
                  </Menu.Item>
                  {/* PX-9 — o `default` chega aqui sem `onApagar`, e entao o
                      item nem e desenhado. A trava e de config-store.ts: o
                      servidor recusaria de todo jeito, e oferecer o botao so
                      renderia um erro para quem clicou no que a tela ofereceu. */}
                  {onApagar && (
                    <Menu.Item
                      onClick={onApagar}
                      className="flex cursor-default items-center gap-2 rounded-control border-l-2 border-transparent px-2 py-1.5 text-body text-danger outline-none select-none data-highlighted:border-danger data-highlighted:bg-danger/15"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Apagar Pixel
                    </Menu.Item>
                  )}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>

        {/* -------- PX-3 — o estado nomeado, sempre visivel -------- */}
        <div
          className={cn(
            'mt-3 flex items-start gap-2.5 rounded-control border p-3',
            visual.caixa
          )}
        >
          <Icone className={cn('mt-0.5 size-4 shrink-0', visual.texto)} aria-hidden />
          <div className="min-w-0">
            <p className={cn('text-label font-semibold', visual.texto)}>
              {estado.rotulo}
            </p>
            {/* A2 — a explicacao fica SEMPRE visivel, nunca em tooltip. */}
            <p className="mt-1 text-caption text-fg-body">{estado.explicacao}</p>
          </div>
        </div>

        {/* -------- PX-4 / PX-5 — os tres fatos do Pixel -------- */}
        <dl className="mt-3 divide-y divide-line">
          {/* PX-4 — o valor guardado NUNCA aparece, nem mascarado. O cliente
              nem o recebe: `MarcaPublica` traz `temToken: boolean` e mais nada
              (decisao irreversivel #8). Aqui so cabe o estado dele. */}
          <Detalhe rotulo="Token de acesso">
            {marca.temToken ? (
              <span className="font-medium text-success">✓ Configurado</span>
            ) : (
              <span className="font-medium text-danger">Sem token</span>
            )}
          </Detalhe>

          <Detalhe rotulo="Código de teste">
            {emTeste ? (
              <span className="font-mono text-warning">{marca.testCode}</span>
            ) : (
              <span className="text-fg-muted">— enviando de verdade</span>
            )}
          </Detalhe>

          <Detalhe rotulo="Conta de anúncios">
            {marca.adAccountId?.trim() ? (
              <span className="wrap-token font-mono tabular">
                {marca.adAccountId}
              </span>
            ) : (
              <span className="text-fg-muted">
                — links do Gerenciador indisponíveis
              </span>
            )}
          </Detalhe>
        </dl>

        {/* PX-5 — codigo de teste preenchido nao e um valor neutro: e o estado
            que custa dias de venda nao atribuida quando passa despercebido. Por
            isso o aviso e um bloco em `--warning` com a consequencia escrita, e
            nao so a cor da linha acima. */}
        {emTeste && (
          <div className="mt-3 flex items-start gap-2.5 rounded-control border border-warning/40 bg-warning/8 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="min-w-0 text-caption text-fg-body">
              <span className="font-semibold text-warning">
                Nada que este Pixel receber conta como conversão real.
              </span>{' '}
              Com o código de teste preenchido, os eventos aparecem apenas em
              Testar eventos, no Gerenciador da Meta: não entram nas métricas da
              campanha e não ensinam o algoritmo. Apague o código de teste
              quando terminar de conferir.
            </p>
          </div>
        )}

        {/* -------- PX-6 — o rodape -------- */}
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {ativo ? (
              <p className="text-caption text-fg-muted">
                É para este Pixel que o disparo manual aponta agora.
              </p>
            ) : (
              <p className="text-caption text-fg-muted">
                O disparo manual está apontando para outro Pixel.
              </p>
            )}

            {/* 8.3.4 — trocar o Pixel ativo. Some quando ja e o ativo, porque
                usar o que ja esta em uso nao e acao. */}
            {!ativo && (
              <Button
                size="sm"
                variant="outline"
                onClick={onUsar}
                aria-label={`Usar ${marca.nome} no disparo manual`}
              >
                Usar neste disparo
              </Button>
            )}
          </div>

          {/* O Switch de disparo automatico DESTE Pixel — ultimo bloco do
              cartao (PX-6 / alteracao 9.C). Ele fica aqui, no corpo, e nunca
              dentro do menu `⋯` ou de um tooltip (C-5): e o controle que faz
              conversao real sair sem ninguem clicar, e um controle assim nao
              se esconde atras de um hover. */}
          <div className="mt-3 border-t border-line pt-3">
            <Switch
              checked={autoLigado}
              disabled={!marca.temToken}
              salvando={salvandoAuto}
              onCheckedChange={(v) => onAlternarAuto(v)}
              rotulo="Disparo automático"
              descricao="Eventos que casarem com uma regra automática vão para a Meta sem você fazer nada."
              rodape={
                <div className="flex flex-col gap-1.5 text-caption text-fg-muted">
                  {/* RD-21 — nada de controle cinza e mudo. Se nao da para
                      ligar, a tela diz por que na mesma linha do controle. */}
                  {!marca.temToken && (
                    <p className="text-danger">
                      Só é possível ligar depois que este Pixel tiver um token
                      de acesso — sem token nada sai para a Meta.
                    </p>
                  )}

                  {/* 9.7.2 — honestidade explicita. A tela nao finge uma
                      granularidade que ainda nao existe. */}
                  {pixelUnico && (
                    <p>
                      Você tem um único Pixel configurado. Enquanto for assim,
                      este botão equivale a ligar ou desligar o automático do
                      sistema inteiro.
                    </p>
                  )}

                  {/* O terceiro estado de 9.C dito onde a acao acontece: ligado
                      e sem nenhuma regra em `auto` nao e "funcionando". */}
                  {autoLigado && marca.temToken && regrasAuto === 0 && (
                    <p className="text-warning">
                      Ligado, mas nenhuma regra está no modo automático — então
                      nada sai sozinho ainda.
                    </p>
                  )}
                </div>
              }
            />
          </div>
        </div>
      </article>
    </li>
  );
}

export default CardDePixel;
