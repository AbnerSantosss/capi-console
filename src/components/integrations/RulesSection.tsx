'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Save, ShieldAlert, Trash2, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Field, Callout, StatusDot } from '@/components/common/primitives';
import { EVENTOS_META } from '@/lib/meta-events';
import { MAPA_EVENTOS_ORIGEM } from '@/lib/parser';

export type ModoRegra = 'auto' | 'fila' | 'ignorar';

export interface RegraRoteamento {
  id: string;
  eventoOrigem: string;
  eventoMeta: string;
  marcas: string[];
  modo: ModoRegra;
  ativo: boolean;
}

interface MarcaPublica {
  id: string;
  nome: string;
  pixelId: string;
  temToken: boolean;
  testCode: string;
}

const MODOS: { valor: ModoRegra; rotulo: string; ajuda: string }[] = [
  { valor: 'auto', rotulo: 'Automático', ajuda: 'Dispara sozinho, sem revisão humana.' },
  { valor: 'fila', rotulo: 'Fila', ajuda: 'Fica na caixa de entrada esperando um clique.' },
  { valor: 'ignorar', rotulo: 'Ignorar', ajuda: 'Nunca vai para a Meta.' },
];

const NOMES_CATALOGO = Object.keys(MAPA_EVENTOS_ORIGEM);

