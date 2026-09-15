'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, FlaskConical, LoaderCircle } from '@/components/ui/icones';
import { toast } from 'sonner';

import { AppMark } from '@/components/ui/app-mark';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Callout } from '@/components/common/primitives';

interface Props {
  /** Caminho para onde voltar após entrar. Já validado no servidor. */
  destino: string;
  /** Sem CONSOLE_PASSWORD no servidor não há o que tentar. */
  consoleFechado: boolean;
  /** Mínimo de caracteres da senha, vindo da constante do servidor. */
  senhaMin: number;
  /**
   * ATALHO DE DEV — mostra o botão "Entrar como admin" que pula a senha.
   * Desativado automaticamente em produção pelo servidor.
   */
  atalhoDev?: boolean;
}


export function LoginForm({
  destino,
  consoleFechado,
  senhaMin,
  atalhoDev = false,
}: Props) {
  const [usuario, setUsuario] = useState('admin');
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(false);
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [entrandoRapido, setEntrandoRapido] = useState(false);

  const ocupado = enviando || entrandoRapido;

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (ocupado || consoleFechado) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch('/api/sessao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha, lembrar }),
      });
      if (r.ok) {
        window.location.assign(destino);
        return;
      }
      const dados = await r.json().catch(() => null);
      setErro(dados?.erro ?? 'Não foi possível entrar. Tente de novo.');
      setSenha('');
    } catch {
      setErro('Servidor fora do ar. Confira se o console está rodando.');
    } finally {
      setEnviando(false);
    }
  }

  /** ATALHO DE DEV — remover junto com a prop `atalhoDev` antes de subir para produção. */
  async function entrarComoAdmin() {
    if (ocupado || consoleFechado) return;
    setEntrandoRapido(true);
    setErro(null);
    try {
      const r = await fetch('/api/sessao/dev-admin', { method: 'POST' });
      if (r.ok) {
        window.location.assign(destino);
        return;
      }
      const dados = await r.json().catch(() => null);
      setErro(dados?.erro ?? 'Não foi possível entrar. Tente de novo.');
    } catch {
      setErro('Servidor fora do ar. Confira se o console está rodando.');
    } finally {
      setEntrandoRapido(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] w-full flex-col lg:flex-row bg-surface-0 text-fg-body">
      {/* Coluna Esquerda — imagem fixa do papel sobre a madeira (v4).
          Era um <video> em laço; virou uma foto parada porque o hero da entrada
          não tem nada a animar — a mesa de trabalho é o assunto, não o efeito.
          O .mp4 continua em public/brand/, apenas não é mais consumido aqui. */}
      <div className="relative hidden lg:flex lg:w-[58%] xl:w-[62%] items-center justify-center overflow-hidden bg-surface-0 border-r border-line">
        <Image
          src="/brand/login-hero.jpg"
          alt=""
          aria-hidden
          fill
          /* `preload` é o `priority` do Next 16 (a prop antiga está obsoleta):
             a imagem é o elemento acima da dobra desta tela, então ela entra
             por <link rel="preload"> no <head> em vez de esperar o <body>. */
          preload
          sizes="(min-width: 1280px) 62vw, 58vw"
          className="object-cover select-none pointer-events-none"
        />
        {/* Vinheta suave para fusão com a coluna lateral — na cor da superfície
            do fundo (`--surface-0`), que é para onde a imagem tem de morrer. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-surface-0 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-surface-0/60 to-transparent" />
      </div>

      {/* Coluna Direita — Formulário de Login */}
      <div className="flex w-full lg:w-[42%] xl:w-[38%] flex-col justify-between items-center px-6 py-10 sm:px-12 md:px-14 min-h-[100dvh] bg-surface-0">
        <div className="w-full max-w-[390px] my-auto flex flex-col items-center">
          {/* Logo oficial da mira (AppMark) e Título */}
          <div className="flex flex-col items-center text-center">
            <AppMark size={48} decorative={false} className="text-fg-strong drop-shadow-md" />
            {/* Mesmo degrau do título de página do console: `text-pagina`
                (24 → 30px), peso 700 e tracking -0.03em. */}
            <h1 className="mt-5 text-pagina font-bold tracking-[-0.03em] text-fg-strong">
              Entre na sua conta
            </h1>
            <p className="mt-1.5 text-body text-fg-muted">
              Bem-vindo de volta ao Abner Traker
            </p>
          </div>

          {/* Atalho Dev (Acesso Rápido) */}
          {atalhoDev && (
            <div className="mt-6 w-full">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={ocupado || consoleFechado}
                onClick={() => void entrarComoAdmin()}
                className="w-full h-control-lg border-warning/40 bg-warning/5 text-warning hover:bg-warning/10 hover:border-warning/60 font-medium transition-all"
              >
                {entrandoRapido ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FlaskConical className="size-4" aria-hidden />
                )}
                Entrar como admin (Dev)
              </Button>
            </div>
          )}
          {consoleFechado && (
            <Callout tone="warning" title="Console fechado" className="mt-6 mb-2 w-full">
              O acesso está fechado porque o servidor não tem senha definida. Configure{' '}
              <code className="font-mono">CONSOLE_PASSWORD</code> (mínimo {senhaMin} caracteres) no{' '}
              <code className="font-mono">.env.local</code> e reinicie.
            </Callout>
          )}

          {/* Formulário */}
          <form
            onSubmit={aoEnviar}
            noValidate
            className={`${atalhoDev ? 'mt-4' : 'mt-6'} flex w-full flex-col gap-4`}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="usuario" className="text-caption font-medium text-fg-body">
                E-mail
              </label>
              <Input
                id="usuario"
                name="usuario"
                autoComplete="username"
                autoFocus
                required
                disabled={ocupado || consoleFechado}
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="mail@abc.com"
                /* Sem className: altura, superfície, borda de controle,
                   placeholder e anel de foco são os do próprio `Input` — a
                   tela de entrada não tem campo diferente do resto do console. */
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="senha" className="text-caption font-medium text-fg-body">
                Senha
              </label>
              <div className="relative">
                <Input
                  id="senha"
                  name="senha"
                  type={verSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  disabled={ocupado || consoleFechado}
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? 'erro-login' : undefined}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••••"
                  /* Só o respiro à direita, para o texto não passar por baixo
                     do botão do olho; o resto é o `Input` do console. */
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

            {/* Lembrar de mim e Esqueci minha senha */}
            <div className="mt-1 flex items-center justify-between">
              <label className="group/field-label flex cursor-pointer items-center gap-2 text-caption text-fg-muted select-none hover:text-fg-body">
                <Checkbox
                  checked={lembrar}
                  disabled={ocupado || consoleFechado}
                  onCheckedChange={(v) => setLembrar(v === true)}
                  /* Sem className: marcado, o `Checkbox` já é fill na tinta da
                     área + borda em `tinta-texto` + glifo. Nunca azul. */
                />
                <span>Lembrar de mim</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  toast.info(
                    'A senha está configurada na variável CONSOLE_PASSWORD nas variáveis de ambiente do servidor.'
                  )
                }
                className="rounded-control text-caption font-medium text-tinta-texto underline-offset-4 transition-colors hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>

            {erro && (
              <Callout id="erro-login" tone="danger" title="Não foi possível entrar" className="mt-2 w-full">
                {erro}
              </Callout>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={ocupado || consoleFechado}
              /* A ação primária é o PAPEL: fundo claro, texto quase preto — o
                 objeto de maior luminosidade da tela. É o `variant` default do
                 `Button`, então aqui só ficam medida e respiro. */
              className="mt-3 h-control-lg w-full"
            >
              {enviando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {enviando ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          {/* Rodapé do card */}
          <p className="mt-8 text-center text-caption text-fg-muted">
            Ainda não tem conta?{' '}
            <button
              type="button"
              onClick={() =>
                toast.info('O console é de uso interno. Credenciais são definidas nas variáveis de ambiente.')
              }
              className="rounded-control font-medium text-tinta-texto underline-offset-4 hover:underline"
            >
              Criar conta
            </button>
          </p>
        </div>

        {/* Rodapé da coluna */}
        <p className="text-center text-caption text-fg-muted">
          Abner Traker · Meta Conversions API &amp; Server-Side Tracking
        </p>
      </div>
    </main>
  );
}

export default LoginForm;
