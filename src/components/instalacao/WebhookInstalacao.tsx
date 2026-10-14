'use client';

/**
 * Instalação do webhook de entrada — primeiro dos dois blocos de `/instalacao`.
 *
 * O corpo desta tela veio inteiro da aba "Recebimento" de `/automatico` (FASE A
 * do plano multi-empresa). Nada de comportamento mudou na mudança de endereço:
 * as duas URLs continuam valendo, o segredo continua sendo o último segmento do
 * caminho, e o apelido continua sem autenticar coisa alguma.
 *
 * O que mudou é a companhia. Antes o operador precisava descobrir que a
 * primeira coisa a fazer estava escondida numa aba de uma tela chamada "Disparo
 * automático"; agora é a primeira tela do console, ao lado da tag do site — os
 * dois lugares por onde evento entra no produto.
 */

import React, { useId, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Info,
  RefreshCw,
  Send,
  Terminal,
} from '@/components/ui/icones';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SeloDePasso } from '@/components/cenas';
import { Callout, Field } from '@/components/common/primitives';
import { cn } from '@/lib/utils';
import {
  erroDoRotulo,
  normalizarRotulo,
  ROTULO_PADRAO,
} from '@/components/integrations/rotulo';
import type { Integracoes } from '@/components/integrations/tipos';
import { nomeDaPlataforma } from '@/lib/produto';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import { IconeExpor } from './icones-animados';
import { TituloDoBloco } from './OndeInstalarTag';

/**
 * Os cinco passos do backoffice do xWinner, na ordem em que se faz.
 *
 * 🔴 Isto e FATO sobre UMA plataforma, e por isso so aparece para a empresa que
 * declarou usar xWinner (`plataforma === 'xwinner'`). Para as outras, o bloco
 * inteiro nao renderiza: mandar um cliente de Hotmart procurar
 * `admin.codigovencedor.com` e errar na primeira tela da instalacao.
 */
const passosXWinner: Array<{ id: string; conteudo: React.ReactNode }> = [
  {
    id: 'onde',
    conteudo: (
      <>
        Abra <code className="font-mono">admin.codigovencedor.com</code> → Integrações → aba{' '}
        <strong>Webhooks</strong>.
      </>
    ),
  },
  {
    id: 'novo',
    conteudo: (
      <>
        Clique em <strong>Novo endpoint</strong> e cole a URL.
      </>
    ),
  },
  { id: 'eventos', conteudo: <>Marque os 5 eventos abaixo.</> },
  {
    id: 'ativo',
    conteudo: (
      <>
        Deixe <strong>Ativo</strong> ligado e salve.
      </>
    ),
  },
  {
    // O xWinner mostra uma vez um segredo de assinatura dele; quem autentica
    // aqui é o segredo da URL.
    id: 'assinatura',
    conteudo: <>O segredo que o xWinner mostra não é usado.</>,
  },
];

/** Os eventos que viram conversão: o operador marca estes no formulário. */
const EVENTOS_XWINNER = [
  'precheckout_opened',
  'checkout_session_opened',
  'payment_generated',
  'checkout_card_attempted',
  'purchase_approved',
];

export interface WebhookInstalacaoPropriedades {
  /** Bloco `entrada` da configuração: segredo e apelido da URL pública. */
  entrada: Integracoes['entrada'];
  /** URL pública deste console, já sem a barra final. */
  base: string;
  /** true quando a base é localhost — nenhuma plataforma consegue entregar aqui. */
  ehLocal: boolean;
  /** Copia um texto e avisa. Vem de cima para o "Copiado" ficar sincronizado. */
  copiar: (texto: string, chave: string) => void | Promise<void>;
  /** Chave do último texto copiado, ou null. */
  copiado: string | null;
  /** Gira o segredo de entrada. */
  onTrocarSegredo: () => void | Promise<void>;
  /** Grava o apelido novo. Devolve false quando o servidor recusou. */
  onSalvarRotulo: (rotulo: string) => Promise<boolean>;
  /** Manda um recebimento de exemplo para a Fila. */
  onSimular: () => void | Promise<void>;
}