export function RulesSection({
  regras,
  onChange,
  onSalvar,
  salvando,
}: {
  regras: RegraRoteamento[];
  onChange: (regras: RegraRoteamento[]) => void;
  onSalvar: (regras: RegraRoteamento[]) => Promise<void>;
  salvando: boolean;
}) {
  const [marcas, setMarcas] = useState<MarcaPublica[]>([]);

  useEffect(() => {
    fetch('/api/marcas', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMarcas(d.marcas ?? []))
      .catch(() => setMarcas([]));
  }, []);

  const trocar = (i: number, mudanca: Partial<RegraRoteamento>) => {
    const novas = [...regras];
    novas[i] = { ...novas[i], ...mudanca };
    onChange(novas);
  };

  const adicionar = () =>
    onChange([
      ...regras,
      {
        id: `r_${Date.now().toString(36)}`,
        eventoOrigem: '',
        eventoMeta: 'Purchase',
        marcas: ['default'],
        modo: 'fila',
        ativo: true,
      },
    ]);

  const salvar = async () => {
    const semNome = regras.find((r) => !r.eventoOrigem.trim());
    if (semNome) {
      toast.error('Há regra sem evento de origem.', {
        description: 'Preencha o nome do evento da plataforma antes de salvar.',
      });
      return;
    }
    await onSalvar(regras);
  };

  // Uma regra automática numa marca SEM código de teste manda para as métricas
  // reais da campanha. É a única combinação que gasta dinheiro sozinha.
  const marcaPorId = new Map(marcas.map((m) => [m.id, m]));
  const autoEmProducao = regras.filter(
    (r) =>
      r.ativo &&
      r.modo === 'auto' &&
      (r.marcas.length ? r.marcas : ['default']).some((id) => {
        const m = marcaPorId.get(id);
        return m ? !m.testCode?.trim() : false;
      })
  );

  return (
    <div className="flex flex-col gap-4">
      {autoEmProducao.length > 0 ? (
        <Callout tone="danger" icon={Zap} title="Há regras automáticas em PRODUÇÃO">
          {autoEmProducao.map((r) => r.eventoOrigem).join(', ')} dispara
          {autoEmProducao.length > 1 ? 'm' : ''} para a Meta sem revisão e{' '}
          <strong>entra nas métricas reais</strong> da campanha. Para testar sem
          afetar as métricas, preencha o Código de teste da marca.
        </Callout>
      ) : (
        <Callout tone="warning" icon={ShieldAlert}>
          O modo <strong>Automático</strong> envia para a Meta sem revisão humana.
          Ligue somente depois de validar no Test Events. Marcas com Código de
          teste preenchido não entram nas métricas reais.
        </Callout>
      )}

      <ul className="flex flex-col gap-3">
        {regras.map((r, i) => {
          const foraDoCatalogo =
            r.eventoOrigem.trim() !== '' &&
            r.eventoOrigem !== '*' &&
            !NOMES_CATALOGO.includes(r.eventoOrigem);
          const personalizado =
            r.modo !== 'ignorar' &&
            r.eventoMeta !== '' &&
            !EVENTOS_META.some((e) => e.value === r.eventoMeta);

          return (
            <li
              key={r.id}
              className="rounded-panel border border-line-strong bg-surface-1 p-4"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <Checkbox
                      checked={r.ativo}
                      onCheckedChange={(v) => trocar(i, { ativo: Boolean(v) })}
                      aria-label={`Regra ${r.eventoOrigem || 'nova'} ativa`}
                    />
                    <StatusDot tone={r.ativo ? 'success' : 'neutral'}>
                      {r.ativo ? 'Ativa' : 'Desativada'}
                    </StatusDot>
                  </label>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remover a regra ${r.eventoOrigem || 'nova'}`}
                    onClick={() => onChange(regras.filter((x) => x.id !== r.id))}
                  >
                    <Trash2 className="size-3.5 text-danger" aria-hidden />
                  </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <Field
                    id={`origem-${r.id}`}
                    label="Evento da plataforma"
                    helper={
                      foraDoCatalogo
                        ? 'Nome fora do catálogo conhecido do xWinner.'
                        : 'Nome técnico exato. Use * para qualquer evento sem regra própria.'
                    }
                  >
                    <Input
                      id={`origem-${r.id}`}
                      list="eventos-origem"
                      value={r.eventoOrigem}
                      placeholder="purchase_approved"
                      onChange={(e) => trocar(i, { eventoOrigem: e.target.value.trim() })}
                      className="font-mono"
                    />
                  </Field>

                  <Field
                    id={`meta-${r.id}`}
                    label="Evento da Meta"
                    helper={
                      r.modo === 'ignorar'
                        ? 'Não se aplica: esta regra ignora o evento.'
                        : personalizado
                          ? 'Evento personalizado (fora dos padrões da Meta).'
                          : undefined
                    }
                  >
                    <Select
                      value={r.modo === 'ignorar' ? '' : r.eventoMeta}
                      onValueChange={(v) => v && trocar(i, { eventoMeta: String(v) })}
                    >
                      <SelectTrigger id={`meta-${r.id}`} className="w-full">
                        <span className="font-mono text-fg-strong">
                          {r.modo === 'ignorar' ? '—' : r.eventoMeta || 'escolher'}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        {EVENTOS_META.filter((e) => e.value !== 'Custom').map((e) => (
                          <SelectItem key={e.value} value={e.value}>
                            <span className="flex items-center gap-2">
                              <e.icon className="size-4 text-fg-muted" aria-hidden />
                              <span className="font-mono">{e.label}</span>
                            </span>
                          </SelectItem>
                        ))}
                        <SelectItem value="Subscribe">
                          <span className="font-mono">Subscribe</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field
                    id={`modo-${r.id}`}
                    label="Modo"
                    helper={MODOS.find((m) => m.valor === r.modo)?.ajuda}
                  >
                    <Select
                      value={r.modo}
                      onValueChange={(v) => v && trocar(i, { modo: v as ModoRegra })}
                    >
                      <SelectTrigger id={`modo-${r.id}`} className="w-full">
                        <span className="text-fg-strong">
                          {MODOS.find((m) => m.valor === r.modo)?.rotulo}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {MODOS.map((m) => (
                          <SelectItem key={m.valor} value={m.valor}>
                            <span className="flex min-w-0 flex-col">
                              <span className="text-label font-medium text-fg-body">
                                {m.rotulo}
                              </span>
                              <span className="text-caption text-fg-muted">{m.ajuda}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {r.modo !== 'ignorar' && (
                  <fieldset>
                    <legend className="mb-2 text-label font-medium text-fg-body">
                      Enviar para os pixels
                    </legend>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {marcas.length === 0 && (
                        <span className="text-caption text-fg-muted">
                          Carregando marcas…
                        </span>
                      )}
                      {marcas.map((m) => (
                        <label
                          key={m.id}
                          className="flex cursor-pointer items-center gap-2 text-caption text-fg-body"
                        >
                          <Checkbox
                            checked={r.marcas.includes(m.id)}
                            onCheckedChange={(v) =>
                              trocar(i, {
                                marcas: v
                                  ? [...r.marcas, m.id]
                                  : r.marcas.filter((x) => x !== m.id),
                              })
                            }
                          />
                          <span>{m.nome}</span>
                          <span className="font-mono text-micro text-fg-muted">
                            {m.pixelId || 'sem pixel'}
                          </span>
                          {m.testCode?.trim() ? (
                            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-micro font-semibold text-warning uppercase">
                              teste
                            </span>
                          ) : null}
                          {!m.temToken && (
                            <span className="rounded-full border border-danger/40 px-2 py-0.5 text-micro text-danger uppercase">
                              sem token
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <datalist id="eventos-origem">
        {NOMES_CATALOGO.map((n) => (
          <option key={n} value={n} />
        ))}
        <option value="*" />
      </datalist>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={adicionar}>
          <Plus className="size-4" aria-hidden />
          Adicionar regra
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          <Save className="size-4" aria-hidden />
          {salvando ? 'Salvando…' : 'Salvar regras'}
        </Button>
        <span className="text-caption text-fg-muted">
          {regras.length} regra{regras.length === 1 ? '' : 's'} ·{' '}
          {regras.filter((r) => r.ativo && r.modo === 'auto').length} automática
          {regras.filter((r) => r.ativo && r.modo === 'auto').length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

export default RulesSection;
