'use client';

import React from 'react';
import { Fingerprint, Lock } from '@/components/ui/icones';

import { useEventStore } from '@/stores/useEventStore';
import { Field, Section } from '@/components/common/primitives';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { WhatsAppMark } from '@/components/ui/brand-icons';

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
      icon={Fingerprint}
      variant="card"
      title="Quem é o cliente"
      description={
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-3 text-success" aria-hidden />
          Quanto mais dados, maior a chance de a Meta reconhecer a pessoa. E-mail,
          telefone, nome e CPF saem embaralhados em SHA-256 — a Meta nunca recebe o dado legível.
        </span>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="campo-email"
          label="E-mail"
          param="em"
          helper="Transformado em hash SHA-256 antes do envio. Se já chegar em hash, passa como está."
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
              Com DDD. De fora do Brasil, com o DDI (+598…). O país sai do próprio número.
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
          helper="Ou o ID do cliente no seu CRM. Também vai transformado em hash SHA-256."
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
          <p className="mt-1 text-caption text-fg-muted">
            Estes dados seguem o formato exigido pela Meta e não recebem SHA-256.
          </p>
        </div>

        <div className="min-w-0">
          <Field
            id="campo-fbc"
            label="Click ID do anúncio"
            param="fbc"
            helper="Vale 2.5 dos 10 pontos. Vem do cookie _fbc ou do ?fbclid= da URL."
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
            helper="IP público do comprador. Vai como está, sem hash, por exigência da Meta."
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
