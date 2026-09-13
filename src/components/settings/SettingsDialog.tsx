'use client';

import React from 'react';
import { Sparkles, Type } from 'lucide-react';

import { useUserStore, type Densidade } from '@/stores/useUserStore';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/common/primitives';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/* A amostra em px que vivia aqui mostrava 12 / 13,5 / 15 e era falsa desde
   que a densidade passou a separar espaco de texto (DS-4.10): Compacta e
   Padrao renderizam a MESMA letra — o que muda entre elas e o respiro. So
   Ampla aumenta os dois. A dica agora diz isso, em vez de um numero que o
   produto nao entrega. */
const DENSIDADES: {
  valor: Densidade;
  rotulo: string;
  dica: string;
}[] = [
  { valor: 'compacta', rotulo: 'Compacta', dica: 'padrão, mais itens na tela' },
  { valor: 'padrao', rotulo: 'Padrão', dica: 'mais respiro' },
  { valor: 'confortavel', rotulo: 'Ampla', dica: 'respiro e letras maiores' },
];

export function SettingsDialog({ open, onOpenChange }: Props) {
  const nome = useUserStore((s) => s.nome);
  const setNome = useUserStore((s) => s.setNome);
  const fundoAnimado = useUserStore((s) => s.fundoAnimado);
  const setFundoAnimado = useUserStore((s) => s.setFundoAnimado);
  const confeteSoEmTeste = useUserStore((s) => s.confeteSoEmTeste);
  const setConfeteSoEmTeste = useUserStore((s) => s.setConfeteSoEmTeste);
  const densidade = useUserStore((s) => s.densidade);
  const setDensidade = useUserStore((s) => s.setDensidade);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Preferências</DialogTitle>
          <DialogDescription>
            Ajustes locais deste navegador. Não afetam o disparo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <Field
            id="pref-nome"
            label="Seu nome"
            helper="Aparece nos registros de disparo deste console."
          >
            <Input
              id="pref-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Abner"
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-2 text-label font-medium text-fg-body">
              <Type className="size-3.5 text-fg-muted" aria-hidden />
              Densidade da interface
            </legend>
            <p className="mb-1 text-caption text-fg-muted">
              A escala do seu sistema operacional já amplia tudo. Compacta e
              Padrão usam a mesma letra e mudam o espaço entre os elementos;
              Ampla aumenta os dois. O efeito é imediato.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DENSIDADES.map((d) => (
                <button
                  key={d.valor}
                  type="button"
                  aria-pressed={densidade === d.valor}
                  onClick={() => setDensidade(d.valor)}
                  className={
                    'flex cursor-pointer flex-col items-start gap-0.5 rounded-control border p-2.5 text-left transition-colors ' +
                    (densidade === d.valor
                      ? 'border-accent-text bg-accent-text/10'
                      : 'border-line-control bg-surface-2 hover:border-fg-muted')
                  }
                >
                  <span
                    className={
                      'text-body font-semibold ' +
                      (densidade === d.valor ? 'text-accent-text' : 'text-fg-body')
                    }
                  >
                    {d.rotulo}
                  </span>
                  <span className="text-caption text-fg-muted">{d.dica}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-label font-medium text-fg-body">
              Movimento
            </legend>

            <label className="flex cursor-pointer items-start gap-3 rounded-control border border-line-control bg-surface-2 p-3">
              <Checkbox
                id="pref-fundo"
                checked={fundoAnimado}
                onCheckedChange={(v) => setFundoAnimado(Boolean(v))}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-label font-medium text-fg-body">
                  Fundo com movimento
                </span>
                <span className="mt-0.5 block text-caption text-fg-muted">
                  Desligado por padrão: o movimento constante competia com os
                  números. Quem pediu menos movimento no sistema continua sem ele.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-control border border-line-control bg-surface-2 p-3">
              <Checkbox
                id="pref-confete"
                checked={confeteSoEmTeste}
                onCheckedChange={(v) => setConfeteSoEmTeste(Boolean(v))}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-label font-medium text-fg-body">
                  <Sparkles className="size-3.5 text-accent-text" aria-hidden />
                  Confete apenas em modo teste
                </span>
                <span className="mt-0.5 block text-caption text-fg-muted">
                  Comemorar uma conversão real de milhares de reais com confete é
                  o registro errado. Em produção o sucesso aparece como painel.
                </span>
              </span>
            </label>
          </fieldset>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
