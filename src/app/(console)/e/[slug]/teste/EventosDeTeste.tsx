'use client';

import * as React from 'react';
import Link from 'next/link';

import { Spinner } from '@/components/common/Esqueleto';
import { Callout, Field, Section, StatusDot, receitaBloco } from '@/components/common/primitives';
import consoleStyles from '@/components/layout/console.module.css';
import { SeletorDePixel } from '@/components/pixels/SeletorDePixel';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FlaskConical,
  Send,
  Square,
  Target,
  User,
  Wand2,
  XCircle,
} from '@/components/ui/icones';
import { Input } from '@/components/ui/input';
import { ErroApi, SessaoExpirada, pedir } from '@/lib/cliente-api';
import {
  EVENTOS_DE_TESTE,
  ROTULO_DO_EVENTO,
  ehCodigoDeTeste,
  eventoDeTeste,
  gerarDadosDeTeste,
  type DadosDeTeste,
  type EventoDeTeste,
} from '@/lib/dados-de-teste';
import { cn } from '@/lib/utils';
import { useBrandStore } from '@/stores/useBrandStore';

/** O que `/api/enviar-teste` devolve quando a Meta respondeu. */
interface RespostaDoTeste {
  ok: boolean;
  httpStatus: number;
  eventsReceived: number;
  fbtraceId: string | null;
  erro: string | null;
}

type Linha =
  | { estado: 'aguardando' }
  | { estado: 'enviando' }
  | { estado: 'aceito'; fbtraceId: string | null }
  | { estado: 'erro'; mensagem: string; fbtraceId: string | null }
  | { estado: 'parado' };

/** O que parou a fila inteira e precisa de uma ação de quem usa. */
type Bloqueio = null | 'sessao' | 'empresa';

/** Um intervalo entre os envios, para cada evento aparecer separado na Meta. */
const INTERVALO_MS = 1000;

/** O "Testar eventos" do Gerenciador de Eventos, já no Pixel escolhido. */
function enderecoDoTestarEventos(pixelId: string): string {
  return `https://business.facebook.com/events_manager2/list/pixel/${encodeURIComponent(pixelId)}/test_events`;
}

/** Espera `ms`, mas sai antes se alguém apertar "Parar". */
async function esperar(ms: number, parar: () => boolean): Promise<void> {
  const fim = Date.now() + ms;
  while (Date.now() < fim && !parar()) {
    await new Promise((r) => window.setTimeout(r, 100));
  }
}

/** "97,00" ou "97.00" → 97; vazio ou inválido → NaN. */
function lerValor(texto: string): number {
  const limpo = texto.trim().replace(/\s/g, '').replace(',', '.');
  return limpo ? Number(limpo) : Number.NaN;
}

/**
 * A aba "Teste": escolhe o Pixel, confere o código de teste, marca os eventos
 * e dispara todos em sequência com UM botão. Os dados do comprador de teste
 * se preenchem sozinhos ao abrir a tela, e "Gerar outros dados" troca todos.
 *
 * Um evento por vez: manda, espera a resposta, espera ~1 s e vai para o
 * próximo. Cada envio leva o `event_time` do momento em que sai. A linha de
 * cada evento diz o que aconteceu com ele, com a mensagem da Meta e o
 * `fbtrace_id` quando dá erro.
 */
