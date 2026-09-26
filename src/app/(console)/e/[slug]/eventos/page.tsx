import { Suspense, type ReactNode } from 'react';
import { Gauge, Inbox, ShoppingBag } from '@/components/ui/icones';

import { Esqueleto } from '@/components/common/Esqueleto';
import { SeletorDeVista, type Vista } from '@/components/eventos/SeletorDeVista';
import { InboxList } from '@/components/integrations/InboxList';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';
import { ListaDePessoas } from '@/components/painel/ListaDePessoas';
import { PainelDeEventos } from '@/components/painel/PainelDeEventos';

import { empresaDosParams } from '../empresa-do-slug';
import { EnvioManual } from './EnvioManual';

export const dynamic = 'force-dynamic';

/** Um parâmetro de busca como texto só (o primeiro, se vier repetido). */
function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? '';
}

/**
 * Eventos da empresa (`/e/<slug>/eventos`, V2 do v7): o que antes eram quatro
 * telas — o Painel, "Quem comprou", "Quem mandou este evento" e a Caixa de
 * entrada do Disparo automático — mais o envio manual, escolhidos pela URL:
 *
 *  - `?vista=compras`  → quem comprou no período (`ListaDePessoas`);
 *  - `?vista=fila`     → a caixa de entrada (`InboxList`);
 *  - `?vista=manual`   → o envio manual (`EnvioManual`);
 *  - `?evento=<nome>`  → quem mandou aquele evento (`ListaDePessoas`);
 *  - nada, ou `?vista=resumo` → o resumo (`PainelDeEventos`).
 *
 * Uma `vista` explícita ganha do `?evento=`. O período (`?dias=`, `?de=`,
 * `?ate=`) continua na URL como antes: é o clique no resumo que o escreve.
 *
 * Acima de cada vista fica o `SeletorDeVista` (V7): Resumo · Compras · Fila ·
 * Envio manual, links que trocam o `?vista=` (o período vai junto). No recorte
 * "quem mandou este evento" nenhuma das 4 fica marcada — ele não é uma delas,
 * e o Resumo leva de volta. As rotas antigas seguem chegando aqui (o proxy
 * responde 307), já com a vista certa marcada.
 *
 * `key={empresaId}` em cada componente: ele remonta por empresa, e nenhum
 * estado de uma empresa aparece na outra (contrato de C2).
 */
export default async function EventosDaEmpresa({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const empresa = await empresaDosParams(params);
  const empresaId = empresa.id;
  const busca = await searchParams;
  const vista = primeiro(busca.vista);
  const evento = primeiro(busca.evento);

  /** A vista, com o seletor em cima (mesma largura e recuo das abas da empresa). */
  const comSeletor = (ativa: Vista | null, conteudo: ReactNode) => (
    <>
      <div className={consoleStyles.abasDaEmpresa}>
        {/* Cópia simples da busca: é o que atravessa para o componente de cliente. */}
        <SeletorDeVista slug={empresa.slug} ativa={ativa} busca={{ ...busca }} />
      </div>
      {conteudo}
    </>
  );

  if (vista === 'manual') {
    return comSeletor('manual', <EnvioManual key={empresaId} slug={empresa.slug} />);
  }

  if (vista === 'compras') {
    return comSeletor(
      'compras',
      <main className={consoleStyles.page} data-area="painel">
        <ConsolePageHeader
          title="Quem comprou"
          description="Quem comprou no período. E-mail mascarado; nome inteiro, para achar a pessoa no backoffice."
          icon={ShoppingBag}
        />
        {/* `useSearchParams` precisa de fronteira de suspense mesmo em rota
            dinâmica: sem ela o build reclama e a tela inteira vira esqueleto. */}
        <Suspense fallback={<Esqueleto className="h-96 rounded-panel" />}>
          <ListaDePessoas
            key={empresaId}
            recorte={{ compras: true }}
            titulo="Compras do período"
            descricao="Tudo o que chegou como Purchase nesta janela, na ordem em que entrou."
          />
        </Suspense>
      </main>
    );
  }

  if (vista === 'fila') {
    return comSeletor(
      'fila',
      <main className={consoleStyles.page} data-area="automatico">
        <ConsolePageHeader
          title="Fila"
          description="Eventos recebidos das plataformas. Carregue no formulário para revisar ou use Enviar agora."
          icon={Inbox}
        />
        {/* Sem o `Section` em volta (que o Disparo automático usava): ele é
            componente de cliente, e o ícone não atravessa a fronteira como
            prop. O título já está no cabeçalho da página. */}
        <div id="inbox">
          <InboxList key={empresaId} />
        </div>
      </main>
    );
  }

  if (evento && vista !== 'resumo') {
    return comSeletor(
      null,
      <main className={consoleStyles.page} data-area="painel">
        <ConsolePageHeader
          title="Quem mandou este evento"
          description={
            <>
              Quem mandou <span className="font-mono">{evento}</span> no período. E-mail mascarado;
              nome inteiro, para achar a pessoa no backoffice.
            </>
          }
          icon={Inbox}
        />
        <Suspense fallback={<Esqueleto className="h-96 rounded-panel" />}>
          <ListaDePessoas
            key={empresaId}
            recorte={{ evento }}
            titulo={`Eventos ${evento}`}
            descricao="Tudo o que chegou com este nome nesta janela, na ordem em que entrou."
          />
        </Suspense>
      </main>
    );
  }

  return comSeletor(
    'resumo',
    <main className={consoleStyles.page} data-area="painel">
      <ConsolePageHeader
        title="Painel de eventos"
        description="O que chegou, o que saiu para a Meta e de onde veio o tráfego. Os testes internos ficam fora das porcentagens."
        icon={Gauge}
      />
      <PainelDeEventos key={empresaId} />
    </main>
  );
}
