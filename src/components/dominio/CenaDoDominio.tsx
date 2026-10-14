'use client';

/**
 * A cena da aba Domínio (E2 do plano HyperFrames): "Como o endereço próprio
 * funciona". A única cena da aba, montada só com as peças de
 * `@/components/cenas`, sem keyframe próprio.
 *
 *   site do cliente (1, você escolhe) → 2 (cliente cria registro) →
 *   3 (certificado ativa) → Console (4, pronto)
 *
 * O estado vem do DADO REAL, nunca é encenado:
 *   - nenhum site com subdomínio: `apagado` (fios tracejados, passos sem cor);
 *   - algum site com subdomínio e `pronto !== true`: `esperando`, com o pulso
 *     âmbar no fio entre o passo 2 e o 3 (o console não sabe qual dos dois
 *     falta, então não diz). É o único laço do console (regra 17), e o Palco
 *     põe o botão "Pausar animação";
 *   - todos os sites com subdomínio com `pronto === true`: `ok`, com o nó do
 *     console de cadeado. A aba recolhe a cena num `<details>` "Como funciona".
 *
 * A cena é `aria-hidden` (o Palco cuida disso): o que ela mostra também está
 * escrito no cartão de cada site.
 */

import React from 'react';

import { Balao, Fio, JanelaDoNavegador, No, Palco, SeloDePasso, Trilha } from '@/components/cenas';
import type { Estado } from '@/components/cenas';
import { Lock } from '@/components/ui/icones';
import type { DominioTag } from '@/lib/tag-dominios';

import { enderecoProprioDe } from './mensagens-dominio';

export type EstadoDaCena = 'apagado' | 'esperando' | 'ok';

/**
 * O estado da cena a partir da lista e da medição. `undefined` (a medição
 * ainda não voltou) conta como aguardando: "pronto" só com `true`.
 */
export function estadoDaCena(
  dominios: DominioTag[],
  prontoDe: (d: DominioTag) => boolean | undefined
): EstadoDaCena {
  const comSub = dominios.filter((d) => enderecoProprioDe(d));
  if (comSub.length === 0) return 'apagado';
  return comSub.every((d) => prontoDe(d) === true) ? 'ok' : 'esperando';
}

export interface CenaDoDominioProps {
  estado: EstadoDaCena;
  /** O site que aparece na barra da janela (o primeiro que importa no estado). */
  host: string;
}

type Selo = 'feito' | 'atual' | 'proximo';

/** Os passos e os fios de cada estado. */
const QUADRO: Record<
  EstadoDaCena,
  { selos: [Selo, Selo, Selo]; fios: [Estado, Estado, Estado]; console: Estado }
> = {
  apagado: {
    selos: ['proximo', 'proximo', 'proximo'],
    fios: ['apagado', 'apagado', 'apagado'],
    console: 'apagado',
  },
  esperando: {
    selos: ['feito', 'atual', 'proximo'],
    fios: ['ok', 'esperando', 'apagado'],
    console: 'apagado',
  },
  ok: {
    selos: ['feito', 'feito', 'feito'],
    fios: ['ok', 'ok', 'ok'],
    console: 'ok',
  },
};

export function CenaDoDominio({ estado, host }: CenaDoDominioProps) {
  const q = QUADRO[estado];
  const apagado = estado === 'apagado';
  // Em celular o palco ocupa a largura toda (~358 px em 390) e passaria do
  // limite de 23rem do `@container cena`: a trilha ficaria em linha com os 4
  // balões encavalados. Abaixo de `sm` o palco é limitado a 22rem, e as peças
  // usam a versão estreita (trilha em coluna, só o PRIMEIRO balão).
  const baloes = {
    escolhe: (
      <Balao key="escolhe" x="4%" y="0.75rem" tracejado={apagado} ordem={1}>
        Você escolhe
      </Balao>
    ),
    registro: (
      <Balao
        key="registro"
        x="52%"
        y="0.75rem"
        centro
        tracejado={apagado}
        forte={estado === 'esperando'}
        ordem={2}
      >
        Cliente cria registro
      </Balao>
    ),
    certificado: (
      <Balao key="certificado" x="70%" y="0.75rem" deBaixo centro tracejado={apagado} ordem={3}>
        Certificado ativa
      </Balao>
    ),
    pronto: (
      <Balao
        key="pronto"
        x="3%"
        y="0.75rem"
        daDireita
        deBaixo
        tracejado={estado !== 'ok'}
        opcional={estado !== 'ok'}
        ordem={4}
      >
        Pronto
      </Balao>
    ),
  };
  // Na tela estreita só o primeiro balão fica: o que importa no estado vem antes.
  const ordemDosBaloes: (keyof typeof baloes)[] =
    estado === 'esperando'
      ? ['registro', 'escolhe', 'certificado', 'pronto']
      : estado === 'ok'
        ? ['pronto', 'escolhe', 'registro', 'certificado']
        : ['escolhe', 'registro', 'certificado', 'pronto'];

  return (
    <div className="mx-auto w-full min-w-0 max-w-[22rem] sm:max-w-none">
      <Palco assunto="dominio" estado={estado} altura="livre">
        {/* Na versão estreita a trilha e o balão ficam em coluna, centrados. */}
        <div className="flex min-w-0 flex-col items-center gap-3 sm:block">
          {/* Espaço dos balões soltos; na versão estreita eles entram no fluxo. */}
          <div className="w-full min-w-0 sm:py-8">
            <Trilha>
              <JanelaDoNavegador endereco={host || 'loja.com.br'}>
                <SeloDePasso numero={1} estado={q.selos[0]} />
              </JanelaDoNavegador>
              <Fio ordem={1} estado={q.fios[0]} />
              <SeloDePasso numero={2} estado={q.selos[1]} />
              <Fio ordem={2} estado={q.fios[1]} />
              <SeloDePasso numero={3} estado={q.selos[2]} />
              <Fio ordem={3} estado={q.fios[2]} />
              <No
                rotulo="Console"
                forte={estado === 'ok'}
                estado={q.console}
                ordem={4}
                icone={estado === 'ok' ? Lock : undefined}
              />
            </Trilha>
          </div>
          {ordemDosBaloes.map((k) => baloes[k])}
        </div>
      </Palco>
    </div>
  );
}

export default CenaDoDominio;