export function WebhookInstalacao({
  entrada,
  base,
  ehLocal,
  copiar,
  copiado,
  onTrocarSegredo,
  onSalvarRotulo,
  onSimular,
}: WebhookInstalacaoPropriedades) {
  const [mostrarUrlSensivel, setMostrarUrlSensivel] = useState(false);
  const [mostrarSegredo, setMostrarSegredo] = useState(false);
  const [salvandoRotulo, setSalvandoRotulo] = useState(false);
  // V7: o dia a dia desta tela é copiar UMA URL. O resto — o segredo, a URL
  // antiga, a URL do n8n, o apelido, o teste pela linha de comando e o túnel —
  // é de quem configura uma vez, e fica atrás de "Detalhes técnicos" (E3).
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);
  const idDetalhes = useId();

  // De onde sai o nome da plataforma desta tela. A empresa vem do store e nao
  // de uma propriedade porque `InstalacaoPage` nao a tem: ela recebe do
  // servidor a configuracao, nao a empresa. Ate a primeira carga a lista esta
  // vazia e `nomeDaPlataforma(undefined)` devolve "a plataforma" — o mesmo
  // texto que o servidor renderiza, entao nao ha divergencia de hidratacao.
  const empresa = useEmpresaStore((s) => s.ativa());
  const plataforma = empresa?.plataforma?.trim();
  const nomePlataforma = nomeDaPlataforma(plataforma);
  // 🔴 O bloco do xWinner so aparece para quem usa xWinner. Ele descreve UM
  // backoffice — o menu, o formulario sem campo de cabecalho e o botao
  // "Testar" que manda `ping`. Mostrar isso a um cliente de Hotmart e mandar
  // procurar uma tela que nao existe, logo na instalacao.
  const ehXWinner = plataforma?.toLowerCase() === 'xwinner';

  // Apelido só para dar nome à URL no backoffice da plataforma. O segredo
  // continua sendo o ÚLTIMO segmento — o apelido não autentica nada.
  const rotuloSalvo = entrada.rotulo?.trim() || ROTULO_PADRAO;

  // Rascunho reajustado DURANTE a renderização quando o valor salvo muda (troca
  // de empresa, recarga da configuração). Um efeito faria a caixa piscar com o
  // texto antigo por um frame; a forma abaixo é a recomendada pelo React para
  // estado derivado de propriedade.
  const [rotuloRascunho, setRotuloRascunho] = useState(rotuloSalvo);
  const [rotuloEspelhado, setRotuloEspelhado] = useState(rotuloSalvo);
  if (rotuloEspelhado !== rotuloSalvo) {
    setRotuloEspelhado(rotuloSalvo);
    setRotuloRascunho(rotuloSalvo);
  }

  // Duas formas de autenticar o recebimento. A do caminho existe porque o
  // backoffice da maioria das plataformas só oferece o campo "URL (https)" —
  // não há onde colocar um header customizado.
  const endpointCaminho = `${base}/api/webhook/in/${entrada.segredo}`;
  const endpointHeader = `${base}/api/webhook/in`;
  const endpointRotulado = `${base}/api/webhook/in/${rotuloSalvo}/${entrada.segredo}`;

  const rotuloLimpo = normalizarRotulo(rotuloRascunho);
  const erroRotulo = erroDoRotulo(rotuloLimpo);
  const rotuloMudou = rotuloLimpo !== rotuloSalvo;

  const curl = `curl -X POST ${endpointHeader} \
  -H "Content-Type: application/json" \
  -H "X-CAPI-Secret: ${entrada.segredo}" \
  -d '{"event":"purchase_approved","data":{...}}'`;
  const mascara = '••••••••••••';
  const ocultarSegredo = (texto: string) =>
    entrada.segredo ? texto.replace(entrada.segredo, mascara) : texto;
  const endpointRotuladoVisivel = mostrarUrlSensivel
    ? endpointRotulado
    : ocultarSegredo(endpointRotulado);
  const endpointCaminhoVisivel = mostrarUrlSensivel
    ? endpointCaminho
    : ocultarSegredo(endpointCaminho);
  const curlVisivel = mostrarSegredo ? curl : ocultarSegredo(curl);

  const salvarRotulo = async () => {
    if (erroRotulo || !rotuloMudou) return;
    setSalvandoRotulo(true);
    try {
      const deuCerto = await onSalvarRotulo(rotuloLimpo);
      if (deuCerto) setRotuloRascunho(rotuloLimpo);
    } finally {
      setSalvandoRotulo(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {ehLocal && (
        <Callout tone="warning" icon={AlertTriangle}>
          A plataforma só aceita endereço https. Use o endereço público.
        </Callout>
      )}

      <Field
        id="endpoint-rotulado"
        label={`URL para ${nomePlataforma}`}
        helper="Cole no webhook da plataforma. O final do endereço é o segredo: não mostre a ninguém."
        className="rounded-panel bg-surface-2 p-4"
        action={
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={mostrarUrlSensivel}
              onClick={() => setMostrarUrlSensivel((value) => !value)}
            >
              {mostrarUrlSensivel ? (
                <EyeOff className="size-3.5" aria-hidden />
              ) : (
                <Eye className="size-3.5" aria-hidden />
              )}
              {mostrarUrlSensivel ? 'Ocultar' : 'Mostrar'}
            </Button>
            <Button size="sm" onClick={() => copiar(endpointRotulado, 'ep-rotulado')}>
              {copiado === 'ep-rotulado' ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              Copiar a URL
            </Button>
          </div>
        }
      >
        <Input
          id="endpoint-rotulado"
          readOnly
          value={endpointRotuladoVisivel}
          className="wrap-token font-mono"
        />
      </Field>

      {ehXWinner && (
        <div className="flex min-w-0 flex-col gap-3">
          <TituloDoBloco assunto="webhook" icone={Info}>
            Como cadastrar no xWinner
          </TituloDoBloco>
          <ol className="flex flex-col gap-2.5">
            {passosXWinner.map((passo, indice) => (
              <li key={passo.id} className="flex min-w-0 items-center gap-3 text-body text-fg-body">
                <SeloDePasso numero={indice + 1} assunto="webhook" estado="proximo" />
                <span className="min-w-0">{passo.conteudo}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Eventos para marcar no xWinner">
            {EVENTOS_XWINNER.map((evento) => (
              <Button
                key={evento}
                size="sm"
                variant="outline"
                className="font-mono"
                aria-label={`Copiar ${evento}`}
                onClick={() => copiar(evento, `xw-${evento}`)}
              >
                {copiado === `xw-${evento}` ? (
                  <Check className="size-3.5 text-success" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                {evento}
              </Button>
            ))}
          </div>
          <p className="text-body text-fg-body">O botão Testar não conta como venda.</p>
        </div>
      )}

      <div>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={mostrarDetalhes}
          aria-controls={idDetalhes}
          onClick={() => setMostrarDetalhes((v) => !v)}
        >
          <ChevronDown
            className={cn('size-4 transition-transform', mostrarDetalhes && 'rotate-180')}
            aria-hidden
          />
          Detalhes técnicos
        </Button>
      </div>

      {/* `hidden`, e não desmontar: o rascunho do apelido e o rastreio de campo
          sujo da `InstalacaoPage` (C2) seguem valendo com os detalhes fechados. */}
      <div id={idDetalhes} hidden={!mostrarDetalhes} className="min-w-0">
        <div className="flex min-w-0 flex-col gap-5">
          <Field
            id="rotulo-endpoint"
            label="Apelido desta URL"
            helper="Mudar o apelido muda a URL: cole a nova na plataforma."
            error={erroRotulo ?? undefined}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={salvarRotulo}
                disabled={salvandoRotulo || Boolean(erroRotulo) || !rotuloMudou}
              >
                {salvandoRotulo ? 'Salvando…' : 'Salvar apelido'}
              </Button>
            }
          >
            <Input
              id="rotulo-endpoint"
              value={rotuloRascunho}
              onChange={(e) => setRotuloRascunho(e.target.value)}
              onBlur={() => setRotuloRascunho(normalizarRotulo(rotuloRascunho))}
              placeholder={ROTULO_PADRAO}
              className="wrap-token font-mono"
            />
          </Field>

          {rotuloMudou && !erroRotulo && (
            <Callout tone="warning" icon={AlertTriangle} title="Trocar o apelido muda a URL">
              Depois de salvar, cole a URL nova na plataforma. Até lá, as vendas
              chegam marcadas como <em>apelido antigo</em> na Fila.
            </Callout>
          )}

          <Field
            id="endpoint-caminho"
            label="URL antiga, sem apelido"
            helper="Endereço antigo, ainda aceito. Use só se a plataforma ainda não foi atualizada."
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copiar(endpointCaminho, 'ep-caminho')}
              >
                {copiado === 'ep-caminho' ? (
                  <Check className="size-3.5 text-success" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                Copiar
              </Button>
            }
          >
            <Input
              id="endpoint-caminho"
              readOnly
              value={endpointCaminhoVisivel}
              className="wrap-token font-mono"
            />
          </Field>

          <Field
            id="endpoint-header"
            label="URL para o n8n"
            helper="Para quem usa o n8n."
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copiar(endpointHeader, 'ep-header')}
              >
                {copiado === 'ep-header' ? (
                  <Check className="size-3.5 text-success" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                Copiar
              </Button>
            }
          >
            <Input
              id="endpoint-header"
              readOnly
              value={endpointHeader}
              className="wrap-token font-mono"
            />
          </Field>

          <Field
            id="segredo"
            label="Segredo"
            param="X-CAPI-Secret"
            helper="Último pedaço da URL. Trocar derruba a plataforma até colar a nova."
            action={
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-pressed={mostrarSegredo}
                  onClick={() => setMostrarSegredo((value) => !value)}
                >
                  {mostrarSegredo ? (
                    <EyeOff className="size-3.5" aria-hidden />
                  ) : (
                    <Eye className="size-3.5" aria-hidden />
                  )}
                  {mostrarSegredo ? 'Ocultar' : 'Mostrar'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copiar(entrada.segredo, 'seg')}
                >
                  {copiado === 'seg' ? (
                    <Check className="size-3.5 text-success" aria-hidden />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                  Copiar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void onTrocarSegredo()}>
                  <RefreshCw className="size-3.5" aria-hidden />
                  Trocar
                </Button>
              </div>
            }
          >
            <Input
              id="segredo"
              readOnly
              value={mostrarSegredo ? entrada.segredo : mascara}
              className="wrap-token font-mono"
            />
          </Field>

          <div className="flex min-w-0 flex-col gap-2">
            <TituloDoBloco assunto="webhook" icone={Terminal}>
              Teste pela linha de comando
            </TituloDoBloco>
            <p className="text-body text-fg-body">
              Só em ambiente isolado. O segredo aparece com o &ldquo;Mostrar&rdquo; do
              campo Segredo.
            </p>
            <pre className="wrap-token max-w-full overflow-x-auto whitespace-pre-wrap rounded-control border border-line-strong bg-surface-1 p-3 font-mono text-caption text-fg-strong">
              {curlVisivel}
            </pre>
            <div>
              <Button variant="outline" onClick={() => void onSimular()}>
                <Send className="size-4" aria-hidden />
                Simular recebimento
              </Button>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <TituloDoBloco desenho={<IconeExpor />}>Expor para a internet</TituloDoBloco>
            <p className="text-body text-fg-body">
              Em <code className="font-mono">localhost</code>, ninguém de fora alcança
              o console. Para receber webhooks reais, abra um túnel:
            </p>
            <pre className="wrap-token max-w-full overflow-x-auto rounded-control border border-line-strong bg-surface-1 p-2.5 font-mono text-caption text-fg-strong">
              cloudflared tunnel --url http://localhost:3333
            </pre>
            <p className="text-body text-fg-body">
              Na VPS o console roda em <code className="font-mono">3334</code> e o
              endereço fixo do túnel é{' '}
              <code className="font-mono">capi.proxserverabner.site</code>. Use o
              endereço gerado + <code className="font-mono">/api/webhook/in</code>. O
              segredo é a única proteção: não o compartilhe.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WebhookInstalacao;