export function EventosDeTeste({ empresaId, dominio }: { empresaId: string; dominio: string }) {
  const marcas = useBrandStore((s) => s.marcas);
  const carregado = useBrandStore((s) => s.carregado);

  /* ---------------- Pixel e código de teste ---------------- */

  const daEmpresa = marcas.filter((m) => m.empresaId === empresaId);
  const comToken = daEmpresa.filter((m) => m.temToken);
  const [escolhido, setEscolhido] = React.useState('');
  // Um Pixel só na empresa: já vem escolhido.
  const brandId = escolhido || (comToken.length === 1 ? comToken[0].id : '');
  const marca = daEmpresa.find((m) => m.id === brandId);

  // `null` = usar o código salvo no Pixel. Trocar de Pixel volta a ele.
  const [codigoDigitado, setCodigoDigitado] = React.useState<string | null>(null);
  const [pixelDoCodigo, setPixelDoCodigo] = React.useState(brandId);
  if (pixelDoCodigo !== brandId) {
    setPixelDoCodigo(brandId);
    setCodigoDigitado(null);
  }
  const codigo = codigoDigitado ?? marca?.testCode?.trim() ?? '';
  const codigoInvalido = Boolean(codigo.trim()) && !ehCodigoDeTeste(codigo);

  /* ---------------- Dados do comprador de teste ---------------- */

  const [dados, setDados] = React.useState<DadosDeTeste | null>(null);
  const [valor, setValor] = React.useState('97,00');
  const semDominio = !dominio.trim();

  const gerar = React.useCallback(() => {
    setDados(
      gerarDadosDeTeste({
        agora: Date.now(),
        userAgent: window.navigator.userAgent,
        dominio,
      })
    );
    setValor('97,00');
  }, [dominio]);

  // Preenchimento automático ao abrir. Fora da renderização (o navegador e o
  // relógio só existem aqui), e num `setTimeout` para não pintar duas vezes.
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setDados((atual) =>
        atual ??
        gerarDadosDeTeste({ agora: Date.now(), userAgent: window.navigator.userAgent, dominio })
      );
    }, 0);
    return () => window.clearTimeout(t);
  }, [dominio]);

  const mudar = (campo: keyof DadosDeTeste) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const texto = e.target.value;
    setDados((d) => (d ? { ...d, [campo]: texto } : d));
  };

  /* ---------------- Eventos e disparo ---------------- */

  const [marcados, setMarcados] = React.useState<ReadonlySet<EventoDeTeste>>(
    () => new Set(EVENTOS_DE_TESTE)
  );
  const fila = EVENTOS_DE_TESTE.filter((e) => marcados.has(e));

  const [linhas, setLinhas] = React.useState<Partial<Record<EventoDeTeste, Linha>>>({});
  const [rodando, setRodando] = React.useState(false);
  const [parouPorPedido, setParouPorPedido] = React.useState(false);
  const [bloqueio, setBloqueio] = React.useState<Bloqueio>(null);
  const pararRef = React.useRef(false);

  // Sair da tela no meio da fila para o que falta.
  React.useEffect(
    () => () => {
      pararRef.current = true;
    },
    []
  );

  const valorNumero = lerValor(valor);
  const valorOk = Number.isFinite(valorNumero) && valorNumero > 0;

  let motivo = '';
  if (!carregado) motivo = 'Carregando os Pixels…';
  else if (!marca) motivo = 'Escolha o Pixel.';
  else if (!marca.temToken) motivo = 'Este Pixel não tem token. Complete o cadastro na aba Pixels.';
  else if (!codigo.trim())
    motivo = 'Falta o código de teste. Copie em Gerenciador de Eventos → Testar eventos (começa com TEST).';
  else if (!ehCodigoDeTeste(codigo)) motivo = 'O código de teste começa com TEST e só tem letras e números.';
  else if (fila.length === 0) motivo = 'Marque pelo menos um evento.';
  else if (!dados) motivo = 'Preparando os dados de teste…';
  else if (!valorOk) motivo = 'Informe um valor maior que zero.';

  const pode = !motivo && !rodando && !bloqueio;
  const rotuloDoBotao =
    fila.length === 1 ? 'Enviar 1 evento de teste' : `Enviar ${fila.length} eventos de teste`;

  const mudarLinha = (evento: EventoDeTeste, linha: Linha) =>
    setLinhas((atual) => ({ ...atual, [evento]: linha }));

  async function disparar() {
    if (!pode || !marca || !dados) return;
    const base: DadosDeTeste = { ...dados, value: valorNumero };
    const codigoDoEnvio = codigo.trim();
    const destino = marca.id;
    const eventos = [...fila];

    pararRef.current = false;
    setParouPorPedido(false);
    setRodando(true);
    setLinhas(Object.fromEntries(eventos.map((e) => [e, { estado: 'aguardando' } as Linha])));

    let i = 0;
    for (; i < eventos.length; i++) {
      if (pararRef.current) break;
      const evento = eventos[i];
      mudarLinha(evento, { estado: 'enviando' });
      try {
        const r = await pedir<RespostaDoTeste>('/api/enviar-teste', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Empresa-Id': empresaId },
          body: JSON.stringify({
            brandId: destino,
            testEventCode: codigoDoEnvio,
            event: eventoDeTeste(evento, base, Date.now()),
          }),
        });
        mudarLinha(
          evento,
          r.ok
            ? { estado: 'aceito', fbtraceId: r.fbtraceId }
            : {
                estado: 'erro',
                mensagem: r.erro || 'A Meta não aceitou o evento.',
                fbtraceId: r.fbtraceId,
              }
        );
      } catch (e) {
        // Erro do nosso lado (sessão, empresa, Pixel, código, rede): ele se
        // repetiria em todos os próximos, então a fila para aqui.
        if (e instanceof SessaoExpirada) {
          setBloqueio('sessao');
          mudarLinha(evento, { estado: 'erro', mensagem: 'Sua sessão venceu.', fbtraceId: null });
        } else if (e instanceof ErroApi && e.status === 409) {
          setBloqueio('empresa');
          mudarLinha(evento, {
            estado: 'erro',
            mensagem: 'A empresa mudou em outra aba. Recarregue a página.',
            fbtraceId: null,
          });
        } else {
          const dadosDoErro = e instanceof ErroApi ? (e.dados as Partial<RespostaDoTeste> | undefined) : undefined;
          mudarLinha(evento, {
            estado: 'erro',
            mensagem:
              e instanceof ErroApi
                ? e.message
                : 'Sem resposta do console. Confira a conexão e tente de novo.',
            fbtraceId: dadosDoErro?.fbtraceId ?? null,
          });
        }
        i++;
        break;
      }
      if (i < eventos.length - 1) await esperar(INTERVALO_MS, () => pararRef.current);
    }

    if (pararRef.current) setParouPorPedido(true);
    // O que ficou para trás não saiu, e a linha diz isso.
    const restantes = eventos.slice(i);
    if (restantes.length) {
      setLinhas((atual) => {
        const nova = { ...atual };
        for (const e of restantes) if (nova[e]?.estado === 'aguardando') nova[e] = { estado: 'parado' };
        return nova;
      });
    }
    setRodando(false);
  }

  const parar = () => {
    pararRef.current = true;
  };

  const resultados = Object.values(linhas);
  const total = resultados.length;
  const aceitos = resultados.filter((l) => l?.estado === 'aceito').length;
  const enviados = resultados.filter((l) => l && l.estado !== 'aguardando' && l.estado !== 'enviando').length;
  const terminou = !rodando && total > 0;
  const pixelId = marca?.pixelId?.trim() ?? '';

  const alternar = (evento: EventoDeTeste, marcado: boolean) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(evento);
      else novo.delete(evento);
      return novo;
    });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Callout tone="info" icon={FlaskConical} title="Só para teste">
        Os eventos vão só para <strong className="font-semibold">Testar eventos</strong> do Gerenciador de
        Eventos da Meta. Não contam como conversão e não chegam ao CRM.
      </Callout>

      {bloqueio === 'sessao' && (
        <Callout tone="danger" icon={AlertTriangle} title="Sua sessão venceu">
          Entre de novo para continuar os testes.
          <span className="mt-2 block">
            <Link href="/login" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              Entrar de novo
            </Link>
          </span>
        </Callout>
      )}
      {bloqueio === 'empresa' && (
        <Callout tone="danger" icon={AlertTriangle} title="Recarregue a página">
          Esta aba está numa empresa e o navegador em outra. Nada mais foi enviado.
          <span className="mt-2 block">
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Recarregar agora
            </Button>
          </span>
        </Callout>
      )}

      <div className={consoleStyles.mainGrid}>
        <div className={consoleStyles.workColumn}>
          {/* ---- 1. Para onde vai ---- */}
          <Section
            id="teste-destino"
            step={1}
            icon={Target}
            variant="card"
            title="Para onde vai"
            description="O Pixel da empresa e o código de teste da Meta."
          >
            <SeletorDePixel
              modo="unico"
              id="teste-pixel"
              rotulo="Pixel"
              valor={brandId}
              onChange={setEscolhido}
            />
            <Field
              id="teste-codigo"
              label="Código de teste"
              param="test_event_code"
              helper={
                <>
                  Copie em Gerenciador de Eventos → Testar eventos (começa com TEST).
                  {pixelId && (
                    <>
                      {' '}
                      <a
                        href={enderecoDoTestarEventos(pixelId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-tinta-texto underline-offset-2 hover:underline"
                      >
                        Abrir Testar eventos
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    </>
                  )}
                </>
              }
              error={codigoInvalido ? 'Começa com TEST e só tem letras e números.' : undefined}
            >
              <Input
                id="teste-codigo"
                value={codigo}
                onChange={(e) => setCodigoDigitado(e.target.value)}
                placeholder="TEST12345"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-describedby={codigoInvalido ? 'teste-codigo-helper teste-codigo-error' : 'teste-codigo-helper'}
                aria-invalid={codigoInvalido || undefined}
              />
            </Field>
          </Section>

          {/* ---- 2. Quem "compra" ---- */}
          <Section
            id="teste-dados"
            step={2}
            icon={User}
            variant="card"
            title="Comprador de teste"
            description="Preenchido sozinho, com dados de mentira. Pode editar."
            action={
              <Button size="sm" variant="outline" onClick={gerar} disabled={rodando}>
                <Wand2 className="size-3.5" aria-hidden />
                Gerar outros dados
              </Button>
            }
          >
            {dados ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="teste-nome" label="Nome">
                    <Input id="teste-nome" value={dados.firstName} onChange={mudar('firstName')} autoComplete="off" />
                  </Field>
                  <Field id="teste-sobrenome" label="Sobrenome">
                    <Input id="teste-sobrenome" value={dados.lastName} onChange={mudar('lastName')} autoComplete="off" />
                  </Field>
                  <Field id="teste-email" label="E-mail">
                    <Input
                      id="teste-email"
                      type="email"
                      value={dados.email}
                      onChange={mudar('email')}
                      autoComplete="off"
                    />
                  </Field>
                  <Field id="teste-celular" label="Celular">
                    <Input
                      id="teste-celular"
                      type="tel"
                      value={dados.phone}
                      onChange={mudar('phone')}
                      autoComplete="off"
                      className="tabular"
                    />
                  </Field>
                  <Field
                    id="teste-valor"
                    label="Valor (R$)"
                    error={valorOk ? undefined : 'Informe um valor maior que zero.'}
                  >
                    <Input
                      id="teste-valor"
                      inputMode="decimal"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      autoComplete="off"
                      className="tabular"
                      aria-invalid={valorOk ? undefined : true}
                      aria-describedby={valorOk ? undefined : 'teste-valor-error'}
                    />
                  </Field>
                  <Field
                    id="teste-url"
                    label="Página"
                    helper={
                      semDominio
                        ? 'A empresa não tem domínio. Informe a página do site: a Meta pede em evento de site.'
                        : undefined
                    }
                  >
                    <Input
                      id="teste-url"
                      type="url"
                      value={dados.sourceUrl}
                      onChange={mudar('sourceUrl')}
                      placeholder="https://site.com.br/"
                      autoComplete="off"
                      aria-describedby={semDominio ? 'teste-url-helper' : undefined}
                    />
                  </Field>
                </div>
                <details className={receitaBloco}>
                  <summary className="cursor-pointer text-label font-medium text-fg-body">
                    Sinais do navegador (gerados)
                  </summary>
                  <dl className="mt-3 grid gap-2 text-caption">
                    {(
                      [
                        ['external_id', dados.externalId],
                        ['fbc', dados.fbc],
                        ['fbp', dados.fbp],
                        ['IP', dados.ip],
                        ['Navegador', dados.userAgent || '—'],
                        ['Pedido', dados.orderId],
                      ] as const
                    ).map(([nome, v]) => (
                      <div key={nome} className="grid gap-0.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
                        <dt className="text-fg-muted">{nome}</dt>
                        <dd className="wrap-token font-mono text-fg-body">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </>
            ) : (
              <p className="flex items-center gap-2 text-caption text-fg-muted">
                <Spinner />
                Preparando os dados de teste…
              </p>
            )}
          </Section>
        </div>

        {/* ---- 3. Eventos e o botão ---- */}
        <div className={consoleStyles.reviewColumn}>
          <Section
            id="teste-eventos"
            step={3}
            icon={Send}
            variant="card"
            title="Eventos"
            description="Na ordem do funil. Desmarque o que não quiser testar."
          >
            <ul className="flex flex-col gap-1.5">
              {EVENTOS_DE_TESTE.map((evento) => {
                const linha = linhas[evento];
                return (
                  <li key={evento} className="flex min-w-0 flex-col gap-1 rounded-control bg-surface-2 p-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <Checkbox
                          checked={marcados.has(evento)}
                          disabled={rodando}
                          onCheckedChange={(v) => alternar(evento, Boolean(v))}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-mono text-label font-medium text-fg-strong">{evento}</span>
                          <span className="truncate text-caption text-fg-muted">{ROTULO_DO_EVENTO[evento]}</span>
                        </span>
                      </label>
                      <EstadoDaLinha linha={linha} />
                    </div>
                    {linha?.estado === 'erro' && (
                      <div className="pl-6.5 text-caption">
                        <p className="text-fg-body">{linha.mensagem}</p>
                        {linha.fbtraceId && (
                          <p className="wrap-token font-mono text-fg-muted">fbtrace_id {linha.fbtraceId}</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={() => void disparar()}
                  disabled={!pode}
                  aria-describedby={motivo ? 'teste-motivo' : undefined}
                >
                  {rodando ? (
                    <>
                      <Spinner />
                      Enviando {Math.min(enviados + 1, total)} de {total}…
                    </>
                  ) : (
                    <>
                      <Send className="size-4" aria-hidden />
                      {rotuloDoBotao}
                    </>
                  )}
                </Button>
                {rodando && (
                  <Button size="lg" variant="outline" onClick={parar}>
                    <Square className="size-4" aria-hidden />
                    Parar
                  </Button>
                )}
              </div>
              {motivo && !rodando && (
                <p id="teste-motivo" className="text-caption text-fg-muted">
                  {motivo}
                </p>
              )}
            </div>

            <p className="sr-only" aria-live="polite">
              {rodando ? `Enviando ${Math.min(enviados + 1, total)} de ${total}` : terminou ? `${aceitos} de ${total} aceitos` : ''}
            </p>

            {terminou && (
              <div className={cn(receitaBloco, 'flex flex-col gap-2')}>
                <p className="text-title font-semibold text-fg-strong tabular">
                  {aceitos} de {total} aceitos
                </p>
                {parouPorPedido && <p className="text-caption text-fg-muted">Você parou antes do fim.</p>}
                {pixelId && (
                  <a
                    href={enderecoDoTestarEventos(pixelId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    Abrir Testar eventos
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

/** O estado de um evento, em palavras e com ícone (nunca só a cor). */
function EstadoDaLinha({ linha }: { linha: Linha | undefined }) {
  if (!linha) return null;
  switch (linha.estado) {
    case 'aguardando':
      return (
        <StatusDot tone="neutral" icon={Clock} className="shrink-0">
          Aguardando
        </StatusDot>
      );
    case 'enviando':
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-tinta-texto">
          <Spinner className="size-3.5" />
          <span className="text-caption font-medium">Enviando…</span>
        </span>
      );
    case 'aceito':
      return (
        <StatusDot tone="success" icon={CheckCircle2} className="shrink-0">
          Aceito pela Meta
        </StatusDot>
      );
    case 'erro':
      return (
        <StatusDot tone="danger" icon={XCircle} className="shrink-0">
          Erro
        </StatusDot>
      );
    case 'parado':
      return (
        <StatusDot tone="neutral" className="shrink-0">
          Não enviado
        </StatusDot>
      );
  }
}

export default EventosDeTeste;
