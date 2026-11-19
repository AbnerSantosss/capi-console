'use client';

import * as React from 'react';
import { Menu } from '@base-ui/react/menu';
import {
  AlertTriangle,
  Check,
  Copy,
  Inbox,
  Lock,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
} from '@/components/ui/icones';

import type { MarcaPublica } from '@/stores/useBrandStore';
import { Callout } from '@/components/common/primitives';
import { LinhaDaLista } from '@/components/common/ListaEmLinhas';
import type { AvisoDeRecusa } from '@/lib/erro-meta';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MetaGlyph } from '@/components/ui/brand-icons';
import { estadoDePixel, type FaixaDePixel } from '@/components/pixels/estado-pixel';
import { cn } from '@/lib/utils';

/**
 * Um Pixel, em linha da lista (redesenho de 18/11/2026, composicao 3.3).
 *
 * A linha fechada responde SEM UM CLIQUE: qual Pixel recebe o envio manual,
 * se ele tem token guardado, em que estado esta e a chave do envio automatico.
 * O estado e dito UMA vez por linha:
 *
 *   inicio   o logotipo da Meta;
 *   titulo   o nome + o selo "Usado no envio manual" (so um Pixel o leva);
 *   detalhe  o ID copiavel, "Token salvo" / "Falta o token" e o estado em
 *            palavra quando esta tudo normal (Tudo certo / Só acumulando fila);
 *   fim      a chave do automatico, "Editar" em contorno e o menu `⋯`.
 *
 * Embaixo da linha so abre o que precisa de voce: sem token ("Colar o token"),
 * automatico ligado sem regra (o proximo passo, ESCRITO), modo teste e recusa
 * da Meta. Fora isso a linha fica fechada.
 *
 * As regras de 8.2.2 que continuam valendo:
 *   PX-2  o ID do Pixel copia com um clique e usa `.wrap-token`.
 *   PX-3  o estado nomeado aparece sempre, com icone + cor + TEXTO. A
 *         explicacao verbatim de `estado-pixel.ts` fica no `title`.
 *   PX-4  o valor da credencial nunca aparece, nem mascarado. So o estado dela.
 *   PX-5  codigo de teste preenchido e AVISO, nao valor neutro.
 *   PX-7  um so Pixel leva o selo "Usado no envio manual".
 *   PX-8  nenhuma acao destrutiva no corpo: Apagar so no menu `⋯`.
 *   PX-9  o Pixel `default` nao tem "Apagar" (trava de config-store).
 *
 * O `id` interno da marca (`marca_lx8k2p`) NUNCA aparece como texto (C7 / IA-R9).
 * Ele existe aqui so como alvo de rolagem da ancora `/pixels#marca_...`.
 */

/* ------------------------------------------------------------------ */
/* O estado nomeado — icone + cor + texto, nunca so cor               */
/* ------------------------------------------------------------------ */

const VISUAL: Record<FaixaDePixel, { Icone: React.ElementType; texto: string }> = {
  'sem-token': { Icone: Lock, texto: 'text-danger' },
  'so-fila': { Icone: Inbox, texto: 'text-fg-muted' },
  'ligado-sem-regra': { Icone: AlertTriangle, texto: 'text-warning' },
  disparando: { Icone: Send, texto: 'text-success' },
};

const ITEM_DO_MENU =
  'flex cursor-default items-center gap-2 rounded-control border-l-2 border-transparent px-2 py-1.5 text-body outline-none select-none';

/* ------------------------------------------------------------------ */

export interface CardDePixelProps {
  marca: MarcaPublica;
  /** E o Pixel para onde o envio manual esta apontando agora (PX-7). */
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
   * A linha NAO confirma nada e NAO grava nada: a confirmacao de 9.7.1 cita
   * o nome do Pixel e as regras em `auto`, e quem tem as duas coisas e a
   * pagina. C-4 — ligar confirma, desligar nao, e essa assimetria mora la,
   * num lugar so, para nao ser reinventada em cada linha.
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
  /**
   * M-01 — a Meta recusou envios deste Pixel e ainda nao aceitou nenhum
   * depois. Ausente ou `null` = sem aviso. O texto vem pronto de
   * `src/lib/erro-meta.ts`; a linha nao escreve frase.
   */
  recusa?: AvisoDeRecusa | null;
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
  recusa = null,
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
  const comConta = Boolean(marca.adAccountId?.trim());

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

