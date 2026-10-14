'use client';

import React from 'react';
import { Fingerprint, Globe, Lock } from '@/components/ui/icones';

import { useEventStore } from '@/stores/useEventStore';
import { Field, Section } from '@/components/common/primitives';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { WhatsAppMark } from '@/components/ui/brand-icons';
import { IconeDoAssunto } from '@/components/cenas';

/** O3: o ícone do título com a cor e a entrada curta do assunto. */
function IconeDoCliente() {
  return <IconeDoAssunto assunto="evento" icone={Fingerprint} />;
}

export function CustomerSection() {
  const s = useEventStore();
  const erros = useEventStore((st) => st.errosVisiveis)();
  const tocar = useEventStore((st) => st.tocar);
  const setField = useEventStore((st) => st.setField);

  const blur = (campo: string) => () => tocar(campo);

  return (
    <Section
      id="secao-cliente"
      step={3}
      icon={IconeDoCliente}
      variant="card"
      title="Quem é o cliente"
      description="Quanto mais dados, mais fácil a Meta reconhecer a pessoa."
    >
      {/* E5: o que vai embaralhado e o que vai aberto, em duas linhas com
          ícone estático (sem cena). O embaralhamento é SHA-256, feito antes do
          envio; o dado legível nunca sai daqui. */}
      <ul className="mb-4 flex flex-col gap-1.5 text-caption text-fg-body">
        <li className="flex items-start gap-2">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          Embaralhados: e-mail, telefone, nome, CPF.
        </li>
        <li className="flex items-start gap-2">
          <Globe className="mt-0.5 size-3.5 shrink-0 text-fg-muted" aria-hidden />
          Vão abertos: fbc, IP, fbp, navegador.
        </li>
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="campo-email"
          label="E-mail"
          param="em"
          error={erros.email}
        >
          <Input
            id="campo-email"
            type="email"
            autoComplete="email"
            value={s.email}
            onChange={(e) => setField('email', e.target.value)}
            onBlur={blur('email')}
            placeholder="cliente@exemplo.com.br"
          />
        </Field>

        <Field
          id="campo-telefone"
          label="Telefone"
          param="ph"
          helper={
            <span className="inline-flex items-center gap-1.5">
              <WhatsAppMark size={13} />
              Com DDD. De fora, com o DDI (+598…).
            </span>
          }
          error={erros.phone}
          action={
            <label className="flex cursor-pointer items-center gap-2 text-caption text-fg-muted">
              <Checkbox
                checked={s.addDDI}
                onCheckedChange={(v) => setField('addDDI', Boolean(v))}
              />
              DDI automático
            </label>
          }
        >
          <Input
            id="campo-telefone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={s.phone}
            onChange={(e) => setField('phone', e.target.value)}
            onBlur={blur('phone')}
            placeholder="11987654321"
            className="font-mono tabular"
          />
        </Field>

        <Field
          id="campo-nome"
          label="Nome"
          param="fn"
          helper="Primeiro nome, como veio do checkout."
        >
          <Input
            id="campo-nome"
            autoComplete="given-name"
            value={s.firstName}
            onChange={(e) => setField('firstName', e.target.value)}
            placeholder="Carlos"
          />
        </Field>

        <Field
          id="campo-sobrenome"
          label="Sobrenome"
          param="ln"
          helper="Restante do nome."
        >
          <Input
            id="campo-sobrenome"
            autoComplete="family-name"
            value={s.lastName}
            onChange={(e) => setField('lastName', e.target.value)}
            placeholder="Eduardo Silva"
          />
        </Field>

        <Field
          id="campo-cpf"
          label="CPF"
          param="external_id"
          helper="Ou o ID do cliente no CRM."
          className="sm:col-span-2"
        >
          <Input
            id="campo-cpf"
            inputMode="numeric"
            value={s.externalId}
            onChange={(e) => setField('externalId', e.target.value)}
            placeholder="12345678901"
            className="font-mono tabular"
          />
        </Field>

        <div className="sm:col-span-2 mt-2 border-t border-line pt-4">
          <h3 className="flex items-center gap-2 text-label font-semibold text-fg-strong">
            <Fingerprint className="size-4 text-tinta-texto" aria-hidden />
            Dados de rastreamento
          </h3>
        </div>

        <div className="min-w-0">
          <Field
            id="campo-fbc"
            label="Click ID do anúncio"
            param="fbc"
            helper="Liga a venda ao anúncio. Vem do cookie _fbc ou do ?fbclid=."
            error={erros.fbc}
            tip="Formato fb.1.<timestamp em ms>.<fbclid>. É o único parâmetro que liga a venda ao anúncio exato no Gerenciador; sem ele a Meta atribui por aproximação."
          >
            <Input
              id="campo-fbc"
              value={s.fbc}
              onChange={(e) => setField('fbc', e.target.value)}
              onBlur={blur('fbc')}
              placeholder="fb.1.1712345678000.IwAR3wXYZ..."
              className="wrap-token font-mono"
              spellCheck={false}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field
            id="campo-ip"
            label="IP do cliente"
            param="client_ip_address"
            helper="IP público do comprador."
            error={erros.ip}
            tip="IP de proxy, de rede interna (10.x, 192.168.x, 172.16–31.x) ou loopback não serve: a Meta descarta e o dado geográfico fica errado."
          >
            <Input
              id="campo-ip"
              value={s.ip}
              onChange={(e) => setField('ip', e.target.value)}
              onBlur={blur('ip')}
              placeholder="187.54.12.89"
              className="font-mono tabular"
            />
          </Field>
        </div>

        <div className="min-w-0">
          <Field
            id="campo-fbp"
            label="ID do navegador"
            param="fbp"
            helper="Cookie _fbp, gerado pelo Pixel no seu domínio."
            error={erros.fbp}
          >
            <Input
              id="campo-fbp"
              value={s.fbp}
              onChange={(e) => setField('fbp', e.target.value)}
              onBlur={blur('fbp')}
              placeholder="fb.1.1712345678000.1098765432"
              className="wrap-token font-mono"
              spellCheck={false}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field
            id="campo-ua"
            label="User agent"
            param="client_user_agent"
            helper="Revela se a compra veio da WebView do Instagram ou do Facebook."
          >
            <Input
              id="campo-ua"
              value={s.userAgent}
              onChange={(e) => setField('userAgent', e.target.value)}
              placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64) ..."
              className="wrap-token font-mono"
              spellCheck={false}
            />
          </Field>
        </div>
      </div>
    </Section>
  );
}

export default CustomerSection;
