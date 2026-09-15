'use client';

/**
 * A chavinha do disparo automático — o primeiro controle de /automatico.
 *
 * Ela existe porque o produto tem DUAS travas e elas moram em telas
 * diferentes:
 *
 *   Trava 1 — a REGRA precisa estar em modo `auto`   (aba Regras, aqui do lado)
 *   Trava 2 — o PIXEL precisa aceitar disparo automático (`Marca.autoDisparo`)
 *
 * Mexer numa só não muda nada. Até agora a trava 2 só tinha interruptor lá em
 * /pixels, dentro do cartão de cada Pixel: quem abria "Disparo automático"
 * mexia nas regras, saía achando que tinha ligado e nada saía. Esta chave é a
 * trava 2 trazida para onde a pergunta é feita, com a contagem da trava 1
 * escrita ao lado — as duas na mesma dobra, sem clique.
 *
 * 🔴 Ela NÃO dispara evento nenhum. O único efeito é gravar `autoDisparo` no
 * Pixel (PUT /api/marcas). Quem envia à Meta continua sendo o caminho do
 * webhook, e só quando as duas travas estiverem sim.
 *
 * 🔴 A leitura do campo é `=== true`, sempre, aqui e em qualquer lugar
 * (decisão irreversível #12 / §9.5.1). PROIBIDOS `!!x`, `x ?? true` e
 * `x !== false`: os três leem "campo ausente" como "ligado", e campo ausente é
 * o estado de todo Pixel gravado antes da FASE 6.
 */

import * as React from 'react';
import { toast } from 'sonner';
import { GitBranch, Zap, ZapOff } from '@/components/ui/icones';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useBrandStore, type MarcaPublica } from '@/stores/useBrandStore';
import {
  contarRegrasAuto,
  estadoDePixel,
  nomesDasRegrasAuto,
} from '@/components/pixels/estado-pixel';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Esqueleto, RegiaoDeEspera } from '@/components/common/Esqueleto';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { RegraRoteamento } from '@/lib/config-store';

export interface ChaveDoAutomaticoProps {
  /**
   * As regras que a página já tem em mãos. Prop, e não leitura própria, porque
   * a aba Regras edita esta MESMA lista: lendo de um store em cache a chave
   * mostraria a contagem de antes de salvar.
   */
  regras: RegraRoteamento[];
  /** Levar para a aba Regras — é lá que a trava 1 se resolve. */
  onIrParaRegras: () => void;
}

