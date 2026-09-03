'use client';

import React from 'react';
import { Clock, Wand2 } from 'lucide-react';

import { useEventStore, agoraLocal } from '@/stores/useEventStore';
import { EVENTOS_META, acharEvento } from '@/lib/meta-events';
import { janelaRestante } from '@/lib/event-schema';
import { Field, Section, ParamChip } from '@/components/common/primitives';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PixMark } from '@/components/ui/brand-icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

export function TransactionSection() {
  const s = useEventStore();
  const erros = useEventStore((st) => st.errosVisiveis)();
  const tocar = useEventStore((st) => st.tocar);
  const setField = useEventStore((st) => st.setField);

  const evento = acharEvento(s.eventName);
  const janela = janelaRestante(s.eventTime);

  const blur = (campo: string) => () => tocar(campo);

  return (
    <Section
      id="secao-evento"
      step={2}
      title="Evento e transação"
      description="O que aconteceu, quando e por quanto."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Evento */}
        <div className="sm:col-span-2">
          <Field
            id="campo-evento"
            label="Evento"
            param="event_name"
            required
            helper={evento.descricao}
            error={erros.eventName}
          >
            <Select
              value={s.eventName}
              onValueChange={(v) => v && setField('eventName', String(v))}
            >
              <SelectTrigger id="campo-evento" className="w-full">
                <span className="flex items-center gap-2">
                  <evento.icon className="size-4 text-accent-text" aria-hidden />
                  <span className="font-medium text-fg-strong">{evento.label}</span>
                </span>
              </SelectTrigger>
              <SelectContent className="max-h-96 min-w-80">
                {EVENTOS_META.map((e) => (
                  <SelectItem key={e.value} value={e.value} className="py-2">
                    <span className="flex items-start gap-2.5">
                      <e.icon
                        className="mt-0.5 size-4 shrink-0 text-fg-muted"
                        aria-hidden
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-label font-medium text-fg-body">
                          {e.label}
                        </span>
                        <span className="text-caption text-fg-muted">
                          {e.descricao}
                        </span>
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Nome do evento personalizado */}
        {s.eventName === 'Custom' && (
          <div className="sm:col-span-2">
            <Field
              id="campo-custom"
              label="Nome do evento"
              required
              helper="Escreva exatamente como está no Gerenciador de Eventos. Diferencia maiúsculas."
              error={erros.customEventName}
            >
              <Input
                id="campo-custom"
                value={s.customEventName}
                onChange={(e) => setField('customEventName', e.target.value)}
                onBlur={blur('customEventName')}
                placeholder="Lead_VIP"
                className="font-mono"
              />
            </Field>
          </div>
        )}

        {/* Valor */}
        <Field
          id="campo-valor"
          label="Valor"
          param="value"
          required={evento.exigeValor}
          helper={
            <span className="inline-flex items-center gap-1.5">
              <PixMark size={13} />
              Valor decimal da venda. Ex.: 197.00
            </span>
          }
          error={erros.value}
        >
          <Input
            id="campo-valor"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={s.value}
            onChange={(e) => setField('value', e.target.value)}
            onBlur={blur('value')}
            placeholder="197.00"
            className="font-mono tabular"
          />
        </Field>

        {/* Moeda */}
        <Field
          id="campo-moeda"
          label="Moeda"
          param="currency"
          required={evento.exigeValor}
          helper="Código ISO de 3 letras."
          error={erros.currency}
        >
          <Input
            id="campo-moeda"
            value={s.currency}
            onChange={(e) => setField('currency', e.target.value.toUpperCase())}
            onBlur={blur('currency')}
            placeholder="BRL"
            maxLength={3}
            className="font-mono uppercase"
          />
        </Field>

        {/* Quando */}
        <Field
          id="campo-quando"
          label="Quando aconteceu"
          param="event_time"
          required
          helper={
            janela
              ? `A Meta só aceita eventos dos últimos 7 dias. ${janela.texto}.`
              : 'A Meta só aceita eventos dos últimos 7 dias.'
          }
          error={erros.eventTime}
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setField('eventTime', agoraLocal())}
            >
              <Clock className="size-3.5" aria-hidden />
              Agora
            </Button>
          }
        >
          <Input
            id="campo-quando"
            type="datetime-local"
            step="1"
            value={s.eventTime}
            onChange={(e) => setField('eventTime', e.target.value)}
            onBlur={blur('eventTime')}
            className="font-mono tabular"
          />
        </Field>

        {/* Event ID */}
        <Field
          id="campo-eventid"
          label="ID do evento"
          param="event_id"
          helper="Evita contagem dupla se o Pixel também disparar. Use order_<número>."
          error={erros.eventId}
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setField(
                  'eventId',
                  s.orderId ? `order_${s.orderId}` : `evt_${Date.now()}`
                )
              }
            >
              <Wand2 className="size-3.5" aria-hidden />
              Gerar
            </Button>
          }
        >
          <Input
            id="campo-eventid"
            value={s.eventId}
            onChange={(e) => setField('eventId', e.target.value)}
            onBlur={blur('eventId')}
            placeholder="order_118"
            className="wrap-token font-mono"
          />
        </Field>

        {/* Pedido */}
        <Field
          id="campo-pedido"
          label="Pedido"
          param="order_id"
          helper="Número do pedido no gateway de pagamento."
        >
          <Input
            id="campo-pedido"
            value={s.orderId}
            onChange={(e) => setField('orderId', e.target.value)}
            placeholder="118"
            className="font-mono tabular"
          />
        </Field>

        {/* Produto */}
        <Field
          id="campo-produto"
          label="Produto"
          param="content_name"
          helper="Aparece nos relatórios do Gerenciador de Anúncios."
        >
          <Input
            id="campo-produto"
            value={s.contentName}
            onChange={(e) => setField('contentName', e.target.value)}
            placeholder="Acesso Código Vencedor"
          />
        </Field>

        {/* URL */}
        <div className="sm:col-span-2">
          <Field
            id="campo-url"
            label="URL da página"
            param="event_source_url"
            helper="Cole a URL com ?fbclid= e as UTMs — é dela que sai a atribuição ao criativo."
            error={erros.sourceUrl}
          >
            <Input
              id="campo-url"
              type="url"
              value={s.sourceUrl}
              onChange={(e) => setField('sourceUrl', e.target.value)}
              onBlur={blur('sourceUrl')}
              placeholder="https://codigovencedor.com/checkout?fbclid=...&utm_campaign=..."
              className="wrap-token font-mono"
            />
          </Field>
        </div>
      </div>

      {/* Resumo dos parametros de atribuicao lidos da URL */}
      {s.sourceUrl && <ResumoUtms url={s.sourceUrl} />}
    </Section>
  );
}

function ResumoUtms({ url }: { url: string }) {
  const pega = (nome: string) => {
    const m = url.match(new RegExp('[?&]' + nome + '=([^&#]+)'));
    return m ? decodeURIComponent(m[1]) : '';
  };

  const itens = [
    { rotulo: 'campanha', valor: pega('utm_campaign') || pega('utm_id') },
    { rotulo: 'conjunto', valor: pega('utm_term') },
    { rotulo: 'anúncio', valor: pega('ad_id') || pega('utm_content') },
    { rotulo: 'fbclid', valor: pega('fbclid') },
  ].filter((i) => i.valor);

  if (!itens.length) return null;

  return (
    <div className="rounded-control border border-line bg-surface-2 p-3">
      <p className="mb-2 text-micro font-semibold tracking-wide text-fg-muted uppercase">
        Lido da URL
      </p>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {itens.map((i) => (
          <div key={i.rotulo} className="flex items-center gap-2">
            <dt className="text-caption text-fg-muted">{i.rotulo}</dt>
            <dd>
              <ParamChip className="tabular">
                {i.valor.length > 24 ? `${i.valor.slice(0, 21)}...` : i.valor}
              </ParamChip>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default TransactionSection;
