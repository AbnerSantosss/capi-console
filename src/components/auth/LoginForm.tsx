'use client';

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, FlaskConical, LoaderCircle } from 'lucide-react';
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
    <main className="flex min-h-[100dvh] w-full flex-col lg:flex-row bg-[#060a14] text-white">
      {/* Coluna Esquerda — Vídeo Animado Hero (Abner Traker Beyond the Limits) */}
      <div className="relative hidden lg:flex lg:w-[58%] xl:w-[62%] items-center justify-center overflow-hidden bg-[#050811] border-r border-[#151f32]">
        <video
          autoPlay
          loop
          muted
          playsInline
          poster="/brand/login-hero.jpg"
          className="h-full w-full object-cover select-none pointer-events-none"
        >
          <source src="/brand/login-hero.mp4" type="video/mp4" />
        </video>
        {/* Vinheta suave para fusão com a coluna lateral */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-[#060a14] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#060a14]/60 to-transparent" />
      </div>

      {/* Coluna Direita — Formulário de Login */}
      <div className="flex w-full lg:w-[42%] xl:w-[38%] flex-col justify-between items-center px-6 py-10 sm:px-12 md:px-14 min-h-[100dvh] bg-[#060a14]">
        <div className="w-full max-w-[390px] my-auto flex flex-col items-center">
          {/* Logo oficial da mira (AppMark) e Título */}
          <div className="flex flex-col items-center text-center">
            <AppMark size={48} decorative={false} className="text-white drop-shadow-md" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-white sm:text-[26px]">
              Entre na sua conta
            </h1>
            <p className="mt-1.5 text-sm text-[#8899ac]">
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
                className="w-full h-11 border-warning/40 bg-warning/5 text-warning hover:bg-warning/10 hover:border-warning/60 text-sm font-medium transition-all"
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
              <label htmlFor="usuario" className="text-xs font-medium text-[#c5d1e0]">
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
                className="h-11 rounded-lg border-[#1b263b] bg-[#0b1324] text-sm text-white placeholder:text-[#45556c] focus:border-[#0066ff] focus:ring-1 focus:ring-[#0066ff]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="senha" className="text-xs font-medium text-[#c5d1e0]">
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
                  className="h-11 rounded-lg border-[#1b263b] bg-[#0b1324] pr-11 text-sm text-white placeholder:text-[#45556c] focus:border-[#0066ff] focus:ring-1 focus:ring-[#0066ff]"
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  aria-label={verSenha ? 'Ocultar a senha' : 'Mostrar a senha'}
                  className="absolute inset-y-0 right-0 flex size-11 items-center justify-center text-[#6b7c96] transition-colors hover:text-white"
                >
                  {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* Lembrar de mim e Esqueci minha senha */}
            <div className="mt-1 flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[#8899ac] select-none hover:text-slate-300">
                <Checkbox
                  checked={lembrar}
                  disabled={ocupado || consoleFechado}
                  onCheckedChange={(v) => setLembrar(v === true)}
                  className="border-[#2a3a55] data-[state=checked]:bg-[#0066ff] data-[state=checked]:border-[#0066ff]"
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
                className="text-xs font-medium text-[#0066ff] hover:text-[#3385ff] hover:underline transition-colors"
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
              className="mt-3 h-11 w-full rounded-lg bg-[#0066ff] text-sm font-semibold text-white shadow-md hover:bg-[#0055d6] active:bg-[#0047b3] transition-all"
            >
              {enviando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {enviando ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          {/* Rodapé do card */}
          <p className="mt-8 text-center text-xs text-[#8899ac]">
            Ainda não tem conta?{' '}
            <button
              type="button"
              onClick={() =>
                toast.info('O console é de uso interno. Credenciais são definidas nas variáveis de ambiente.')
              }
              className="font-medium text-[#0066ff] hover:text-[#3385ff] hover:underline"
            >
              Criar conta
            </button>
          </p>
        </div>

        {/* Rodapé da coluna */}
        <p className="text-center text-caption text-[#45556c]">
          Abner Traker · Meta Conversions API &amp; Server-Side Tracking
        </p>
      </div>
    </main>
  );
}

export default LoginForm;
