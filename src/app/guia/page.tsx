'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Fingerprint,
  Lock,
  ShieldCheck,
  Webhook,
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { calcularEmq } from '@/lib/emq';
import { Callout, Section } from '@/components/common/primitives';

/** Os pesos e as descricoes vem de src/lib/emq.ts — fonte unica. */
const PARAMETROS = calcularEmq({}).parametros;

const PASSOS = [
  {
    titulo: 'Escolha o destino',
    o_que: 'Confira a marca, o Pixel e o ambiente no painel à direita.',
    onde: 'Selo de ambiente no topo, ou o painel Destino.',
    erro:
      'Disparar em produção achando que estava em teste. O selo âmbar "Produção" significa que o evento entra nas métricas reais.',
  },
  {
    titulo: 'Carregue os dados',
    o_que:
      'Escolha um webhook da caixa de entrada, cole o JSON, ou preencha os campos à mão.',
    onde: 'Seção 1, Origem dos dados.',
    erro:
      'Colar só os dados do cliente e esquecer a URL com o fbclid. Sem ela não há atribuição ao criativo.',
  },
  {
    titulo: 'Leia a qualidade',
    o_que:
      'O painel mostra a nota de 0 a 10 e quais dos 9 parâmetros estão faltando.',
    onde: 'Painel Qualidade do evento, à direita.',
    erro:
      'Ignorar a nota. Abaixo de 5.0 a Meta tem dificuldade para casar a conversão com um perfil.',
  },
  {
    titulo: 'Dispare',
    o_que:
      'Em produção aparece uma confirmação com o resumo do que vai ser enviado.',
    onde: 'Botão Disparar evento.',
    erro:
      'Passar pela confirmação no automático. Ela existe para você reler o Pixel e o valor.',
  },
  {
    titulo: 'Leia o resultado',
    o_que:
      'Confirme events_received igual a 1, guarde o fbtrace_id e abra o criativo que converteu.',
    onde: 'Painel que aparece no topo da coluna.',
    erro:
      'Assumir que HTTP 200 basta. Se events_received vier 0, a Meta não registrou nada.',
  },
];

const ONDE_ACHAR = [
  {
    dado: 'Pixel ID',
    caminho:
      'Gerenciador de Eventos → Fontes de dados → selecione o Pixel → o número aparece abaixo do nome.',
  },
  {
    dado: 'Token de acesso',
    caminho:
      'Gerenciador de Eventos → seu Pixel → Configurações → role até API de Conversões → Gerar token de acesso.',
  },
  {
    dado: 'Código de teste',
    caminho:
      'Gerenciador de Eventos → seu Pixel → aba Testar eventos → o código TEST##### fica no topo da página.',
  },
  {
    dado: 'fbc',
    caminho:
      'Cookie _fbc no navegador do comprador. Se não houver, monte a partir do ?fbclid= da URL: fb.1.<timestamp em ms>.<fbclid>.',
  },
  {
    dado: 'fbp',
    caminho:
      'Cookie _fbp, criado pelo Pixel no seu domínio no formato fb.1.<timestamp>.<número aleatório>.',
  },
  {
    dado: 'ad_id e UTMs',
    caminho:
      'Já vêm na event_source_url quando o anúncio usa os parâmetros dinâmicos da Meta ({{ad.id}}, {{campaign.id}}, {{adset.id}}).',
  },
];

