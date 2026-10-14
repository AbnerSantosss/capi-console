/**
 * "As duas chaves" (E6a, padrão HyperFrames): a única cena da aba Regras.
 *
 * Diz num olhar a regra de ouro do envio automático: a venda só sai sozinha
 * quando a REGRA está em Automático E o envio automático do PIXEL está ligado; faltando
 * uma, ela vai para a Fila.
 *
 * Estado real, só por props: as regras GRAVADAS (`cfg.regras`, as que valem no
 * servidor) e os Pixels do `useBrandStore`, lidos do mesmo jeito que a
 * `ChaveDoAutomatico` lê. Nenhum `fetch` aqui.
 *
 *   - Pixels ainda carregando, nenhum Pixel, ou nenhuma das duas chaves
 *     ligada → 'apagado' (nada aceso);
 *   - Pixel sem token → 'erro' só no fio Pixel → Meta;
 *   - só uma das duas ligada → 'pausado' (a porta ligada em menta com ✓, a
 *     outra âmbar parada com pausa; o pulso desvia uma vez para a Fila);
 *   - as duas ligadas E token → 'ok' (o pulso chega à Meta e para).
 *
 * Esta aba nunca tem espera de verdade: chave desligada é escolha de quem
 * opera, não espera. Por isso o laço contínuo não existe aqui.
 */

import React from 'react';

import { Balao, Fio, No, Palco, Trilha } from '@/components/cenas';
import { Check, Inbox, ShoppingCart, Target, Workflow } from '@/components/ui/icones';
import { contarRegrasAuto } from '@/components/pixels/estado-pixel';
import type { RegraRoteamento } from '@/lib/config-store';
import type { MarcaPublica } from '@/stores/useBrandStore';
import { cn } from '@/lib/utils';

/** O texto que o leitor de tela lê (a cena é `aria-hidden`). */
export const TEXTO_DAS_DUAS_CHAVES =
  'Só sai sozinho com as duas: regra em Automático e envio automático do Pixel ligado. Faltando uma, vai para a Fila.';

/** Porta acesa: menta, o acento de "passou". */
const MENTA = '[--acento:var(--success)]';

type Situacao = 'apagado' | 'erro' | 'pausado' | 'ok';

export type FatosDasDuasChaves = {
  pixelCadastrado: boolean;
  /** Há regra ativa em Automático para o Pixel de referência. */
  regraAuto: boolean;
  /** Algum Pixel com `autoDisparo === true`. */
  pixelLigado: boolean;
  /** O Pixel de referência tem token. */
  temToken: boolean;
  /** O `useBrandStore` já respondeu. */
  carregado: boolean;
};

/**
 * Os fatos, com a mesma leitura da `ChaveDoAutomatico`: ligado é só
 * `autoDisparo === true`; o Pixel de referência é o primeiro ligado ou, com
 * tudo desligado, o Pixel ativo do console.
 */
export function fatosDasDuasChaves(
  regras: RegraRoteamento[],
  marcas: MarcaPublica[],
  marcaAtivaId: string | null | undefined,
  carregado: boolean
): FatosDasDuasChaves {
  const ligadas = marcas.filter((m) => m.autoDisparo === true);
  const alvo = marcas.find((m) => m.id === marcaAtivaId) ?? marcas[0];
  const referencia = ligadas.length > 0 ? ligadas[0] : alvo;
  const regrasAuto =
    ligadas.length > 0
      ? ligadas.reduce((soma, m) => soma + contarRegrasAuto(regras, m.id), 0)
      : alvo
        ? contarRegrasAuto(regras, alvo.id)
        : 0;
  return {
    pixelCadastrado: marcas.length > 0,
    regraAuto: regrasAuto > 0,
    pixelLigado: ligadas.length > 0,
    temToken: referencia?.temToken === true,
    carregado,
  };
}

/** A ordem de decisão do plano. `ok` exige as duas chaves E o token. */
export function situacaoDasDuasChaves(f: FatosDasDuasChaves): Situacao {
  if (!f.carregado || !f.pixelCadastrado) return 'apagado';
  if (!f.regraAuto && !f.pixelLigado) return 'apagado';
  if (!f.temToken) return 'erro';
  if (f.regraAuto && f.pixelLigado) return 'ok';
  return 'pausado';
}

/**
 * Uma porta da trilha (Regra ou Pixel). Acesa: menta com ✓. Faltando: âmbar
 * parada com pausa. Quando é a porta por onde a venda desvia, a Fila pendura
 * embaixo dela (ou ao lado, no palco estreito, onde a trilha já é coluna).
 */
