'use client';

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, FlaskConical, LoaderCircle } from '@/components/ui/icones';
import { toast } from 'sonner';

import { AppMark } from '@/components/ui/app-mark';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Callout } from '@/components/common/primitives';
import { MarcaLogin } from '@/components/auth/marca-login';

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
      {/* Coluna Esquerda — vídeo em laço de entrada. Em 22/09/2026 o dono
          trocou o astronauta (`login-hero.mp4`, fora de uso) por
          `login-desktop.mp4`. Histórico: o v4 tinha trocado este <video> pela foto parada do papel sobre a
          madeira; o dono pediu o vídeo de volta em 16/09/2026, e ele voltou.
          A foto continua em public/brand/login-hero.jpg, fora de uso.

          Esta é a MESMA exceção declarada do fundo do console: a peça tem
          forma reconhecível e paleta azul marinho, contra a regra do v4 de
          "sem azul, sem desenho no ar". Vale porque é decisão do dono e
          porque o login vive fora do route group (console) — nada aqui
          contamina a paleta neutra quente das telas internas. */}
      <div className="relative hidden lg:flex lg:w-[58%] xl:w-[62%] items-center justify-center overflow-hidden bg-surface-0 border-r border-line">
        <video
          ref={iniciarLaco}
          data-fonte="/brand/login-desktop.mp4"
          poster="/brand/login-desktop-poster.jpg"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden
          className="h-full w-full object-cover select-none pointer-events-none"
        />
        {/* Vinheta suave para fusão com a coluna lateral — na cor da superfície
            do fundo (`--surface-0`), que é para onde a imagem tem de morrer. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-surface-0 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-surface-0/85 to-transparent" />
        {/* Assinatura escrita, por cima do vídeo no canto inferior esquerdo,
            sobre o degradê que garante leitura. */}
        <MarcaLogin variante="hero" className="absolute bottom-10 left-10 xl:bottom-12 xl:left-12" />
      </div>

      {/* Coluna Direita — Formulário de Login.

          Fundo do computador (23/09/2026, pedido do dono: "na area de login
          tb adicione essa imagem apenas no desktop"): a imagem dele cobre a
          coluna inteira (`cover`, centro), com o véu `--veu-login` por cima,
          na MESMA declaração de `background-image`. As duas camadas só
          existem dentro do `@media (width >= 64rem)` que o `lg:` gera: abaixo
          disso a regra não se aplica e o navegador nem pede o arquivo. O
          celular continua com o vídeo dele e mais nada.

          `lg:px-8 xl:px-12` estreita a margem da coluna e compensa só PARTE
          do `p-8` do painel: em 1024px o formulário fica com 316px (274 sem
          isso, 332 antes do painel); em 1920px, 422 (antes, 480). */}
      <div className="relative isolate overflow-hidden flex w-full lg:w-[42%] xl:w-[38%] flex-col justify-between items-center px-6 py-10 sm:px-12 md:px-14 lg:px-8 xl:px-12 min-h-[100dvh] bg-surface-0 lg:bg-[image:var(--veu-login),url(/brand/login-painel-desktop.webp)] lg:bg-cover lg:bg-center lg:bg-no-repeat">
        {/* Fundo do celular (22/09/2026, pedido do dono): o vídeo vertical em
            laço atrás do formulário, com opacidade baixa para não brigar com
            os campos. Só existe abaixo de `lg` (`lg:hidden`); no desktop o
            `iniciarLaco` vê o elemento sem caixa e não baixa nada. */}
        <video
          ref={iniciarLaco}
          data-fonte="/brand/login-mobile.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden
          className="lg:hidden absolute inset-0 -z-10 h-full w-full object-cover opacity-20 select-none pointer-events-none motion-reduce:hidden"
        />
        {/* O painel do formulário, só a partir de `lg` (no celular este div
            continua sendo só a caixa de largura que sempre foi). Ele existe
            porque a imagem tem ponto de luz branco puro em qualquer altura, e
            o recorte do `cover` muda com a janela: qualquer ponto pode cair
            atrás de qualquer letra. Medido contra o PIOR caso (pixel branco
            sob o véu mais fraco, os 25 % do topo, sem contar o desfoque):
            `surface-1` a 88 % dá 5.08 ao texto mudo e 3.26 à borda dos campos.
            A 85 % a borda cai para 3.00, no limite — por isso 88, e não menos. */}
        <div className="w-full max-w-[390px] lg:max-w-[440px] xl:max-w-[480px] my-auto flex flex-col items-center lg:rounded-dialog lg:border lg:border-line lg:bg-surface-1/88 lg:p-8 lg:shadow-cartao lg:backdrop-blur-md">
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
            className={`${atalhoDev ? 'mt-4' : 'mt-6'} flex w-full flex-col gap-4 lg:gap-5`}
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

        {/* No celular a coluna do vídeo não existe: a assinatura vai para o
            canto inferior desta coluna, por cima do vídeo de fundo. */}
        <div className="mt-10 flex w-full flex-col items-start gap-3 lg:hidden">
          <MarcaLogin variante="compacta" />
          {/* No celular o nome já está na assinatura logo acima: o rodapé
              fica só com o que o produto faz, alinhado com ela. */}
          <p className="text-caption text-fg-muted">
            Meta Conversions API &amp; Server-Side Tracking
          </p>
        </div>
        {/* Rodapé da coluna (desktop) */}
        <p className="hidden lg:block text-center text-caption text-fg-muted">
          Abner Traker · Meta Conversions API &amp; Server-Side Tracking
        </p>
      </div>
    </main>
  );
}

