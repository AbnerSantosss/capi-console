'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { useEventStore } from '@/stores/useEventStore';
import { useBrandStore } from '@/stores/useBrandStore';
import { useUserStore } from '@/stores/useUserStore';
import { lerEventTime } from '@/lib/event-schema';
import type { DispatchResult } from './tipos';

/**
 * Toda a lógica de disparo num lugar só.
 *
 * Existe porque o disparo aparece em dois lugares: o painel lateral (a partir
 * de 1280px) e a barra fixa inferior (abaixo disso). Duplicar o handler da
 * ação que gasta dinheiro real seria a pior coisa a se fazer neste código.
 */
export function useDisparo(onResult: (r: DispatchResult) => void, onAbrirMarcas: () => void) {
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const marcas = useBrandStore((s) => s.marcas);
  const marcaAtivaId = useBrandStore((s) => s.marcaAtivaId);
  const ativa = marcas.find((m) => m.id === marcaAtivaId) ?? marcas[0];
  const emTeste = Boolean(ativa?.testCode?.trim());

  const confeteSoEmTeste = useUserStore((s) => s.confeteSoEmTeste);
  const marcarSubmetido = useEventStore((s) => s.marcarSubmetido);

  /** Trata a resposta da Meta. Separado para o reenvio forçado reaproveitar. */
  const concluir = async (
    resposta: Response,
    dados: { httpStatus?: number; erros?: string[]; resposta?: Record<string, unknown> }
  ) => {
    const respostaMeta = dados.resposta as
      | { events_received?: number; error?: { message?: string } }
      | undefined;
    const ok =
      resposta.ok &&
      !dados.erros?.length &&
      !respostaMeta?.error &&
      (respostaMeta?.events_received ?? 0) > 0;

    if (ok) {
      if (emTeste || !confeteSoEmTeste) {
        const { default: confetti } = await import('canvas-confetti');
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.8 },
          colors: ['#0064E0', '#4DA6FF', '#34D399'],
          disableForReducedMotion: true,
        });
      }
      toast.success('Evento recebido pela Meta', {
        description: `${respostaMeta?.events_received ?? 1} evento confirmado no Pixel ${ativa?.pixelId ?? ''}.`,
      });
      onResult({ sucesso: true, httpStatus: dados.httpStatus ?? 200, dados });
      return;
    }

    const lista: string[] = [
      ...(dados.erros ?? []),
      ...(respostaMeta?.error?.message ? [respostaMeta.error.message] : []),
    ];
    if (!lista.length) lista.push('A Meta não confirmou o recebimento.');
    toast.error('A Meta recusou o evento', { description: lista[0] });
    onResult({
      sucesso: false,
      httpStatus: dados.httpStatus ?? resposta.status,
      dados,
      erros: lista,
    });
  };

  /** Reenvia o MESMO corpo com forcar: true, depois de a pessoa confirmar. */
  const reenviarForcado = async (corpo: Record<string, unknown>) => {
    setEnviando(true);
    try {
      const resposta = await fetch('/api/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...corpo, forcar: true }),
      });
      await concluir(resposta, await resposta.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha de conexão com o servidor local.';
      toast.error('Não foi possível enviar', { description: msg });
      onResult({ sucesso: false, httpStatus: 0, erros: [msg] });
    } finally {
      setEnviando(false);
    }
  };

  const executar = async () => {
    setEnviando(true);
    const campos = useEventStore.getState().camposEvento();

    try {
      const quando = lerEventTime(campos.eventTime);
      const unix = quando
        ? Math.floor(quando.getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      const corpo = {
          brandId: ativa?.id ?? 'default',
          event: {
            event_name:
              campos.eventName === 'Custom'
                ? campos.customEventName || 'CustomEvent'
                : campos.eventName,
            event_time: unix,
            event_id: campos.eventId?.trim() || undefined,
            event_source_url: campos.sourceUrl?.trim() || undefined,
            action_source: 'website',
            user: {
              email: campos.email?.trim() || undefined,
              phone: campos.phone?.trim() || undefined,
              addDDI: campos.addDDI !== false,
              firstName: campos.firstName?.trim() || undefined,
              lastName: campos.lastName?.trim() || undefined,
              externalId: campos.externalId?.trim() || undefined,
              fbc: campos.fbc?.trim() || undefined,
              fbp: campos.fbp?.trim() || undefined,
              ip: campos.ip?.trim() || undefined,
              userAgent: campos.userAgent?.trim() || undefined,
            },
            custom: {
              value: campos.value !== '' ? Number(campos.value) : undefined,
              currency: campos.currency?.trim() || 'BRL',
              orderId: campos.orderId?.trim() || undefined,
              contentName: campos.contentName?.trim() || undefined,
            },
          },
      };

      const resposta = await fetch('/api/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });

      const dados = await resposta.json();

      // 409: este event_id já foi aceito neste pixel. Reenviar conta a venda
      // duas vezes, então quem decide é a pessoa — não o código.
      if (resposta.status === 409 && dados.duplicado) {
        toast.warning('Esta conversão já foi enviada', {
          description:
            'A Meta já aceitou este event_id neste pixel. Reenviar contaria a venda duas vezes.',
          duration: 12000,
          action: {
            label: 'Enviar mesmo assim',
            onClick: () => void reenviarForcado(corpo),
          },
        });
        onResult({ sucesso: false, httpStatus: 409, dados, erros: dados.erros });
        return;
      }

      await concluir(resposta, dados);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Falha de conexão com o servidor local.';
      toast.error('Não foi possível enviar', { description: msg });
      onResult({ sucesso: false, httpStatus: 0, erros: [msg] });
    } finally {
      setEnviando(false);
    }
  };

  /** O caminho por onde TODO disparo passa: valida, checa token, confirma. */
  const solicitar = () => {
    marcarSubmetido(true);
    const erros = useEventStore.getState().erros();

    if (erros.length) {
      toast.error(
        erros.length === 1
          ? 'Corrija 1 campo antes de disparar'
          : `Corrija ${erros.length} campos antes de disparar`,
        { description: erros[0].mensagem }
      );
      const resumo = document.getElementById('resumo-erros');
      resumo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      resumo?.focus();
      return;
    }

    if (!ativa?.temToken) {
      toast.error('Marca sem token de acesso', {
        description: 'Abra as marcas e informe o token da API de Conversões.',
      });
      onAbrirMarcas();
      return;
    }

    // Em produção nunca se dispara sem passar pela confirmação.
    if (emTeste) void executar();
    else setConfirmar(true);
  };

  return {
    ativa,
    emTeste,
    enviando,
    confirmar,
    setConfirmar,
    solicitar,
    executar,
  };
}
