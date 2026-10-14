/**
 * Cena do passo 1 da Instalação: o site do cliente com a tag, e os três
 * sinais que ela guarda (PageView, fbc, fbp). Ilustração: o texto do cartão
 * diz o mesmo. Peças de `@/components/cenas`.
 */

import React from 'react';

import { Balao, CodigoComCursor, JanelaDoNavegador, Palco } from '@/components/cenas';

export function CenaDaTag() {
  return (
    <Palco assunto="tag">
      <JanelaDoNavegador endereco="site-do-cliente.com">
        <CodigoComCursor />
      </JanelaDoNavegador>
      <Balao x="6%" y="16%" ordem={1}>
        PageView
      </Balao>
      <Balao x="6%" y="12%" daDireita ordem={2}>
        fbc
      </Balao>
      <Balao x="10%" y="12%" daDireita deBaixo opcional ordem={3}>
        fbp
      </Balao>
    </Palco>
  );
}