/** O caminho de ligar o webhook automatico, do zero ao go-live. */
const PASSOS_WEBHOOK = [
  {
    titulo: 'Copiar a URL de recebimento',
    o_que:
      'A URL já vem com o segredo no caminho. Quem tiver essa URL consegue inserir eventos na sua caixa de entrada — trate como senha.',
    onde: 'Integrações → passo 1 → "URL para o xWinner" → Copiar.',
  },
  {
    titulo: 'Cadastrar o endpoint no xWinner',
    o_que:
      'Marque só os eventos que viram conversão: precheckout_opened, checkout_session_opened, payment_generated, checkout_card_attempted e purchase_approved. Abandono e estorno não precisam ser assinados.',
    onde: 'admin.codigovencedor.com → Integrações → Webhooks → Novo endpoint.',
  },
  {
    titulo: 'Clicar em "Testar"',
    o_que:
      'A plataforma envia um payload de exemplo com lead@example.com. Ele tem que aparecer na caixa de entrada e, se você mandar disparar, o resultado tem que ser "teste-ignorado". Se aparecer "enviado", pare tudo.',
    onde: 'xWinner → botão Testar do endpoint; depois Integrações → Caixa de entrada.',
  },
  {
    titulo: 'Conferir a caixa de entrada com venda real',
    o_que:
      'Espere uma compra de verdade chegar. Confira o evento de origem, o evento da Meta escolhido pela regra, o valor e se veio com fbc.',
    onde: 'Integrações → Caixa de entrada.',
  },
  {
    titulo: 'Ligar o automático no Purchase — com Código de teste',
    o_que:
      'Preencha o Código de teste da marca, depois mude a regra de purchase_approved para Automático. A próxima compra dispara sozinha e aparece só no Test Events.',
    onde: 'Marcas → Código de teste; Integrações → passo 2 → Regras.',
  },
  {
    titulo: 'Limpar o Código de teste (go-live)',
    o_que:
      'Depois de ver o Purchase certo no Test Events, apague o Código de teste. A partir daí as compras entram nas métricas reais da campanha.',
    onde: 'Marcas → Código de teste → salvar vazio.',
  },
];

