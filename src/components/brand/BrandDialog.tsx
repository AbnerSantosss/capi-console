'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

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
import { Field, Callout } from '@/components/common/primitives';

/**
 * O dialogo de UM Pixel — criar ou editar.
 *
 * A lista que morava aqui virou a rota /pixels (7.A). O formulario abaixo NAO
 * foi reescrito: rotulos, placeholders e helpers foram auditados e estao bons.
 * O que mudou e de onde ele e chamado e quem ele edita, que agora chega por
 * propriedade em vez de sair de um estado interno de "modo lista / modo forma".
 *
 * O campo do segredo se chama `token` neste arquivo. Nao e sinonimo solto: o
 * nome que a API espera nao pode aparecer em src/components (decisao
 * irreversivel #8), e quem traduz um no outro e o `useBrandStore`.
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pixel a editar. `null` (ou ausente) abre o formulario de um Pixel novo. */
  marca?: MarcaPublica | null;
}

const VAZIO = {
  nome: '',
  pixelId: '',
  token: '',
  testCode: '',
  adAccountId: '',
};

export function BrandDialog({ open, onOpenChange, marca = null }: Props) {
  const salvarMarca = useBrandStore((s) => s.salvarMarca);

  const [form, setForm] = useState({ ...VAZIO });
  const [verToken, setVerToken] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Semear o formulario DURANTE a renderizacao, e nao dentro de um efeito: o
  // efeito so roda depois da pintura, entao abrir "editar" pintaria um quadro
  // com os dados do Pixel anterior antes de trocar — e o lint
  // (react-hooks/set-state-in-effect) reprova, com razao, a renderizacao em
  // cascata que isso produz. Este e o padrao de "ajustar estado quando a
  // propriedade muda".
  const alvo = open ? (marca?.id ?? '#novo') : '';
  const [alvoAtual, setAlvoAtual] = useState('');
  if (alvo !== alvoAtual) {
    setAlvoAtual(alvo);
    setForm(
      marca
        ? {
            nome: marca.nome,
            pixelId: marca.pixelId,
            token: '',
            testCode: marca.testCode ?? '',
            adAccountId: marca.adAccountId ?? '',
          }
        : { ...VAZIO }
    );
    setVerToken(false);
  }

  const novo = marca === null;

  const salvar = async () => {
    if (!form.nome.trim()) return toast.error('Informe o nome da marca.');
    if (!form.pixelId.trim()) return toast.error('Informe o Pixel ID.');

    setSalvando(true);
    try {
      await salvarMarca({ id: marca?.id, ...form });
      onOpenChange(false);
      toast.success('Pixel salvo', {
        description: 'O token ficou guardado no servidor, fora do navegador.',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {novo ? 'Novo Pixel' : `Editar ${marca.nome}`}
          </DialogTitle>
          <DialogDescription>
            Um Pixel guarda o número do Pixel, o token de acesso e o código de
            teste. É para onde o evento vai quando você dispara.
          </DialogDescription>
        </DialogHeader>

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
              !novo
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
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              placeholder={!novo ? '••••••••••••' : 'EAAG...'}
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
                onChange={(e) => setForm({ ...form, testCode: e.target.value })}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar Pixel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BrandDialog;
