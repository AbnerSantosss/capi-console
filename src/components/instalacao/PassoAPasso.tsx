/**
 * O roteiro animado no topo da aba Instalação (13/10, pedido do dono: "muito
 * didático… animações do passo a passo, com balãozinhos, ícones flutuando.
 * Passo 1, passo 2").
 *
 * Desde 14/10 as peças (cartão, palco, balões, nós, fios) vêm da biblioteca
 * `@/components/cenas`, o padrão HyperFrames de todas as abas. Cada passo tem
 * a cor do ASSUNTO (tag, webhook), a mesma da seção lá embaixo, para o olho
 * ligar o resumo ao lugar onde se faz.
 *
 * A cena é ilustração: `aria-hidden`. O texto dos passos é o que lê o leitor
 * de tela, e o link "Fazer o passo" leva à âncora da seção.
 */

import React from 'react';

import { CartaoDePasso } from '@/components/cenas';

import { CenaDaTag } from './CenaDaTag';
import { CenaDoWebhook } from './CenaDoWebhook';
import s from './instalacao.module.css';

export function PassoAPasso() {
  return (
    <section aria-label="Passo a passo da instalação" className={s.roteiro}>
      <ol className="grid min-w-0 gap-4 md:grid-cols-2 md:gap-6">
        <CartaoDePasso
          numero={1}
          assunto="tag"
          titulo="Coloque a tag no site do cliente"
          porque="Guarda de onde a pessoa veio."
          itens={[
            'Cadastre o site.',
            'Copie a tag.',
            'Publique e confira.',
          ]}
          acao={{ href: '#tag', rotulo: 'Fazer o passo 1' }}
          cena={<CenaDaTag />}
        />
        <CartaoDePasso
          numero={2}
          assunto="webhook"
          titulo="Ligue o webhook na plataforma de vendas"
          porque="É ele que traz a venda."
          itens={[
            'Copie a URL.',
            'Cole na plataforma.',
            'Espere a 1ª venda na Fila.',
          ]}
          acao={{ href: '#webhook', rotulo: 'Fazer o passo 2' }}
          cena={<CenaDoWebhook />}
        />
      </ol>
    </section>
  );
}