export default function Guia() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-10">
          <h1 className="text-heading font-bold text-fg-strong">Guia</h1>
          <p className="mt-1.5 text-body text-fg-muted">
            Como operar o console, onde achar cada dado e o que a Meta exige.
          </p>
        </div>

        <div className="flex flex-col gap-14">
          {/* ------------------------------------------------------ */}
          <Section
            id="como-usar"
            step={1}
            title="Como usar"
            description="O fluxo tem cinco passos e sempre a mesma ordem."
          >
            <ol className="flex flex-col gap-4">
              {PASSOS.map((p, i) => (
                <li
                  key={p.titulo}
                  className="rounded-panel border border-line-strong bg-surface-1 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 font-mono text-caption font-semibold text-fg-muted"
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-title font-semibold text-fg-strong">
                        {p.titulo}
                      </h3>
                      <p className="mt-1.5 text-body text-fg-body">{p.o_que}</p>
                      <p className="mt-1 text-caption text-fg-muted">
                        <strong className="font-medium">Onde:</strong> {p.onde}
                      </p>
                      <p className="mt-2 flex items-start gap-1.5 text-caption text-warning">
                        <AlertTriangle
                          className="mt-0.5 size-3.5 shrink-0"
                          aria-hidden
                        />
                        <span>
                          <strong className="font-medium">Erro comum:</strong>{' '}
                          {p.erro}
                        </span>
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          {/* ------------------------------------------------------ */}
          <Section
            id="onde-achar"
            step={2}
            title="Onde achar cada dado"
            description="O caminho exato dentro do Gerenciador de Eventos."
          >
            <dl className="flex flex-col divide-y divide-line">
              {ONDE_ACHAR.map((i) => (
                <div key={i.dado} className="grid gap-1 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                  <dt className="font-mono text-label font-semibold text-fg-strong">
                    {i.dado}
                  </dt>
                  <dd className="text-body text-fg-muted">{i.caminho}</dd>
                </div>
              ))}
            </dl>
          </Section>

          {/* ------------------------------------------------------ */}
          <Section
            id="webhook-automatico"
            step={3}
            title="Webhook automático"
            description="Ligar o recebimento direto do xWinner, sem copiar e colar. Seis passos, nesta ordem."
          >
            <ol className="flex flex-col gap-4">
              {PASSOS_WEBHOOK.map((p, i) => (
                <li
                  key={p.titulo}
                  className="rounded-panel border border-line-strong bg-surface-1 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 font-mono text-caption font-semibold text-fg-muted"
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-title font-semibold text-fg-strong">
                        {p.titulo}
                      </h3>
                      <p className="mt-1.5 text-body text-fg-body">{p.o_que}</p>
                      <p className="mt-1 text-caption text-fg-muted">
                        <strong className="font-medium">Onde:</strong> {p.onde}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <Callout tone="warning" icon={Webhook} title="A ordem existe por um motivo">
              O passo 5 é a rede de segurança: enquanto o Código de teste da marca
              estiver preenchido, o disparo automático aparece no Test Events e{' '}
              <strong>não entra nas métricas reais</strong>. Só limpe o código
              depois de ver a compra chegando certa, com fbc e valor.
            </Callout>
          </Section>

          {/* ------------------------------------------------------ */}
          <Section
            id="emq"
            step={4}
            title="Entendendo a qualidade do evento"
            description="A soma ponderada dos 9 parâmetros vai de 0 a 10. Acima de 8 a atribuição ao anúncio é direta."
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-4 text-micro font-semibold tracking-wide text-fg-muted uppercase">
                      Parâmetro
                    </th>
                    <th scope="col" className="py-2 pr-4 text-micro font-semibold tracking-wide text-fg-muted uppercase">
                      Peso
                    </th>
                    <th scope="col" className="py-2 text-micro font-semibold tracking-wide text-fg-muted uppercase">
                      Como obter
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PARAMETROS.map((p) => (
                    <tr key={p.id} className="border-b border-line align-top">
                      <td className="py-3 pr-4">
                        <span className="block text-label font-medium text-fg-body">
                          {p.nome}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 font-mono text-micro text-fg-muted">
                          {p.sigla}
                          {p.hash && (
                            <span className="inline-flex items-center gap-0.5 text-success">
                              <Lock className="size-2.5" aria-hidden />
                              SHA-256
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-label text-fg-body tabular">
                        {p.peso.toFixed(1)}
                        {p.critico && (
                          <span className="mt-0.5 block text-micro font-semibold text-warning uppercase">
                            crítico
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-caption text-fg-muted">
                        {p.comoObter}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ------------------------------------------------------ */}
          <Section
            id="regras"
            step={5}
            title="Regras da Meta"
            description="O que a API aceita e o que ela recusa."
          >
            <div className="flex flex-col gap-3">
              <Regra icone={Clock} titulo="Janela de 7 dias">
                A Meta descarta qualquer evento cujo{' '}
                <code className="font-mono">event_time</code> tenha mais de 7 dias.
                O painel mostra quanto resta da janela.
              </Regra>

              <Regra icone={Copy} titulo="Deduplicação">
                Se o Pixel do navegador e a CAPI enviarem a mesma conversão, a Meta
                usa o <code className="font-mono">event_id</code> para descartar a
                duplicata. Use sempre o mesmo id nos dois lados —{' '}
                <code className="font-mono">order_&lt;número&gt;</code> resolve.
              </Regra>

              <Regra icone={Lock} titulo="Criptografia obrigatória">
                E-mail, telefone, nome, sobrenome e CPF saem daqui já em SHA-256.
                A Meta nunca recebe o dado em claro. IP, user agent,{' '}
                <code className="font-mono">fbc</code> e{' '}
                <code className="font-mono">fbp</code> vão em texto puro, por
                exigência da própria API.
              </Regra>

              <Regra icone={Fingerprint} titulo="Teste e produção">
                Com <code className="font-mono">test_event_code</code> preenchido, o
                evento aparece em <strong>Testar eventos</strong> e não entra nas
                métricas. Sem ele, entra — e alimenta o algoritmo de otimização.
              </Regra>

              <Regra icone={CheckCircle2} titulo="Confirmação de recebimento">
                HTTP 200 sozinho não basta. Confira{' '}
                <code className="font-mono">events_received: 1</code> na resposta.
                Guarde o <code className="font-mono">fbtrace_id</code>: é com ele
                que o suporte da Meta rastreia o evento.
              </Regra>
            </div>

            <Callout tone="danger" icon={ShieldCheck} title="Regra de ouro do projeto">
              Só envie eventos que aconteceram de verdade. Conversão inventada
              estraga o aprendizado da campanha e viola os termos da Meta.
            </Callout>
          </Section>
        </div>
      </main>
    </div>
  );
}

function Regra({
  icone: Icone,
  titulo,
  children,
}: {
  icone: React.ElementType;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-panel border border-line-strong bg-surface-1 p-4">
      <h3 className="flex items-center gap-2 text-label font-semibold text-fg-strong">
        <Icone className="size-4 text-accent-text" aria-hidden />
        {titulo}
      </h3>
      <p className="mt-1.5 text-body text-fg-muted">{children}</p>
    </div>
  );
}