export function ChaveDoAutomatico({
  regras,
  onIrParaRegras,
}: ChaveDoAutomaticoProps) {
  const marcas = useBrandStore((s) => s.marcas);
  const marcaAtivaId = useBrandStore((s) => s.marcaAtivaId);
  const carregado = useBrandStore((s) => s.carregado);
  const erro = useBrandStore((s) => s.erro);
  const carregar = useBrandStore((s) => s.carregar);
  const definirAutoDisparo = useBrandStore((s) => s.definirAutoDisparo);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  /** O Pixel esperando confirmação para LIGAR. Só existe nesta direção. */
  const [aLigar, setALigar] = React.useState<MarcaPublica | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  /**
   * O que o operador ACABOU de pedir, enquanto o PUT está em voo.
   *
   * É o que permite a reversão exigida quando a rede falha: o valor pedido
   * aparece na hora, e no erro ele é descartado — a chave volta sozinha para o
   * que o servidor confirma, que é a única verdade que ela pode mostrar.
   */
  const [pedido, setPedido] = React.useState<boolean | null>(null);

  // Enter sem ler não pode ligar envio de conversão real: o foco nasce em
  // "Deixar desligado", nunca no botão que liga.
  const refDeixarDesligado = React.useRef<HTMLButtonElement | null>(null);

  /* ---------------------------------------------------------------- */
  /* Os fatos                                                          */
  /* ---------------------------------------------------------------- */

  // 🔴 `=== true`. Nada de `!!`, `?? true` nem `!== false`.
  const ligadas = marcas.filter((m) => m.autoDisparo === true);
  const ligadoNoServidor = ligadas.length > 0;
  const ligado = pedido ?? ligadoNoServidor;

  /**
   * O Pixel sobre o qual LIGAR age: o mesmo que o resto do console está
   * usando. Escolher outro por conta própria mandaria conversão para o Pixel
   * errado — o erro mais caro que esta tela pode cometer.
   */
  const alvo = marcas.find((m) => m.id === marcaAtivaId) ?? marcas[0];

  /** Quando está ligado, quem descreve o estado são os Pixels ligados. */
  const referencia = ligadoNoServidor ? ligadas[0] : alvo;

  const regrasAutoLigadas = ligadas.reduce(
    (soma, m) => soma + contarRegrasAuto(regras, m.id),
    0
  );
  const regrasAutoDoAlvo = alvo ? contarRegrasAuto(regras, alvo.id) : 0;
  const regrasAuto = ligadoNoServidor ? regrasAutoLigadas : regrasAutoDoAlvo;

  /**
   * Os quatro estados do Pixel, da função pura de `estado-pixel.ts`. Ela é a
   * dona da ordem de avaliação (sem token vence tudo) e dos textos — o aviso
   * âmbar desta chave é a faixa `ligado-sem-regra` dela, não uma segunda
   * cópia da mesma regra escrita aqui.
   */
  const estado = referencia
    ? estadoDePixel({
        temToken: referencia.temToken,
        autoDisparo: ligadoNoServidor,
        regrasAuto,
      })
    : null;

  const semRegraAutomatica = estado?.faixa === 'ligado-sem-regra';
  const podeLigar = Boolean(alvo?.temToken);

  /* ---------------------------------------------------------------- */
  /* Gravação                                                          */
  /* ---------------------------------------------------------------- */

  const aplicar = async (marca: MarcaPublica, ligar: boolean) => {
    setSalvando(true);
    setPedido(ligar);
    try {
      if (ligar) {
        await definirAutoDisparo(marca.id, true);
        setALigar(null);
        toast.success(`Disparo automático ligado em ${marca.nome}.`, {
          description: marca.testCode?.trim()
            ? 'Os eventos saem em modo de teste, para o Testar eventos da Meta.'
            : 'As regras automáticas passam a enviar conversões reais sem passar por você.',
        });
      } else {
        // Desligar desliga TODOS os que estavam ligados. Parar pela metade e
        // dizer "desligado" seria a tela mentindo no estado mais caro.
        for (const m of ligadas) await definirAutoDisparo(m.id, false);
        toast.success('Disparo automático desligado.', {
          description:
            'Os eventos continuam chegando e ficam na fila, esperando você enviar.',
        });
      }
      // O store releu a lista: a verdade volta a ser a do servidor.
      setPedido(null);
    } catch (e) {
      // A chave volta para o estado anterior — ela nunca fica mostrando um
      // automático que o servidor não gravou.
      setPedido(null);
      toast.error(
        e instanceof Error
          ? e.message
          : 'Não foi possível salvar o disparo automático.'
      );
    } finally {
      setSalvando(false);
    }
  };

  /** Ligar confirma; desligar acontece na hora — parar é sempre seguro. */
  const pedirAlternar = (ligar: boolean) => {
    if (!alvo) return;
    if (ligar) setALigar(alvo);
    else void aplicar(alvo, false);
  };

  /* ---------------------------------------------------------------- */
  /* A frase de contexto                                               */
  /* ---------------------------------------------------------------- */

  let contexto: string;
  if (!ligadoNoServidor) {
    contexto =
      'Os eventos continuam chegando e ficam na fila; nada vai para a Meta.';
  } else if (ligadas.length > 1) {
    contexto =
      regrasAutoLigadas === 1
        ? `1 regra automática enviando para ${ligadas.length} Pixels.`
        : `${regrasAutoLigadas} regras automáticas enviando para ${ligadas.length} Pixels.`;
  } else {
    const nome = ligadas[0]?.nome ?? '—';
    contexto =
      regrasAutoLigadas === 1
        ? `1 regra automática enviando para o Pixel ${nome}.`
        : `${regrasAutoLigadas} regras automáticas enviando para o Pixel ${nome}.`;
  }

  const titulo = ligadoNoServidor
    ? 'Disparo automático ligado'
    : 'Disparo automático desligado';

  /* ---------------------------------------------------------------- */
  /* A confirmação de ligar — ela diz o que vai acontecer              */
  /* ---------------------------------------------------------------- */

  const nomesAuto = aLigar ? nomesDasRegrasAuto(regras, aLigar.id) : [];

  let oQueVaiAcontecer: string;
  if (nomesAuto.length === 0) {
    oQueVaiAcontecer =
      'Hoje nenhuma regra está no modo automático, então nada será enviado ainda.';
  } else if (nomesAuto.length === 1) {
    oQueVaiAcontecer = `Hoje 1 regra está no modo automático: ${nomesAuto[0]}.`;
  } else {
    oQueVaiAcontecer = `Hoje ${nomesAuto.length} regras estão no modo automático: ${nomesAuto.join(', ')}.`;
  }

  /* ---------------------------------------------------------------- */

  /**
   * A moldura muda de COR com o estado — pedido literal de quem opera: a chave
   * é o primeiro elemento de /automatico e o estado dela tem de ser legível do
   * outro lado da sala, antes de qualquer leitura.
   *
   * 🔴 Cor é REFORÇO, nunca o portador do estado (SC 1.4.1): o título em texto
   * ("Disparo automático ligado/desligado"), o selo com palavra e o ícone que
   * troca de glifo continuam dizendo tudo sem depender de enxergar a cor.
   *
   * Vermelho no desligado é uma divergência DELIBERADA do selo
   * `pixel-desligado` da caixa de entrada, que é neutro de propósito. Lá o
   * desligado é escolha de rota de um evento; aqui é o produto inteiro parado —
   * venda PIX real entrando na fila e não chegando à Meta. Isso é vermelho.
   *
   * 🔴 A cor segue `ligadoNoServidor`, e não o `ligado` otimista da chavinha:
   * o quadro colorido não pode dizer verde enquanto o título ao lado ainda diz
   * "desligado". Quem dá o retorno imediato do clique é a própria Switch, que
   * já tem estado de `salvando`.
   */
  const MOLDURA_BASE =
    'relative overflow-hidden rounded-panel border bg-surface-1 p-5 shadow-realce sm:p-6 ' +
    'before:absolute before:inset-x-0 before:top-0 before:h-1';

  const moldura = cn(
    MOLDURA_BASE,
    ligadoNoServidor ? 'border-success/50 before:bg-success' : 'border-danger/50 before:bg-danger'
  );

  const IconeDoEstado = ligadoNoServidor ? Zap : ZapOff;

  // A tinta desta área fica no próprio cartão: assim ele nasce violeta mesmo
  // se o <main> da rota ainda não declarar `data-area`.
  //
  // Enquanto carrega a moldura é NEUTRA: pintar de vermelho antes de ler o
  // servidor seria anunciar "desligado" sem saber — e essa é a resposta mais
  // cara desta tela para se errar.
  if (!carregado) {
    return (
      <section
        data-area="automatico"
        className={cn(MOLDURA_BASE, 'border-line-strong before:bg-tinta/70')}
      >
        <RegiaoDeEspera rotulo="Lendo o estado do disparo automático">
          <div className="flex flex-col gap-3">
            <Esqueleto className="h-5 w-56" />
            <Esqueleto className="h-4 w-full max-w-md" />
            <Esqueleto className="h-6 w-28" />
          </div>
        </RegiaoDeEspera>
      </section>
    );
  }

  return (
    <section data-area="automatico" className={moldura}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-control',
            ligadoNoServidor ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger'
          )}
          aria-hidden
        >
          <IconeDoEstado className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          {/* O selo de estado antes de tudo, na cor do estado e com a palavra
              dentro dele — é a leitura de um segundo que o pedido cobrava. */}
          {/* Sem caixa alta: o selo v3 abandonou o `uppercase` de propósito, e
              quem carrega o contraste aqui é a cor, que era o que se pediu. */}
          <Badge variant={ligadoNoServidor ? 'sucesso' : 'perigo'} className="mb-2">
            <IconeDoEstado aria-hidden />
            {ligadoNoServidor ? 'Ligado' : 'Desligado'}
          </Badge>
          <Switch
            checked={ligado}
            disabled={!alvo || (!ligado && !podeLigar)}
            salvando={salvando}
            onCheckedChange={(v) => pedirAlternar(v)}
            rotulo="Disparo automático"
            descricao="Com ele ligado, os eventos que casam com uma regra automática vão para a Meta sem você conferir."
            rodape={
              <div className="flex flex-col gap-2">
                {/* O estado vai em TEXTO, e a troca é anunciada. Quem não
                    distingue as cores e quem usa leitor de tela leem o mesmo
                    que todo mundo. */}
                <p role="status" aria-live="polite" className="text-label">
                  <span className="font-semibold text-fg-strong">{titulo}</span>
                  <span className="text-fg-body"> — {contexto}</span>
                </p>

                {erro && (
                  <p className="text-caption text-danger">
                    Não foi possível ler os Pixels: {erro}
                  </p>
                )}

                {!erro && marcas.length === 0 && (
                  <p className="text-caption text-danger">
                    Nenhum Pixel cadastrado — não há para onde enviar. Cadastre
                    um Pixel antes de ligar.
                  </p>
                )}

                {alvo && !podeLigar && !ligado && (
                  <p className="text-caption text-danger">
                    {alvo.nome} está sem token de acesso. Sem token nada sai
                    para a Meta, então o automático não pode ser ligado.
                  </p>
                )}

                {/* O terceiro estado, dito onde a chave está: ligado e sem
                    nenhuma regra em automático não é "funcionando". */}
                {semRegraAutomatica && (
                  <div className="flex flex-col items-start gap-2 rounded-control border border-warning/40 bg-warning/8 p-3">
                    <p className="text-caption text-warning">
                      Ligado, mas nenhuma regra está em automático — nada vai
                      sair. Ajuste em Regras.
                    </p>
                    <Button size="sm" variant="outline" onClick={onIrParaRegras}>
                      <GitBranch className="size-4" aria-hidden />
                      Abrir Regras
                    </Button>
                  </div>
                )}
              </div>
            }
          />
        </div>
      </div>

      {/* ---- Ligar é ação de consequência real: ela é confirmada ---- */}
      <AlertDialog
        open={aLigar !== null}
        onOpenChange={(v) => {
          if (!v && !salvando) {
            setALigar(null);
            setPedido(null);
          }
        }}
      >
        <AlertDialogContent initialFocus={refDeixarDesligado}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ligar o disparo automático de &ldquo;{aLigar?.nome}&rdquo;?
            </AlertDialogTitle>
            {/* Três parágrafos: a Description do base-ui vira <p>, e <p>
                dentro de <p> é HTML inválido. */}
            <AlertDialogDescription render={<div />}>
              <p>
                A partir de agora, os eventos das regras automáticas vão para o
                Pixel{' '}
                <span className="wrap-token font-mono tabular text-fg-body">
                  {aLigar?.pixelId}
                </span>{' '}
                <span className="font-semibold text-fg-body">
                  sem passar pela sua aprovação
                </span>
                .
              </p>

              <p className="mt-2">{oQueVaiAcontecer}</p>

              {aLigar && !aLigar.testCode?.trim() && (
                <p className="mt-2 rounded-control border border-warning/40 bg-warning/8 p-2.5 text-warning">
                  Este Pixel está sem código de teste, então o que sair daqui
                  conta como conversão real. O caminho seguro é preencher o
                  código de teste, ligar, conferir em Testar eventos no
                  Gerenciador da Meta e só então apagar o código.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={refDeixarDesligado} disabled={salvando}>
              Deixar desligado
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={salvando}
              onClick={() => {
                if (aLigar) void aplicar(aLigar, true);
              }}
            >
              {salvando ? 'Ligando…' : 'Ligar o disparo automático'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default ChaveDoAutomatico;