  const { Icone, texto: corDoEstado } = VISUAL[estado.faixa];

  // O estado em palavra, dito uma vez. Nas faixas que pedem uma acao ele abre
  // embaixo da linha (com a acao do lado); nas normais ele fica no detalhe.
  const abreEmbaixo = estado.faixa === 'sem-token' || estado.faixa === 'ligado-sem-regra';
  const precisaDeLinhaAberta = abreEmbaixo || emTeste || Boolean(recusa);
  const temMenu = !ativo || Boolean(onApagar);

  const estadoNoDetalhe = (() => {
    if (estado.faixa === 'so-fila') {
      return (
        <span className={cn('inline-flex items-center gap-1', corDoEstado)}>
          <Icone className="size-4 shrink-0" aria-hidden />
          {estado.rotulo}
        </span>
      );
    }
    if (estado.faixa === 'disparando') {
      // Sem recusa da Meta: "Tudo certo". Com recusa, o nome do estado — a
      // linha aberta embaixo diz o que fazer.
      return (
        <span className={cn('inline-flex items-center gap-1', corDoEstado)}>
          {recusa ? (
            <Icone className="size-4 shrink-0" aria-hidden />
          ) : (
            <Check className="size-4 shrink-0" aria-hidden />
          )}
          {recusa ? estado.rotulo : 'Tudo certo'}
        </span>
      );
    }
    return null;
  })();

