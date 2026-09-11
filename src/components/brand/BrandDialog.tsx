'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Check, Eye, EyeOff, Plus, ShieldCheck, Trash2 } from 'lucide-react';

import { pedir } from '@/lib/cliente-api';
import { useBrandStore, type MarcaPublica } from '@/stores/useBrandStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Callout, StatusDot } from '@/components/common/primitives';
import { MetaMark } from '@/components/ui/brand-icons';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const VAZIA = {
  id: '',
  nome: '',
  pixelId: '',
  accessToken: '',
  testCode: '',
  adAccountId: '',
};

export function BrandDialog({ open, onOpenChange }: Props) {
  const marcas = useBrandStore((s) => s.marcas);
  const marcaAtivaId = useBrandStore((s) => s.marcaAtivaId);
  const setMarcaAtiva = useBrandStore((s) => s.setMarcaAtiva);
  const carregar = useBrandStore((s) => s.carregar);

  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState({ ...VAZIA });
  const [verToken, setVerToken] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const abrirEdicao = (m: MarcaPublica) => {
    setEditando(m.id);
    setForm({
      id: m.id,
      nome: m.nome,
      pixelId: m.pixelId,
      accessToken: '',
      testCode: m.testCode ?? '',
      adAccountId: m.adAccountId ?? '',
    });
    setVerToken(false);
  };

  const abrirNova = () => {
    setEditando('novo');
    setForm({ ...VAZIA, id: `marca_${Date.now().toString(36)}` });
    setVerToken(false);
  };

  const salvar = async () => {
    if (!form.nome.trim()) return toast.error('Informe o nome da marca.');
    if (!form.pixelId.trim()) return toast.error('Informe o Pixel ID.');

    setSalvando(true);
    try {
      await pedir('/api/marcas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      await carregar();
      setEditando(null);
      toast.success('Marca salva', {
        description: 'O token ficou guardado no servidor, fora do navegador.',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (id: string) => {
    try {
      await pedir(`/api/marcas?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await carregar();
      toast.success('Marca removida.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao remover.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="console" className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-heading font-semibold text-fg-strong">
            Pixels de destino
          </DialogTitle>
          <DialogDescription className="text-caption text-fg-muted">
            Cada marca guarda um Pixel, o token de acesso e o código de teste.
            É para onde o evento vai quando você dispara.
          </DialogDescription>
        </DialogHeader>

        {editando === null ? (
          <>
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {marcas.map((m) => {
                const ativa = m.id === marcaAtivaId;
                const emTeste = Boolean(m.testCode?.trim());
                return (
                  <li key={m.id}>
                    <div
                      className={cn(
                        'flex items-center gap-3 rounded-control border p-3 transition-colors',
                        ativa
                          ? 'border-accent-text/50 bg-accent-text/8'
                          : 'border-line-strong bg-surface-2'
                      )}
                    >
                      <MetaMark size={18} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-label font-semibold text-fg-strong">
                          {m.nome}
                          {ativa && (
                            <Check className="size-3.5 text-accent-text" aria-hidden />
                          )}
                          {ativa && <span className="sr-only">(marca ativa)</span>}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-caption text-fg-muted tabular">
                          <span>Pixel {m.pixelId || '—'}</span>
                          <StatusDot tone={m.temToken ? 'success' : 'danger'}>
                            {m.temToken ? 'token ok' : 'sem token'}
                          </StatusDot>
                          <StatusDot tone={emTeste ? 'accent' : 'warning'}>
                            {emTeste ? `teste ${m.testCode}` : 'produção'}
                          </StatusDot>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!ativa && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMarcaAtiva(m.id)}
                          >
                            Usar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => abrirEdicao(m)}
                        >
                          Editar
                        </Button>
                        {m.id !== 'default' && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remover a marca ${m.nome}`}
                            onClick={() => remover(m.id)}
                          >
                            <Trash2 className="size-3.5 text-danger" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <DialogFooter className="flex-row justify-between">
              <Button variant="outline" onClick={abrirNova}>
                <Plus className="size-4" aria-hidden />
                Nova marca
              </Button>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <Field
                id="marca-nome"
                label="Nome"
                required
                helper="Como esta marca aparece no console."
              >
                <Input
                  id="marca-nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Código Vencedor"
                />
              </Field>

              <Field
                id="marca-pixel"
                label="Pixel ID"
                param="pixel_id"
                required
                helper="Gerenciador de Eventos → Fontes de dados → o número abaixo do nome."
              >
                <Input
                  id="marca-pixel"
                  value={form.pixelId}
                  onChange={(e) => setForm({ ...form, pixelId: e.target.value })}
                  placeholder="1624114999139319"
                  className="font-mono tabular"
                  inputMode="numeric"
                />
              </Field>

              <Field
                id="marca-token"
                label="Token de acesso"
                helper={
                  editando !== 'novo'
                    ? 'Deixe em branco para manter o token atual. O valor fica só no servidor.'
                    : 'Gerenciador de Eventos → Configurações → API de Conversões → Gerar token.'
                }
                action={
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setVerToken((v) => !v)}
                    aria-label={verToken ? 'Ocultar o token' : 'Mostrar o token'}
                  >
                    {verToken ? (
                      <EyeOff className="size-3.5" aria-hidden />
                    ) : (
                      <Eye className="size-3.5" aria-hidden />
                    )}
                    {verToken ? 'Ocultar' : 'Mostrar'}
                  </Button>
                }
              >
                <Input
                  id="marca-token"
                  type={verToken ? 'text' : 'password'}
                  value={form.accessToken}
                  onChange={(e) =>
                    setForm({ ...form, accessToken: e.target.value })
                  }
                  placeholder={editando !== 'novo' ? '••••••••••••' : 'EAAG...'}
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="marca-teste"
                  label="Código de teste"
                  param="test_event_code"
                  helper="Com ele preenchido, nada entra nas métricas reais."
                >
                  <Input
                    id="marca-teste"
                    value={form.testCode}
                    onChange={(e) =>
                      setForm({ ...form, testCode: e.target.value })
                    }
                    placeholder="TEST12345"
                    className="font-mono"
                  />
                </Field>

                <Field
                  id="marca-conta"
                  label="Conta de anúncios"
                  param="ad_account_id"
                  helper="Necessária para o link direto do criativo no Gerenciador."
                >
                  <Input
                    id="marca-conta"
                    value={form.adAccountId}
                    onChange={(e) =>
                      setForm({ ...form, adAccountId: e.target.value })
                    }
                    placeholder="act_123456789"
                    className="font-mono tabular"
                  />
                </Field>
              </div>

              <Callout tone="info" icon={ShieldCheck}>
                O token nunca é enviado de volta ao navegador nem gravado no
                <code className="mx-1 font-mono">localStorage</code>. Ele fica em
                <code className="mx-1 font-mono">config/marcas.json</code>, que
                está no <code className="font-mono">.gitignore</code>.
              </Callout>
            </div>

            <DialogFooter className="flex-row justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar marca'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BrandDialog;