/**
 * Dá o play. Mesma lição já medida no fundo do console
 * (`layout/ConsoleBackground.tsx`): o `autoPlay` do elemento SOZINHO não
 * basta. O Chrome adia a carga de mídia em aba que não está em primeiro plano
 * no momento da montagem e não volta atrás sozinho quando ela aparece — o
 * vídeo fica em `readyState 0`, parado, com os três atributos certos no DOM.
 * Um `play()` explícito resolve e custa uma chamada por montagem.
 *
 * O `src` vem de `data-fonte` e só é cravado quando a coluna está visível: em
 * telas abaixo de `lg` ela é `display: none` e não faz sentido puxar 3,3 MB
 * para um elemento que ninguém vê. Esconder no CSS não impede o navegador de
 * buscar; não ter endereço impede.
 *
 * Quem esconde aqui é o DIV da coluna (`hidden lg:flex`), não o vídeo — então
 * `getComputedStyle(el).display` diria `block` e o teste passaria no celular.
 * `getClientRects()` é o que enxerga o ancestral: ele volta vazio quando o
 * elemento ou qualquer pai está em `display: none`.
 *
 * A promessa é engolida de propósito. Se a política de autoplay recusar, o
 * lugar certo de falhar é em silêncio, sobre o `poster` que já está na tela.
 * Hero de entrada não é função — não há nada para avisar a quem entra.
 *
 * O `visibilitychange` existe porque o `play()` da montagem não se sustenta
 * em aba de segundo plano: medido aqui, o vídeo chega a `readyState 4`, anda
 * 0,08 s e o Chrome o pausa de novo enquanto `visibilityState` é `hidden`.
 * Isso acontece de verdade com quem abre o login em nova aba (ctrl+clique) ou
 * restaura a sessão do navegador — chegariam ao pôster parado. O ouvinte dá o
 * play uma vez quando a aba enfim aparece, e sai de cena; a limpeza é o
 * retorno do ref callback, que o React 19 chama ao desmontar.
 *
 * Quem pediu menos movimento ao sistema (`prefers-reduced-motion`) não ganha
 * `src` nenhum: no desktop fica o `poster` parado, no celular o vídeo já some
 * pelo `motion-reduce:hidden`. E o `resize` existe porque a janela pode cruzar
 * o `lg` depois de montada: o vídeo que passa a aparecer nasceu sem `src` e
 * ficaria parado para sempre; o ouvinte crava o endereço na primeira vez que
 * ele ganha caixa.
 */
function iniciarLaco(el: HTMLVideoElement | null) {
  if (!el) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const tocar = () => void el.play().catch(() => {});
  let ligado = false;
  const ligar = () => {
    if (ligado || el.getClientRects().length === 0) return;
    ligado = true;
    const fonte = el.dataset.fonte;
    if (fonte && !el.getAttribute('src')) el.setAttribute('src', fonte);
    el.muted = true;
    tocar();
  };
  ligar();

  const aoAparecer = () => {
    if (ligado && document.visibilityState === 'visible' && el.paused) tocar();
  };
  window.addEventListener('resize', ligar);
  document.addEventListener('visibilitychange', aoAparecer);
  return () => {
    window.removeEventListener('resize', ligar);
    document.removeEventListener('visibilitychange', aoAparecer);
  };
}

export default LoginForm;
