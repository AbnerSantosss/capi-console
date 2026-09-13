'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Save, Search, ShieldAlert, Trash2, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Field, Callout, StatusDot } from '@/components/common/primitives';
import { SeletorDePixel } from '@/components/pixels/SeletorDePixel';
import { useBrandStore } from '@/stores/useBrandStore';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import { EVENTOS_META } from '@/lib/meta-events';
import { MAPA_EVENTOS_ORIGEM } from '@/lib/parser';
import { motivoDaRegraIgnorar, parMeta } from './eventos-legiveis';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
// Fonte unica da forma da regra (13.B). Ate aqui existia uma copia local
// identica a de config-store, livre para divergir em silencio: o servidor
// aceitava um campo que o formulario nao sabia escrever, e ninguem via.
// `import type` e apagado na compilacao, entao o `server-only` do modulo nao
// atravessa para o pacote do cliente.
import type { ModoRegra, RegraRoteamento } from '@/lib/config-store';

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
  // A lista vem do store, nunca de uma leitura propria desta tela (IA-R8):
  // esta secao e a Caixa de entrada liam a mesma coisa em dois lugares, e duas
  // copias da lista de Pixel podem divergir dentro da mesma sessao.
  const marcas = useBrandStore((s) => s.marcas);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todas' | ModoRegra | 'desativadas'>('todas');
  const [abertas, setAbertas] = useState<string[]>([]);

  const trocar = (i: number, mudanca: Partial<RegraRoteamento>) => {
    const novas = [...regras];
    novas[i] = { ...novas[i], ...mudanca };
    onChange(novas);
  };

  const adicionar = () => {
    const id = `r_${Date.now().toString(36)}`;
    onChange([
      ...regras,
      {
        id,
        eventoOrigem: '',
        eventoMeta: 'Purchase',
        marcas: ['default'],
        modo: 'fila',
        ativo: true,
      },
    ]);
    setBusca('');
    setFiltro('todas');
    setAbertas((atuais) => [...new Set([...atuais, id])]);
    window.setTimeout(() => document.getElementById(`origem-${id}`)?.focus(), 0);
  };

  const salvar = async () => {
    const semNome = regras.find((r) => !r.eventoOrigem.trim());
    if (semNome) {
      setAbertas((atuais) => [...new Set([...atuais, semNome.id])]);
      window.setTimeout(
        () => document.getElementById(`origem-${semNome.id}`)?.focus(),
        0
      );
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

  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const visiveis = regras
    .map((regra, indice) => ({ regra, indice }))
    .filter(({ regra }) => {
      // Busca também pelo rótulo em português: quem opera procura por "compra",
      // não por "Purchase".
      const correspondeBusca =
        !termo ||
        regra.eventoOrigem.toLocaleLowerCase('pt-BR').includes(termo) ||
        regra.eventoMeta.toLocaleLowerCase('pt-BR').includes(termo) ||
        (parMeta(regra.eventoMeta)?.pt ?? '').toLocaleLowerCase('pt-BR').includes(termo);
      const correspondeFiltro =
        filtro === 'todas'
          ? true
          : filtro === 'desativadas'
            ? !regra.ativo
            : regra.modo === filtro;
      return correspondeBusca && correspondeFiltro;
    });

  const filtros: Array<{ value: typeof filtro; label: string }> = [
    { value: 'todas', label: 'Todas' },
    { value: 'fila', label: 'Fila' },
    { value: 'auto', label: 'Automático' },
    { value: 'ignorar', label: 'Ignorar' },
    { value: 'desativadas', label: 'Desativadas' },
  ];

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

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2/70 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar regra</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
              strokeWidth={1.75}
              aria-hidden
            />
            <Input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por purchase_approved, Purchase ou compra"
              className="w-full pl-9"
            />
          </label>
          <div className="flex flex-wrap gap-1" aria-label="Filtrar regras">
            {filtros.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filtro === item.value}
                onClick={() => setFiltro(item.value)}
                className={cn(
                  'min-h-10 rounded-control border px-3 text-caption font-medium transition-colors',
                  filtro === item.value
                    ? 'border-accent-text/50 bg-accent-text/10 text-accent-text'
                    : 'border-line text-fg-muted hover:border-line-control hover:text-fg-body'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
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
            {visiveis.length} de {regras.length} regra{regras.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {visiveis.length === 0 ? (
        /* C-12: lista vazia e lista filtrada sao perguntas diferentes. Sem a
           separacao, quem nunca criou regra recebia "remova os filtros" — um
           conselho sobre filtros que ele nunca aplicou. */
        regras.length === 0 ? (
          <EstadoVazio
            icone={Zap}
            titulo="Nenhuma regra de roteamento"
            motivo="Sem regra, todo webhook que chega fica parado na fila esperando um clique. Uma regra diz qual evento do xWinner vira qual evento da Meta, e se ele sai sozinho."
            acao={
              <Button variant="outline" onClick={adicionar}>
                <Plus className="size-4" aria-hidden />
                Nova regra
              </Button>
            }
          />
        ) : (
          <EstadoVazio
            cenario="filtrado"
            titulo="Nenhuma regra encontrada"
            motivo={`As ${regras.length} regras existentes não casam com a busca ou com o filtro atual.`}
            acao={
              <Button
                variant="outline"
                onClick={() => {
                  setBusca('');
                  setFiltro('todas');
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        )
      ) : (
      <Accordion
        multiple
        value={abertas}
        onValueChange={(value) => setAbertas(value as string[])}
        className="gap-3"
      >
        {visiveis.map(({ regra: r, indice: i }) => {
          const foraDoCatalogo =
            r.eventoOrigem.trim() !== '' &&
            r.eventoOrigem !== '*' &&
            !NOMES_CATALOGO.includes(r.eventoOrigem);
          const par = r.modo === 'ignorar' ? null : parMeta(r.eventoMeta);
          const personalizado = r.modo !== 'ignorar' && r.eventoMeta !== '' && par?.padrao === false;
          // O par só faz sentido dito por inteiro: nome do xWinner, nome técnico
          // que aparece no Gerenciador e a tradução do que aquilo significa.
          const explicacao =
            r.modo === 'ignorar'
              ? motivoDaRegraIgnorar(r.eventoOrigem)
              : par
                ? par.descricao
                : 'Sem evento da Meta escolhido: nada seria enviado.';

          return (
            <AccordionItem
              key={r.id}
              value={r.id}
              className="overflow-hidden rounded-xl border border-line-strong bg-surface-2/55 last:border-b"
            >
              <AccordionTrigger className="min-h-14 px-4 py-3 hover:no-underline">
                <span className="flex min-w-0 flex-1 flex-col gap-1.5 pr-3 text-left">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusDot tone={r.ativo ? 'success' : 'neutral'}>
                      {r.ativo ? 'Ativa' : 'Desativada'}
                    </StatusDot>
                    <span className="text-caption text-fg-muted uppercase">xWinner</span>
                    <span className="min-w-0 break-words font-mono text-label font-semibold text-fg-strong">
                      {r.eventoOrigem || 'Nova regra'}
                    </span>
                    <span className="text-fg-muted" aria-hidden>
                      →
                    </span>
                    {par ? (
                      <>
                        <span className="text-caption text-fg-muted uppercase">Meta</span>
                        <span className="text-label font-semibold text-fg-strong">{par.pt}</span>
                        <span className="break-words font-mono text-caption text-fg-body">
                          {par.tecnico}
                        </span>
                      </>
                    ) : (
                      <span className="text-label font-semibold text-fg-muted">
                        {r.modo === 'ignorar' ? 'Não enviar' : 'Sem evento da Meta escolhido'}
                      </span>
                    )}
                    <Badge className="w-fit">
                      {MODOS.find((m) => m.valor === r.modo)?.rotulo}
                    </Badge>
                  </span>
                  <span className="text-caption font-normal text-fg-muted">{explicacao}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="border-t border-line px-4 pt-4 pb-4">
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
                    label="Nome do evento no xWinner"
                    helper={
                      foraDoCatalogo
                        ? 'Nome fora do catálogo conhecido do xWinner.'
                        : 'Nome técnico exato, como a plataforma manda. Use * para qualquer evento sem regra própria.'
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
                    label="Vira qual evento padrão da Meta"
                    helper={
                      r.modo === 'ignorar'
                        ? 'Não se aplica: esta regra não envia nada à Meta.'
                        : personalizado
                          ? 'Fora dos padrões da Meta: vira evento personalizado e não otimiza campanha.'
                          : par
                            ? `No Gerenciador de Eventos aparece como ${par.tecnico}.`
                            : undefined
                    }
                  >
                    <Select
                      value={r.modo === 'ignorar' ? '' : r.eventoMeta}
                      onValueChange={(v) => v && trocar(i, { eventoMeta: String(v) })}
                    >
                      <SelectTrigger id={`meta-${r.id}`} className="w-full">
                        <span className="flex min-w-0 items-baseline gap-2">
                          {r.modo === 'ignorar' ? (
                            <span className="text-fg-muted">— não envia</span>
                          ) : par ? (
                            <>
                              <span className="truncate text-fg-strong">{par.pt}</span>
                              <span className="font-mono text-caption text-fg-muted">
                                {par.tecnico}
                              </span>
                            </>
                          ) : (
                            <span className="text-fg-muted">escolher</span>
                          )}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        {EVENTOS_META.filter((e) => e.value !== 'Custom').map((e) => (
                          <SelectItem key={e.value} value={e.value}>
                            <span className="flex min-w-0 items-start gap-2">
                              <e.icon className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
                              <span className="flex min-w-0 flex-col">
                                <span className="text-label font-medium text-fg-body">
                                  {e.rotuloPt}{' '}
                                  <span className="font-mono text-caption text-fg-muted">
                                    {e.value}
                                  </span>
                                </span>
                                <span className="text-caption text-fg-muted">
                                  {'somenteManual' in e && e.somenteManual
                                    ? 'O xWinner não manda este evento hoje — só para uso manual.'
                                    : e.descricao}
                                </span>
                              </span>
                            </span>
                          </SelectItem>
                        ))}
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
                  <SeletorDePixel
                    modo="varios"
                    rotulo="Enviar para os pixels"
                    valor={r.marcas}
                    onChange={(ids) => trocar(i, { marcas: ids })}
                  />
                )}
              </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      )}

      <datalist id="eventos-origem">
        {NOMES_CATALOGO.map((n) => (
          <option key={n} value={n} />
        ))}
        <option value="*" />
      </datalist>

      <p className="text-caption text-fg-muted">
        {regras.length} regra{regras.length === 1 ? '' : 's'} ·{' '}
        {regras.filter((r) => r.ativo && r.modo === 'auto').length} automática
        {regras.filter((r) => r.ativo && r.modo === 'auto').length === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export default RulesSection;
