'use client';

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle } from '@/components/ui/icones';

import { AppMark } from '@/components/ui/app-mark';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout } from '@/components/common/primitives';

interface Props {
  token: string;
  linkValido: boolean;
  senhaMin: number;
}

/** Criar a senha nova a partir do link do e-mail. Uma ação só: digitar e salvar. */
export function NovaSenhaForm({ token, linkValido, senhaMin }: Props) {
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (senha.length < senhaMin) {
      setErro(`A senha precisa ter pelo menos ${senhaMin} caracteres.`);
      return;
    }
    if (senha !== repetir) {
      setErro('As duas senhas estão diferentes. Digite a mesma nos dois campos.');
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch('/api/sessao/nova-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senha }),
      });
      if (r.ok) {
        setPronto(true);
        return;
      }
      const dados = await r.json().catch(() => null);
      setErro(dados?.erro ?? 'Não foi possível salvar. Tente de novo.');
    } catch {
      setErro('Servidor fora do ar. Tente de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] w-full items-center justify-center bg-surface-0 px-4 py-10 text-fg-body">
      <div className="flex w-full max-w-sm flex-col">
        <AppMark className="self-start" />
        <h1 className="mt-8 text-heading font-bold tracking-tight text-fg-strong">Criar senha nova</h1>

        {pronto ? (
          <>
            <p className="mt-2 text-body text-fg-muted">Senha trocada. Use a senha nova para entrar.</p>
            <a href="/login" className={buttonVariants({ size: 'lg', className: 'mt-6 h-control-lg w-full' })}>
              Ir para a entrada
            </a>
          </>
        ) : !linkValido ? (
          <>
            <Callout tone="warning" title="Link expirado ou já usado" className="mt-6 w-full">
              Volte à tela de entrada, digite o seu e-mail e clique em &ldquo;Esqueci minha senha&rdquo; para receber outro.
            </Callout>
            <a
              href="/login"
              className={buttonVariants({ variant: 'outline', size: 'lg', className: 'mt-6 h-control-lg w-full' })}
            >
              Voltar para a entrada
            </a>
          </>
        ) : (
          <form onSubmit={aoEnviar} noValidate className="mt-6 flex w-full flex-col gap-4">
            <p className="text-body text-fg-muted">Pelo menos {senhaMin} caracteres.</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="senha" className="text-caption font-medium text-fg-body">
                Senha nova
              </label>
              <div className="relative">
                <Input
                  id="senha"
                  type={verSenha ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoFocus
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  aria-label={verSenha ? 'Ocultar a senha' : 'Mostrar a senha'}
                  className="absolute inset-y-0 right-0 flex size-11 items-center justify-center rounded-control text-fg-muted transition-colors hover:text-fg-strong"
                >
                  {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="repetir" className="text-caption font-medium text-fg-body">
                Repita a senha nova
              </label>
              <Input
                id="repetir"
                type={verSenha ? 'text' : 'password'}
                autoComplete="new-password"
                value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
              />
            </div>
            {erro && (
              <Callout tone="danger" title="Não foi possível salvar" className="w-full">
                {erro}
              </Callout>
            )}
            <Button type="submit" size="lg" disabled={enviando} className="mt-2 h-control-lg w-full">
              {enviando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {enviando ? 'Salvando…' : 'Salvar senha nova'}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
