/**
 * Cena do caminho GTM (§12, O1): fica no topo dos passos do GTM e só aparece
 * com esse caminho escolhido. Site → GTM (a tag `</>`) → Publicar (acende) →
 * Console, com o balão "PageView ✓" no fim: só depois de publicar o evento
 * chega. O último passo diz o mesmo em texto ("Tag salva e não publicada não
 * coleta."). Peças de `@/components/cenas`, 1 ciclo.
 */

import React from 'react';

import { Balao, Fio, No, Palco, Trilha } from '@/components/cenas';
import { Code2, Globe, Inbox, Send } from '@/components/ui/icones';

export function CenaDoGtm() {
  return (
    <Palco assunto="tag" ciclos={1}>
      <Balao x="4%" y="10%" daDireita forte ordem={4}>
        PageView ✓
      </Balao>
      <Trilha comBalao>
        <No rotulo="Site" icone={Globe} />
        <Fio />
        <No rotulo="GTM" icone={Code2} ordem={1} />
        <Fio ordem={1} />
        <No rotulo="Publicar" icone={Send} forte ordem={2} />
        <Fio ordem={2} />
        <No rotulo="Console" icone={Inbox} ordem={3} />
      </Trilha>
    </Palco>
  );
}

export default CenaDoGtm;
