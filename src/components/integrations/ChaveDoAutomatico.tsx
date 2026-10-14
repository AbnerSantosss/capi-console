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
import { GitBranch, Zap, ZapOff } from '@/components/ui/icones';

import { cn } from '@/lib/utils';
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
   * A moldura muda de COR com o estado — pedido literal de quem opera: a chave
   * é o primeiro elemento de /automatico e o estado dela tem de ser legível do
   * outro lado da sala, antes de qualquer leitura.
   *
   * 🔴 Cor é REFORÇO, nunca o portador do estado (SC 1.4.1): a palavra da
   * chavinha ("Ligado" / "Desligado"), a frase de estado e o ícone que troca
   * de glifo continuam dizendo tudo sem depender de enxergar a cor.
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
        <RegiaoDeEspera rotulo="Lendo o estado do envio automático">
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
          {/* 14/10 (pendência 2): saiu o selo "Ligado"/"Desligado" que ficava
              aqui — a chavinha logo abaixo já escreve a mesma palavra, e a
              tela dizia "Ligado" duas vezes. A leitura de um segundo continua
              na moldura e no ícone coloridos, e a palavra, na chavinha. */}
          <Switch
            checked={ligado}
            disabled={!alvo || (!ligado && !podeLigar)}
            salvando={salvando}
            onCheckedChange={(v) => pedirAlternar(v)}
            rotulo="Envio automático"
            descricao="Manda as regras Automáticas para a Meta sem você conferir."
            rodape={
              <div className="flex flex-col gap-2">
                {/* O estado vai em TEXTO, e a troca é anunciada. Quem não
                    distingue as cores e quem usa leitor de tela leem o mesmo
                    que todo mundo. */}
                <p role="status" aria-live="polite" className="text-label text-fg-strong">
                  {estadoEmTexto}
                </p>

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
                {ligadoNoServidor &&
                  ligadas.filter((m) => m.testCode?.trim()).map((m) => (
                    <p key={m.id} className="text-caption text-warning">
                      {m.nome} está em modo teste: o que sai não conta como venda.
                    </p>
                  ))}

                {/* O terceiro estado, dito onde a chave está: ligado e sem
                    nenhuma regra em automático não é "funcionando". A cena
                    abaixo mostra a porta que falta. */}
                {semRegraAutomatica && (
                  <div className="flex flex-wrap items-center gap-2 rounded-control border border-warning/40 bg-warning/8 p-3">
                    <p className="text-caption text-warning">Falta a regra em Automático.</p>
                    <Button size="sm" variant="outline" onClick={onIrParaRegras}>
                      <GitBranch className="size-4" aria-hidden />
                      Ver as regras
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
