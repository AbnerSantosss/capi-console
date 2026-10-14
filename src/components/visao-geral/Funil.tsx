'use client';

/**
 * O funil da Visão geral (HyperFrames E1 + O2): a única cena da aba, "O
 * caminho de quem compra", montada com o `Palco` e o `Funil` da biblioteca de
 * cenas. As barras crescem até o número real, uma vez (`ciclos={1}`, sem laço).
 *
 *  - Etapas, só com número de `numerosDaVisaoGeral`: Páginas vistas (PageView)
 *    → Contato (Lead, só se > 0) → Checkout iniciado → Aguardando pagamento
 *    (AddPaymentInfo) → Pago (Purchase). Etapa sem dado = contorno + "—".
 *  - Ramo âmbar "Abandonou o checkout", saindo do Checkout, com a contagem de
 *    `resumo.abandonos`; sem o campo, "sem sinal" e a dica de como ligar.
 *  - A taxa entre etapas é a do `Funil` das cenas: em eventos, de 0 a 100%.
 *  - A cena é `aria-hidden`: o invólucro tem `role="img"` e `aria-describedby`
 *    para o `resumoTextualDoFunil`, que é o que o leitor de tela lê.
 *  - Fora do palco, em texto: "Página → compra", o selo "Amostra parcial" e a
 *    nota de que o funil conta eventos, não pessoas.
 */

import Link from 'next/link';
import { useId } from 'react';
import { Funil as FunilDaCena, IconeDoAssunto, Palco, type EtapaDoFunil } from '@/components/cenas';
import consoleStyles from '@/components/layout/console.module.css';
import { Badge } from '@/components/ui/badge';
import { ListFilter } from '@/components/ui/icones';
import { enderecoDaAba } from '@/lib/abas-empresa';
import { cn } from '@/lib/utils';
import {
  AVISO_DE_AMOSTRA,
  SEM_DADO,
  formatarPercentual,
  percentual,
  resumoTextualDoFunil,
  type NumerosDaVisaoGeral,
} from '@/lib/visao-geral-calculos';

const DICA_DO_ABANDONO_SEM_SINAL = 'Assine o evento de abandono na plataforma para ver aqui.';
const DICA_DO_ABANDONO = 'Entregas da plataforma com "abandon" no nome. Conta eventos, não pessoas.';

/** As etapas da cena, na ordem do O2. "Contato" só entra com Lead no período. */
function etapasDoFunil(n: NumerosDaVisaoGeral): EtapaDoFunil[] {
  const etapas: EtapaDoFunil[] = [{ rotulo: 'Páginas vistas', valor: n.paginas }];
  if ((n.leads ?? 0) > 0) etapas.push({ rotulo: 'Contato', valor: n.leads });
  etapas.push(
    { rotulo: 'Checkout iniciado', valor: n.checkouts },
    { rotulo: 'Aguardando pagamento', valor: n.pagamentos, dica: 'PIX gerado ou cartão tentado' },
    { rotulo: 'Pago', valor: n.compras }
  );
  return etapas;
}

/**
 * Compras ÷ páginas vistas. Acima de 100% (mais compras que páginas, quando a
 * página não é medida em toda venda) a conta não diz nada: fica "—".
 */
function paginaParaCompra(n: NumerosDaVisaoGeral): number | null {
  const p = percentual(n.compras, n.paginas);
  return p !== null && p <= 100 ? p : null;
}

export function Funil({
  numeros: n,
  amostraParcial = false,
  slug,
  className,
}: {
  numeros: NumerosDaVisaoGeral;
  /** `resumo.amostraCobreJanela === false`: mostra o selo "Amostra parcial". */
  amostraParcial?: boolean;
  /** Para o link "Ligar" quando nenhuma página vista chegou. */
  slug?: string;
  className?: string;
}) {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const idTitulo = `funil-titulo-${base}`;
  const idResumo = `funil-resumo-${base}`;

  const etapas = etapasDoFunil(n);
  const indiceDoCheckout = etapas.findIndex((e) => e.rotulo === 'Checkout iniciado');
  const taxa = paginaParaCompra(n);
  const semPaginas = n.temDado && n.paginas === 0;

  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(consoleStyles.painel, 'flex min-w-0 flex-col gap-4 p-4 sm:p-5', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 id={idTitulo} className="flex items-center gap-2 text-title font-semibold text-fg-strong">
            <IconeDoAssunto assunto="evento" icone={ListFilter} />
            Funil do período
          </h2>
          {amostraParcial ? (
            <Badge variant="aviso" title={AVISO_DE_AMOSTRA}>
              Amostra parcial
            </Badge>
          ) : null}
        </div>
        <p className="flex flex-col items-end text-right" title="Compras dividido por páginas vistas, não por pessoas">
          <span className="text-caption text-fg-muted">Página → compra</span>
          <span className="text-heading font-bold tabular-nums text-fg-strong">
            {taxa === null ? SEM_DADO : formatarPercentual(taxa)}
          </span>
        </p>
      </div>

      <div role="img" aria-labelledby={idTitulo} aria-describedby={idResumo} className="w-full min-w-0">
        <Palco assunto="evento" estado="ok" ciclos={1} altura="livre">
          <FunilDaCena
            assunto="evento"
            etapas={etapas}
            taxas
            ramo={{
              depoisDe: indiceDoCheckout,
              rotulo: 'Abandonou o checkout',
              valor: n.abandonos,
              dica: n.abandonos === null ? DICA_DO_ABANDONO_SEM_SINAL : DICA_DO_ABANDONO,
            }}
          />
        </Palco>
      </div>

      <p id={idResumo} className="sr-only">
        {resumoTextualDoFunil(n)}
      </p>

      <div className="flex flex-col gap-1 text-caption text-fg-muted">
        {semPaginas && slug ? (
          <p>
            Nenhuma página vista no período.{' '}
            <Link href={enderecoDaAba(slug, 'regras')} className="font-medium text-tinta-texto underline">
              Ligar
            </Link>
          </p>
        ) : null}
        <p>Conta eventos do período, não pessoas.</p>
      </div>
    </section>
  );
}
