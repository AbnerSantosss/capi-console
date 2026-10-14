'use client';

import * as React from 'react';
import Link from 'next/link';
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
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MetaGlyph } from '@/components/ui/brand-icons';
import { estadoDePixel, type FaixaDePixel } from '@/components/pixels/estado-pixel';
import { cn } from '@/lib/utils';

/**
 * Um Pixel, em cartao — nao em linha de tabela (7.3.2).
 *
 * O cartao responde SEM UM CLIQUE: qual Pixel recebe o envio manual, qual tem
 * credencial guardada, qual esta em modo de teste e o que cada um esta fazendo
 * agora (8.4). Quatro linhas (E4 do plano HyperFrames):
 *
 *   1. nome + ID do Pixel copiavel + selo "Usado no envio manual";
 *   2. o Switch do envio automatico, com o estado nomeado logo abaixo
 *      (icone ESTATICO + palavra + cor);
 *   3. UMA saida, conforme o estado: "Colar o token", "Abrir Regras" ou
 *      "Tudo certo" (desligado nao tem: o Switch ja e a acao);
 *   4. o resumo dos dados numa linha + "Editar".
 *
 * As regras de 8.2.2 que continuam valendo:
 *   PX-2  o ID do Pixel copia com um clique e usa `.wrap-token`.
 *   PX-3  o estado nomeado aparece sempre, com icone + cor + TEXTO. A
 *         explicacao verbatim de `estado-pixel.ts` fica no `title` da linha.
 *   PX-4  o valor da credencial nunca aparece, nem mascarado. So o estado dela.
 *   PX-5  codigo de teste preenchido e AVISO, nao valor neutro.
 *   PX-7  um so cartao leva o selo "Usado no envio manual" (o antigo "Ativo"
 *         se confundia com "Ligado"; o "Envio manual" seco, de 14/10, parecia
 *         um modo e desmentia o "Envio automatico: Ligado" do mesmo cartao).
 *   PX-8  nenhuma acao destrutiva no corpo: Apagar so no menu `⋯`.
 *   PX-9  o cartao do Pixel `default` nao tem "Apagar" (trava de config-store).
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
  /** A aba Regras da empresa do endereço, para "Abrir Regras". */
  hrefRegras?: string | null;
  /**
   * O operador pediu para ligar (true) ou desligar (false) o automatico.
   *
   * O cartao NAO confirma nada e NAO grava nada: a confirmacao de 9.7.1 cita
   * o nome do Pixel e as regras em `auto`, e quem tem as duas coisas e a
   * pagina. C-4 — ligar confirma, desligar nao, e essa assimetria mora la,
   * num lugar so, para nao ser reinventada em cada cartao.
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
  hrefRegras = null,
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

  /** Linha 3 — a única saída do estado. Desligado não tem: o Switch é a ação. */
  let saida: React.ReactNode = null;
  if (estado.faixa === 'sem-token') {
    saida = (
      <Button size="sm" variant="outline" onClick={onEditar}>
        Colar o token
      </Button>
    );
  } else if (estado.faixa === 'ligado-sem-regra' && hrefRegras) {
    saida = (
      <Link href={hrefRegras} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Abrir Regras
      </Link>
    );
  } else if (estado.faixa === 'disparando') {
    saida = (
      <span className="inline-flex items-center gap-1 text-caption font-semibold text-success">
        <Check className="size-3.5" aria-hidden />
        Tudo certo
      </span>
    );
  }

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
        {/* -------- Linha 1 — a identidade, um bloco so -------- */}
        <div className="flex items-start gap-3">
          <MetaGlyph size={32} />

          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-2 text-title font-semibold text-fg-strong">
              {marca.nome}
              {/* PX-7 — so o Pixel do envio manual recebe este selo. */}
              {ativo && <Badge variant="info">Usado no envio manual</Badge>}
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
                Sem número de Pixel nada chega à Meta.
              </p>
            )}
            {/* O aviso de copia vai por regiao viva, e nao por toast: quem usa
                teclado precisa ouvir a confirmacao sem perder o foco do botao. */}
            <span role="status" aria-live="polite" className="sr-only">
              {copiado ? 'ID do Pixel copiado.' : ''}
            </span>
          </div>

          {/* -------- PX-8 / PX-9 — Apagar SO no menu; o `default` chega sem
              `onApagar`, e entao o menu nem e desenhado. A trava e de
              config-store.ts: o servidor recusaria de todo jeito. -------- */}
          {onApagar && (
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
                      onClick={onApagar}
                      className="flex cursor-default items-center gap-2 rounded-control border-l-2 border-transparent px-2 py-1.5 text-body text-danger outline-none select-none data-highlighted:border-danger data-highlighted:bg-danger/15"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Apagar Pixel
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          )}
        </div>

        {/* PX-5 — codigo de teste preenchido nao e valor neutro: e o estado
            que custa dias de venda nao atribuida quando passa despercebido.
            Selo de teste (violeta, tracejado), parado. */}
        {emTeste && (
          <p className="mt-3 inline-flex items-center rounded-control border border-dashed border-chart-4/70 bg-chart-4/10 px-2.5 py-1 text-caption font-semibold text-chart-4">
            Em modo teste: só aparece em Testar eventos.
          </p>
        )}

        {/* -------- Linhas 2 e 3 — o Switch e, logo abaixo, o estado e a
            unica saida. O Switch fica no corpo, nunca no menu `⋯` ou num
            tooltip (C-5): e o controle que faz conversao real sair sem
            ninguem clicar. -------- */}
        <div className="mt-3 border-t border-line pt-3">
          <Switch
            checked={autoLigado}
            disabled={!marca.temToken}
            salvando={salvandoAuto}
            onCheckedChange={(v) => onAlternarAuto(v)}
            rotulo="Envio automático"
            descricao="Manda para a Meta sozinho."
            rodape={
              <div className="flex flex-col gap-1.5">
                {/* PX-3 — o estado nomeado. A explicacao verbatim fica no
                    `title`, com a posicao do Switch em palavra antes dela. */}
                <div
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
                  title={`${autoLigado ? 'Ligado' : 'Desligado'}: ${estado.explicacao}`}
                >
                  <p className={cn('flex items-center gap-1.5 text-label font-semibold', corDoEstado)}>
                    <Icone className="size-4 shrink-0" aria-hidden />
                    {estado.rotulo}
                  </p>
                  {saida}
                </div>
                {/* 9.7.2 — honestidade explicita: com um Pixel so, o Switch
                    equivale ao automatico da empresa inteira. */}
                {pixelUnico && (
                  <p className="text-caption text-fg-muted">
                    É o seu único Pixel: ao ligar, tudo que tem regra vai por ele.
                  </p>
                )}
              </div>
            }
          />
        </div>

        {/* -------- Linha 4 — o resumo dos dados + Editar -------- */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3">
          {/* PX-4 — o valor guardado NUNCA aparece, nem mascarado. O cliente
              nem o recebe: `MarcaPublica` traz `temToken: boolean` e mais
              nada (decisao irreversivel #8). */}
          <p className="min-w-0 flex-1 basis-48 text-caption text-fg-muted">
            {marca.temToken ? (
              <span className="font-medium text-success">Token ✓</span>
            ) : (
              <span className="font-medium text-danger">Sem token</span>
            )}
            {' · '}
            {emTeste ? (
              <span className="wrap-token font-mono text-chart-4">{marca.testCode}</span>
            ) : (
              'Sem código: vai para valer'
            )}
            {' · '}
            {comConta ? (
              <span className="wrap-token font-mono tabular">{marca.adAccountId}</span>
            ) : (
              'Sem conta: os links da Meta não abrem'
            )}
          </p>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* 8.3.4 — trocar o Pixel do envio manual. Some quando ja e ele,
                porque usar o que ja esta em uso nao e acao. */}
            {!ativo && (
              <Button size="sm" variant="secondary" onClick={onUsar}>
                Usar no envio manual
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onEditar}>
              <Pencil className="size-3.5" aria-hidden />
              Editar
            </Button>
          </div>
        </div>
      </article>
    </li>
  );
}

export default CardDePixel;
