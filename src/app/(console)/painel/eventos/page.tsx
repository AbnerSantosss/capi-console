import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Inbox } from '@/components/ui/icones';

import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';
import { Esqueleto } from '@/components/common/Esqueleto';
import { ListaDePessoas } from '@/components/painel/ListaDePessoas';

export const dynamic = 'force-dynamic';

/**
 * Quem mandou um evento — o destino de cada nome em "Quais eventos chegaram".
 *
 * O nome do evento viaja em `?evento=`, e não num segmento `[evento]` da rota,
 * por um motivo de segurança e não de estética: a allowlist de
 * `rotas-console.ts` compara PATHNAME inteiro, e é ela que decide para onde o
 * console devolve alguém depois de uma sessão expirada (D5). Um segmento
 * dinâmico obrigaria a afrouxar essa comparação para prefixo — reabrindo, para
 * economizar um `?`, justamente a porta que a allowlist fecha.
 *
 * Sem `?evento=`, esta tela não tem pergunta para responder: volta ao Painel em
 * vez de mostrar uma lista vazia que parece defeito.
 */
export default async function EventosDoPainel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const bruto = params.evento;
  const evento = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim() ?? '';
  if (!evento) redirect('/painel');

  return (
    <main className={consoleStyles.page} data-area="painel">
      <ConsolePageHeader
        title="Quem mandou este evento"
        // Teto de 120 caracteres (FASE 2 do v4): tinha 128 com um nome de
        // evento curto. Encurtou o texto fixo, não o nome — é o nome que diz
        // de qual evento é esta lista.
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
          recorte={{ evento }}
          titulo={`Eventos ${evento}`}
          descricao="Tudo o que chegou com este nome nesta janela, na ordem em que entrou."
        />
      </Suspense>
    </main>
  );
}
