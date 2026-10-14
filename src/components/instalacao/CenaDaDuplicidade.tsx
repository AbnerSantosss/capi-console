/**
 * Cena do aviso "Use um caminho por evento." (§12, O1). Fica logo abaixo do
 * Callout danger, que diz o mesmo em texto: a cena é só ilustração.
 *
 * Dois quadros, um depois do outro:
 * - "Pelos dois": o mesmo PageView sai pelo GTM e pelo código e a Meta conta
 *   2× (âmbar, com o alerta);
 * - "Só um caminho": o fio do código apagado e a Meta conta 1× (menta).
 *
 * A biblioteca não troca uma peça por outra no meio da cena; por isso o "2×"
 * e o "1×" são dois quadros em sequência de entrada (ordem 0–2, depois 3–4).
 * A cor de cada contador vem do invólucro `cenas.assunto` (o mesmo recurso
 * do painel de eventos), sem keyframe nem cor nova. Estado `ok`: é
 * explicação, não estado real.
 */

import React from 'react';

import { Balao, Fio, No, Palco } from '@/components/cenas';
import cenas from '@/components/cenas/cenas.module.css';
import { AlertTriangle, Check, Code2, Container } from '@/components/ui/icones';

import s from './instalacao.module.css';

export function CenaDaDuplicidade() {
  return (
    <Palco assunto="tag" altura="livre">
      <div className={s.duplicidade}>
        <div className={s.quadro}>
          <Balao x="0%" y="0%" ordem={0}>
            Pelos dois
          </Balao>
          <div className={s.quadroFluxo}>
            <div className={s.ramos}>
              <div className={s.ramo}>
                <No rotulo="GTM" icone={Container} ordem={0} />
                <Fio ordem={1} />
              </div>
              <div className={s.ramo}>
                <No rotulo="Código" icone={Code2} ordem={0} />
                <Fio ordem={1} />
              </div>
            </div>
            <span className={cenas.assunto} data-assunto="regra">
              <No rotulo="Meta 2×" icone={AlertTriangle} forte ordem={2} />
            </span>
          </div>
        </div>

        <div className={s.quadro}>
          <Balao x="0%" y="0%" forte ordem={3}>
            Só um caminho
          </Balao>
          <div className={s.quadroFluxo}>
            <div className={s.ramos}>
              <div className={s.ramo}>
                <No rotulo="GTM" icone={Container} ordem={3} />
                <Fio ordem={3} />
              </div>
              <div className={s.ramo}>
                <No rotulo="Código" estado="apagado" ordem={3} />
                <Fio ordem={3} estado="apagado" />
              </div>
            </div>
            <span className={cenas.assunto} data-assunto="webhook">
              <No rotulo="Meta 1×" icone={Check} forte ordem={4} />
            </span>
          </div>
        </div>
      </div>
    </Palco>
  );
}

export default CenaDaDuplicidade;
