'use client';

/**
 * A chavinha do envio automático — o primeiro controle de /automatico.
 *
 * Ela existe porque o produto tem DUAS travas e elas moram em telas
 * diferentes:
 *
 *   Trava 1 — a REGRA precisa estar em modo `auto`   (aba Regras, aqui do lado)
 *   Trava 2 — o PIXEL precisa aceitar envio automático (`Marca.autoDisparo`)
 *
 * Mexer numa só não muda nada. Até agora a trava 2 só tinha interruptor lá em
 * /pixels, dentro do cartão de cada Pixel: quem abria "Envio automático"
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
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { GitBranch } from '@/components/ui/icones';

import { useBrandStore, type MarcaPublica } from '@/stores/useBrandStore';
import {
  contarRegrasAuto,
  estadoDePixel,
  nomesDasRegrasAuto,
} from '@/components/pixels/estado-pixel';
import { Button, buttonVariants } from '@/components/ui/button';
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
  // Só para o botão "Abrir Pixels" levar à aba Pixels desta empresa.
  const slug = useParams<{ slug?: string }>()?.slug;

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
        toast.success(`Envio automático ligado em ${marca.nome}.`, {
          description: marca.testCode?.trim()
            ? 'Os eventos saem em modo de teste, para o Testar eventos da Meta.'
            : 'As regras automáticas passam a enviar conversões reais sem passar por você.',
        });
      } else {
        // Desligar desliga TODOS os que estavam ligados. Parar pela metade e
        // dizer "desligado" seria a tela mentindo no estado mais caro.
        for (const m of ligadas) await definirAutoDisparo(m.id, false);
        toast.success('Envio automático desligado.', {
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
          : 'Não foi possível salvar o envio automático.'
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

  // E6a: uma frase de estado. Ligado sem regra em Automático não é "envia
  // sozinho": a frase diz que nada sai, e o aviso abaixo diz o que falta.
  // 14/10 (pendência 2): a frase não repete a palavra do selo ("Ligado" /
  // "Desligado"), que já está logo acima e é lida antes dela.
  const estadoEmTexto = !ligadoNoServidor
    ? 'Tudo espera na Fila.'
    : regrasAutoLigadas === 0
      ? 'Nada sai sozinho ainda.'
      : 'As regras Automáticas enviam sozinhas.';

  /* ---------------------------------------------------------------- */
  /* A confirmação de ligar — ela diz o que vai acontecer              */
  /* ---------------------------------------------------------------- */

  const nomesAuto = aLigar ? nomesDasRegrasAuto(regras, aLigar.id) : [];

  // Quais regras passam a sair sozinhas: sem isto, quem confirma não sabe o
  // que está ligando.
  const oQueVaiAcontecer =
    nomesAuto.length === 0
      ? 'Nenhuma regra está em Automático: nada sai ainda.'
      : `Em Automático: ${nomesAuto.join(', ')}.`;

  /* ---------------------------------------------------------------- */

  /**
   * Uma linha de ~56px: título, estado em palavras e a chave (redesenho de
   * 18/11/2026). Sem moldura colorida: o estado já está dito em texto pela
   * própria chavinha ("Ligado" / "Desligado") e pela frase abaixo do título.
   * Cor nunca é a única portadora do estado (SC 1.4.1).
   *
   * 🔴 O que muda só aqui é a apresentação. As duas travas, a confirmação de
   * ligar e a gravação seguem como estavam.
   */
  const PAINEL = 'rounded-panel border border-line bg-surface-1 px-4 py-1.5';

  // Enquanto carrega a linha é neutra: pintar "desligado" antes de ler o
  // servidor seria anunciar o que não se sabe.
  if (!carregado) {
    return (
      <section data-area="automatico" className={PAINEL}>
        <RegiaoDeEspera rotulo="Lendo o estado do envio automático">
          <div className="flex min-h-11 items-center justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <Esqueleto className="h-4 w-40" />
              <Esqueleto className="h-3 w-56" />
            </div>
            <Esqueleto className="h-6 w-28" />
          </div>
        </RegiaoDeEspera>
      </section>
    );
  }

  const testeLigado = ligadoNoServidor ? ligadas.filter((m) => m.testCode?.trim()) : [];
  const temExtras =
    Boolean(erro) ||
    (!erro && marcas.length === 0) ||
    Boolean(alvo && !podeLigar && !ligado) ||
    testeLigado.length > 0 ||
    semRegraAutomatica;

  return (
    <section data-area="automatico" className={PAINEL}>
      <Switch
        checked={ligado}
        disabled={!alvo || (!ligado && !podeLigar)}
        salvando={salvando}
        onCheckedChange={(v) => pedirAlternar(v)}
        rotulo="Envio automático"
        descricao={estadoEmTexto}
        rodape={
          <>
            {/* A troca de estado é anunciada para o leitor de tela; quem vê
                lê a frase logo abaixo do título. */}
            <p role="status" aria-live="polite" className="sr-only">
              {estadoEmTexto}
            </p>

            {temExtras && (
              <div className="flex flex-col gap-2 pb-1">
                {erro && (
                  <p className="text-caption text-danger">
                    Não foi possível ler os Pixels: {erro}
                  </p>
                )}

                {!erro && marcas.length === 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-caption text-danger">Falta cadastrar um Pixel.</p>
                    <Link
                      href={slug ? `/e/${encodeURIComponent(slug)}/pixels` : '/pixels'}
                      className={buttonVariants({ size: 'sm', variant: 'outline' })}
                    >
                      Abrir Pixels
                    </Link>
                  </div>
                )}

                {alvo && !podeLigar && !ligado && (
                  <p className="text-caption text-danger">
                    {alvo.nome} está sem token. Sem token nada sai.
                  </p>
                )}

                {/* Pixel ligado e com Código de teste: o que sai não conta na
                    campanha. Sem este aviso, "ligado" parece "funcionando". */}
                {testeLigado.map((m) => (
                  <p key={m.id} className="text-caption text-warning">
                    {m.nome} está em modo teste: o que sai não conta como venda.
                  </p>
                ))}

                {/* O terceiro estado, dito onde a chave está: ligado e sem
                    nenhuma regra em automático não é "funcionando". */}
                {semRegraAutomatica && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-caption text-warning">Falta a regra em Automático.</p>
                    <Button size="sm" variant="outline" onClick={onIrParaRegras}>
                      <GitBranch className="size-4" aria-hidden />
                      Ver as regras
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        }
      />

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
              Ligar o envio automático de &ldquo;{aLigar?.nome}&rdquo;?
            </AlertDialogTitle>
            {/* Três parágrafos: a Description do base-ui vira <p>, e <p>
                dentro de <p> é HTML inválido. */}
            <AlertDialogDescription render={<div />}>
              <p>
                Daqui em diante, as regras Automáticas enviam para {aLigar?.nome}{' '}
                (
                <span className="wrap-token font-mono tabular text-fg-body">
                  {aLigar?.pixelId}
                </span>
                ){' '}
                <span className="font-semibold text-fg-body">
                  sem pedir sua aprovação
                </span>
                .
              </p>

              <p className="mt-2">{oQueVaiAcontecer}</p>

              {aLigar && !aLigar.testCode?.trim() && (
                <p className="mt-2 rounded-control border border-warning/40 bg-warning/8 p-2.5 text-warning">
                  Sem código de teste, conta como venda real.
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
              {salvando ? 'Ligando…' : 'Ligar o envio automático'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default ChaveDoAutomatico;
