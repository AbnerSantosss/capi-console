'use client';

/**
 * O aviso "um caminho por evento" da tela de instalação (M-24).
 *
 * Sem dado, é o aviso fixo de sempre. Com dado, mostra por evento da Meta
 * quantos repetidos foram segurados nos últimos 7 dias: o envio que voltou como
 * "a Meta já tinha este evento" (`ContagemPorEventoMeta.repetidos`).
 *
 * Só LEITURA de `GET /api/inbox/resumo`. Nada aqui manda evento à Meta.
 *
 * Todo `setState` vem depois do `await` (a regra `set-state-in-effect`), e a
 * resposta de outra empresa é descartada, como na Visão geral. Se a busca
 * falhar, fica o aviso fixo: ele continua verdadeiro sem número nenhum.
 */

import { useEffect, useState } from 'react';

import { Callout } from '@/components/common/primitives';
import { AlertTriangle, Repeat } from '@/components/ui/icones';
import { pedir } from '@/lib/cliente-api';
import { eventosRepetidos, type EventoRepetido, type ResumoInbox } from '@/lib/inbox-resumo';
import { useEmpresaStore } from '@/stores/useEmpresaStore';

/** A janela do número. A rota aceita 7, 30 e 90; a frase da tela cita este valor. */
const DIAS = 7;
const MAXIMO_DE_LINHAS = 5;

interface Leitura {
  empresaId: string;
  eventos: EventoRepetido[];
  /** A leitura não alcançou os 7 dias inteiros: o número é um piso. */
  piso: boolean;
}

function textoDeRepetidos(n: number): string {
  return n === 1 ? '1 repetido' : `${n.toLocaleString('pt-BR')} repetidos`;
}

function ComoConferir() {
  return (
    <details className="mt-1">
      <summary className="w-fit cursor-pointer font-medium text-fg-strong underline underline-offset-2">
        Como conferir se já está instalado
      </summary>
      <p className="mt-1">Procure o endereço do coletor no código-fonte do site.</p>
    </details>
  );
}

export function AvisoDeCaminhoUnico() {
  const empresaAtivaId = useEmpresaStore((s) => s.empresaAtivaId);
  const [leitura, setLeitura] = useState<Leitura | null>(null);

  useEffect(() => {
    if (!empresaAtivaId) return;
    let vivo = true;
    void (async () => {
      try {
        const dados = await pedir<{ resumo: ResumoInbox; empresaId?: string }>(
          `/api/inbox/resumo?dias=${DIAS}`,
          { cache: 'no-store', headers: { 'X-Empresa-Id': empresaAtivaId } }
        );
        if (!vivo || dados.empresaId !== empresaAtivaId) return;
        setLeitura({
          empresaId: empresaAtivaId,
          eventos: eventosRepetidos(dados.resumo.porEventoMeta),
          piso: dados.resumo.amostraCobreJanela === false,
        });
      } catch {
        // Sem leitura, fica o aviso fixo. Sessão expirada já leva ao login
        // dentro de `pedir`.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [empresaAtivaId]);

  // Leitura de outra empresa não vale para esta tela.
  const atual = leitura !== null && leitura.empresaId === empresaAtivaId ? leitura : null;
  const eventos = atual ? atual.eventos.slice(0, MAXIMO_DE_LINHAS) : [];
  const piso = atual?.piso === true;

  if (eventos.length === 0) {
    return (
      <Callout tone="danger" icon={AlertTriangle} title="Use um caminho por evento.">
        Nos dois, o evento conta em dobro na Meta, sem aviso.
        <ComoConferir />
      </Callout>
    );
  }

  return (
    <Callout tone="warning" icon={Repeat} title="Evento repetido: a Meta recebeu só um.">
      <ul className="flex flex-col gap-0.5">
        {eventos.map((e) => (
          <li key={e.eventoMeta} className="tabular-nums">
            <span className="font-semibold text-fg-strong">{e.eventoMeta}</span>
            {`: ${piso ? 'pelo menos ' : ''}${textoDeRepetidos(e.repetidos)} nos últimos ${DIAS} dias.`}
          </li>
        ))}
      </ul>
      <p className="mt-1">Se a tag e o webhook mandam o mesmo evento, deixe só um.</p>
      <ComoConferir />
    </Callout>
  );
}