function Porta({
  rotulo,
  icone,
  acesa,
  apagada,
  ordem,
  fila,
}: {
  rotulo: string;
  icone: typeof Workflow;
  acesa: boolean;
  apagada: boolean;
  ordem: 1 | 2;
  fila: 'nenhuma' | 'apagada' | 'acesa';
}) {
  const estado = apagada ? 'apagado' : acesa ? 'ok' : 'pausado';
  return (
    <span className="relative inline-flex shrink-0">
      <span className={cn('contents', acesa && !apagada && MENTA)}>
        <No rotulo={rotulo} icone={acesa && !apagada ? Check : icone} estado={estado} ordem={ordem} />
      </span>
      {fila !== 'nenhuma' && (
        <span
          className={cn(
            'absolute top-full left-1/2 mt-0.5 flex -translate-x-1/2 flex-col items-center gap-0.5',
            '@max-[23rem]:top-1/2 @max-[23rem]:left-full @max-[23rem]:mt-0 @max-[23rem]:ml-1.5',
            '@max-[23rem]:translate-x-0 @max-[23rem]:-translate-y-1/2 @max-[23rem]:flex-row @max-[23rem]:gap-1.5',
            ordem === 1 ? '[--trecho:1]' : '[--trecho:2]'
          )}
        >
          <span className="flex @max-[23rem]:hidden">
            <Fio direcao="baixo" ordem={ordem} estado={fila === 'acesa' ? 'ok' : 'apagado'} />
          </span>
          <span
            className={cn(
              'hidden h-0.5 w-3 @max-[23rem]:block',
              fila === 'acesa' ? 'bg-warning/60' : 'bg-line-control'
            )}
          />
          <No
            rotulo="Fila"
            icone={Inbox}
            forte={fila === 'acesa'}
            estado={fila === 'acesa' ? 'ok' : 'apagado'}
            ordem={4}
          />
        </span>
      )}
    </span>
  );
}

export function CenaDuasChaves(props: FatosDasDuasChaves) {
  const situacao = situacaoDasDuasChaves(props);
  const apagado = situacao === 'apagado';
  const ok = situacao === 'ok';
  const { regraAuto, pixelLigado } = props;

  // Por onde a venda desvia para a Fila: a primeira porta que falta; sem
  // token com as duas ligadas, o Pixel. Tudo apagado: a Fila fica apagada
  // embaixo da Regra. Com as duas ligadas e token, não há desvio.
  const desviaNaRegra = !apagado && !ok && !regraAuto;
  const desviaNoPixel = !apagado && !ok && regraAuto;

  const balao =
    situacao === 'pausado'
      ? !regraAuto
        ? { x: '36%', texto: 'Regra Automática' }
        : { x: '64%', texto: 'Pixel ligado' }
      : situacao === 'erro'
        ? { x: '78%', texto: 'Pixel sem token' }
        : null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Palco assunto="regra" estado={situacao} ciclos={situacao === 'pausado' ? 1 : 2} altura="livre">
        {balao ? (
          <Balao x={balao.x} y="0.75rem" centro ordem={3}>
            {balao.texto}
          </Balao>
        ) : null}
        {ok ? (
          <Balao x="0.75rem" y="0.75rem" daDireita opcional ordem={4}>
            Saiu sozinho
          </Balao>
        ) : null}
        <div className={cn('pb-14 @max-[23rem]:pb-0', ok && MENTA)}>
          <Trilha comBalao>
            <No rotulo="Venda" icone={ShoppingCart} estado={apagado ? 'apagado' : 'ok'} ordem={0} />
            <Fio ordem={0} estado={apagado ? 'apagado' : 'ok'} />
            <Porta
              rotulo="Regra"
              icone={Workflow}
              acesa={regraAuto}
              apagada={apagado}
              ordem={1}
              fila={desviaNaRegra ? 'acesa' : apagado ? 'apagada' : 'nenhuma'}
            />
            <Fio ordem={1} estado={apagado ? 'apagado' : regraAuto ? 'ok' : 'pausado'} />
            <Porta
              rotulo="Pixel"
              icone={Target}
              acesa={pixelLigado}
              apagada={apagado}
              ordem={2}
              fila={desviaNoPixel ? 'acesa' : 'nenhuma'}
            />
            <Fio
              ordem={2}
              estado={
                apagado ? 'apagado' : situacao === 'erro' ? 'erro' : ok ? 'ok' : 'pausado'
              }
            />
            <No rotulo="Meta" forte={ok} estado={ok ? 'ok' : 'apagado'} ordem={3} />
          </Trilha>
        </div>
      </Palco>
      <p className="text-caption text-fg-muted">{TEXTO_DAS_DUAS_CHAVES}</p>
    </div>
  );
}

export default CenaDuasChaves;