  return (
    <LinhaDaLista
      // A ancora de /pixels#marca_abc (IA-R4) vai no <span id> do titulo: a
      // linha ja e um <li> e nao recebe `id`.
      inicio={<MetaGlyph size={24} />}
      titulo={
        <span id={marca.id} className="scroll-mt-24">
          {marca.nome}
          {/* PX-7 — so o Pixel do envio manual recebe este selo. */}
          {ativo && (
            <>
              {' '}
              <Badge variant="info">Usado no envio manual</Badge>
            </>
          )}
        </span>
      }
      detalhe={
        <>
          {marca.pixelId ? (
            <button
              type="button"
              onClick={() => void copiarPixelId()}
              // PX-2 — um clique copia. O alvo e o proprio numero: e ele que
              // o operador compara com o Gerenciador de Eventos da Meta.
              className="inline-flex max-w-full items-center gap-1 rounded-control align-middle text-fg-muted transition-colors hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
              aria-label={`Copiar o ID do Pixel ${marca.pixelId}`}
            >
              <span className="wrap-token font-mono tabular">{marca.pixelId}</span>
              {copiado ? (
                <Check className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <Copy className="size-4 shrink-0" aria-hidden />
              )}
            </button>
          ) : (
            <span className="text-danger">Sem número de Pixel nada chega à Meta.</span>
          )}
          {' · '}
          {marca.temToken ? (
            <span className="text-success">Token salvo</span>
          ) : (
            <span className="text-danger">Falta o token</span>
          )}
          {estadoNoDetalhe && (
            <>
              {' · '}
              {estadoNoDetalhe}
            </>
          )}
          {!comConta && ' · Sem conta de anúncios'}
          {/* O aviso de copia vai por regiao viva, e nao por toast: quem usa
              teclado precisa ouvir a confirmacao sem perder o foco do botao. */}
          <span role="status" aria-live="polite" className="sr-only">
            {copiado ? 'ID do Pixel copiado.' : ''}
          </span>
        </>
      }
      fim={
        <>
          {/* O Switch fica na linha, nunca no menu `⋯` ou num tooltip (C-5): e
              o controle que faz conversao real sair sem ninguem clicar. O
              `title` guarda a explicacao verbatim do estado (PX-3), com a
              posicao da chave em palavra antes dela. */}
          <Switch
            title={`${autoLigado ? 'Ligado' : 'Desligado'}: ${estado.explicacao}`}
            checked={autoLigado}
            disabled={!marca.temToken}
            salvando={salvandoAuto}
            onCheckedChange={(v) => onAlternarAuto(v)}
            rotulo="Envio automático"
            descricao={
              pixelUnico
                ? 'Único Pixel: tudo que tem regra vai por ele.'
                : 'Manda para a Meta sozinho.'
            }
          />

          <Button size="sm" variant="outline" onClick={onEditar}>
            <Pencil className="size-4" aria-hidden />
            Editar
          </Button>

          {/* PX-8 / PX-9 — Apagar SO no menu; o `default` chega sem
              `onApagar`. "Usar no envio manual" (8.3.4) mora aqui tambem e
              some quando o Pixel ja e o usado: usar o que ja esta em uso nao
              e acao. Sem nenhum dos dois, o menu nem e desenhado. */}
          {temMenu && (
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
                    {!ativo && (
                      <Menu.Item
                        onClick={onUsar}
                        className={cn(
                          ITEM_DO_MENU,
                          'text-fg-strong data-highlighted:border-tinta-texto data-highlighted:bg-surface-2'
                        )}
                      >
                        <Send className="size-4" aria-hidden />
                        Usar no envio manual
                      </Menu.Item>
                    )}
                    {onApagar && (
                      <Menu.Item
                        onClick={onApagar}
                        className={cn(
                          ITEM_DO_MENU,
                          'text-danger data-highlighted:border-danger data-highlighted:bg-danger/15'
                        )}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Apagar Pixel
                      </Menu.Item>
                    )}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          )}
        </>
      }
    >
      {precisaDeLinhaAberta && (
        <div className="flex flex-col gap-3">
          {/* PX-3 — o estado nomeado, so quando pede uma acao. A explicacao
              verbatim fica no `title`, com a posicao do Switch em palavra. */}
          {abreEmbaixo && (
            <div
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
              title={`${autoLigado ? 'Ligado' : 'Desligado'}: ${estado.explicacao}`}
            >
              <p className={cn('flex items-center gap-2 text-label font-semibold', corDoEstado)}>
                <Icone className="size-4 shrink-0" aria-hidden />
                {estado.rotulo}
              </p>
              {estado.faixa === 'sem-token' && (
                <Button size="sm" variant="outline" onClick={onEditar}>
                  Colar o token
                </Button>
              )}
            </div>
          )}

          {/* T-M21 — ligado e sem regra: o próximo passo vem escrito aqui,
              sem botão que leve a outra aba. */}
          {estado.faixa === 'ligado-sem-regra' && (
            <p className="text-caption text-fg-body">
              Falta a regra. Na aba Regras, ponha em Automático a regra de cada
              evento que deve sair sozinho.
            </p>
          )}

          {/* PX-5 — codigo de teste preenchido nao e valor neutro: e o estado
              que custa dias de venda nao atribuida quando passa despercebido.
              Selo de teste (violeta, tracejado), parado. */}
          {emTeste && (
            <p className="inline-flex w-fit flex-wrap items-center gap-x-2 rounded-control border border-dashed border-chart-4/70 bg-chart-4/10 px-2.5 py-1 text-caption font-semibold text-chart-4">
              Em modo teste: só aparece em Testar eventos.
              <span className="wrap-token font-mono font-normal">{marca.testCode}</span>
            </p>
          )}

          {/* M-01 — a Meta recusou envios deste Pixel. Uma acao so: abrir a
              edicao do Pixel, que e onde o token e trocado. O valor do token
              nunca aparece aqui (PX-4). */}
          {recusa && (
            <Callout tone="danger" icon={AlertTriangle} title={recusa.titulo}>
              <p>{recusa.texto}</p>
              <Button size="sm" variant="outline" onClick={onEditar} className="mt-2">
                {recusa.acao}
              </Button>
            </Callout>
          )}
        </div>
      )}
    </LinhaDaLista>
  );
}

export default CardDePixel;
