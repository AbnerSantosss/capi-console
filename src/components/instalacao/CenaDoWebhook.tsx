/**
 * Cena do passo 2 da Instalação: a venda sai da plataforma, passa pelo
 * console e chega na Meta. Ilustração: o texto do cartão diz o mesmo.
 * Peças de `@/components/cenas`.
 */

import React from 'react';

import { Balao, Fio, No, Palco, Trilha } from '@/components/cenas';

export function CenaDoWebhook() {
  return (
    <Palco assunto="webhook">
      <Balao x="50%" y="12%" centro forte ordem={3}>
        Venda PIX aprovada ✓
      </Balao>
      <Trilha comBalao>
        <No rotulo="Plataforma" />
        <Fio ordem={1} />
        <No rotulo="Console" forte ordem={2} />
        <Fio ordem={3} />
        <No rotulo="Meta" ordem={4} />
      </Trilha>
    </Palco>
  );
}
