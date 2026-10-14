/**
 * Cena da aba Pixels: "Do console à Meta" (a única cena da aba).
 *
 * Ilustração: o texto ao lado (a legenda e o estado de cada cartão) diz o
 * mesmo. O estado vem do dado real, pela faixa de `estadoDePixel` de cada
 * Pixel, sem mudar a função:
 *
 *   - algum Pixel sem token          -> erro no 2º fio (o único vermelho);
 *   - algum Pixel enviando sozinho   -> ok (o pulso chega à Meta e para);
 *   - senão (desligado ou sem regra) -> pausado: âmbar PARADO até o Pixel.
 *
 * Esta cena não tem laço: nenhum Pixel "espera" — desligado ou sem regra é
 * escolha de quem usa. Zero Pixels não tem cena: a tela mostra o vazio.
 *
 * Um só palco por arquivo (regra das cenas): a faixa muda o estado do palco,
 * os balões e o estado de cada peça da trilha, não o palco.
 *
 * Em palco estreito só o PRIMEIRO balão aparece, então ele vem sempre antes
 * no código e é o do ponto em que o envio parou.
 */

import React from 'react';

import { Balao, Fio, No, Palco, Trilha } from '@/components/cenas';
import { Target } from '@/components/ui/icones';
import type { FaixaDePixel } from '@/components/pixels/estado-pixel';

/**
 * A faixa que a cena mostra quando há vários Pixels. Sem token vence tudo
 * (é o que impede envio até à mão); depois, um Pixel enviando já basta para
 * o envio sair; entre os parados, "ligado sem regra" é o engano a apontar.
 */
const PRIORIDADE: readonly FaixaDePixel[] = [
  'sem-token',
  'disparando',
  'ligado-sem-regra',
  'so-fila',
];

export function faixaDaCena(faixas: readonly FaixaDePixel[]): FaixaDePixel | null {
  return PRIORIDADE.find((f) => faixas.includes(f)) ?? null;
}

export function CenaDoPixel({ faixa }: { faixa: FaixaDePixel }) {
  const enviando = faixa === 'disparando';
  const semToken = faixa === 'sem-token';
  const parado = !enviando && !semToken;

  let baloes: React.ReactNode;
  if (enviando) {
    baloes = (
      <>
        <Balao x="22%" y="10%" centro ordem={2}>
          Regra Automática
        </Balao>
        <Balao x="50%" y="8%" centro deBaixo ordem={3}>
          Pixel ligado
        </Balao>
        <Balao x="16%" y="10%" daDireita forte opcional ordem={4}>
          Meta recebe
        </Balao>
      </>
    );
  } else if (semToken) {
    baloes = (
      <Balao x="16%" y="10%" daDireita ordem={3}>
        Falta o token
      </Balao>
    );
  } else {
    // so-fila ou ligado-sem-regra: o envio para ANTES do Pixel.
    baloes = (
      <Balao x="30%" y="10%" centro ordem={2}>
        {faixa === 'so-fila' ? 'Pixel desligado' : 'Sem regra Automática'}
      </Balao>
    );
  }

  return (
    <Palco assunto="pixel" estado={enviando ? 'ok' : semToken ? 'erro' : 'pausado'}>
      {baloes}
      <Trilha comBalao>
        <No rotulo="Console" />
        <Fio ordem={1} estado={parado ? 'pausado' : undefined} />
        <No
          rotulo="Pixel"
          icone={Target}
          forte={!parado}
          estado={parado ? 'pausado' : undefined}
          ordem={2}
        />
        <Fio ordem={3} estado={semToken ? 'erro' : parado ? 'apagado' : undefined} />
        <No rotulo="Meta" estado={enviando ? undefined : 'apagado'} ordem={4} />
      </Trilha>
    </Palco>
  );
}

export default CenaDoPixel;
