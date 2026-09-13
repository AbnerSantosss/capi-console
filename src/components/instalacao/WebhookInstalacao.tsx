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

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Send,
  Terminal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, Field, Panel } from '@/components/common/primitives';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  erroDoRotulo,
  normalizarRotulo,
  ROTULO_PADRAO,
} from '@/components/integrations/rotulo';
import type { Integracoes } from '@/components/integrations/tipos';

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
  /** Manda um recebimento de exemplo para a caixa de entrada. */
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
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        {ehLocal && (
          <Callout tone="warning" icon={AlertTriangle} title="A plataforma exige https">
            O campo do backoffice é <strong>URL (https)</strong> e este console
            está em <code className="font-mono">{base}</code>. Abra o acesso
            público ao lado e use a URL gerada no lugar de{' '}
            <code className="font-mono">localhost:3333</code>.
          </Callout>
        )}

        <Field
          id="endpoint-rotulado"
          label="URL para a plataforma"
          helper="Cole esta URL no cadastro de webhooks da plataforma de vendas. O apelido é só para você reconhecer a linha no backoffice; quem autentica é o segredo, sempre o último pedaço do endereço."
          className="rounded-lg border border-line bg-surface-2/55 p-4"
          action={
            <div className="flex gap-1">
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copiar(endpointRotulado, 'ep-rotulado')}
              >
                {copiado === 'ep-rotulado' ? (
                  <Check className="size-3.5 text-success" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                Copiar
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

        <Field
          id="rotulo-endpoint"
          label="Apelido desta URL"
          helper={`Minúsculas, dígitos e hífen. Aparece no endereço como /api/webhook/in/${rotuloLimpo || 'apelido'}/…`}
          error={erroRotulo ?? undefined}
          className="rounded-lg border border-line bg-surface-2/55 p-4"
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
            Depois de salvar você precisa{' '}
            <strong>cadastrar a URL nova na plataforma</strong>. Enquanto o
            backoffice apontar para o apelido antigo, as entregas continuam
            chegando — o segredo é o mesmo —, mas aparecem marcadas como{' '}
            <em>apelido antigo</em> na caixa de entrada.
          </Callout>
        )}

        <Accordion className="rounded-lg border border-line bg-surface-2/45">
          <AccordionItem value="url-antiga" className="last:border-b-0">
            <AccordionTrigger className="px-4 hover:no-underline">
              <span className="text-label font-semibold text-fg-body">
                URL antiga, sem apelido (continua valendo)
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <p className="mb-2 text-caption text-fg-muted">
                É o formato cadastrado antes de o apelido existir. Não precisa
                trocar: o endpoint aceita os dois. Serve de saída se algo der
                errado com o apelido.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={endpointCaminhoVisivel}
                  aria-label="URL antiga sem apelido"
                  className="wrap-token font-mono"
                />
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
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Field
          id="endpoint-header"
          label="URL para o n8n"
          helper="Quando o remetente aceita header customizado, prefira este formato: a URL fica limpa e o segredo não aparece nela."
          className="rounded-lg border border-line bg-surface-2/55 p-4"
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
          helper="Vale para as duas URLs acima. Sem o segredo correto o endpoint responde 401."
          className="rounded-lg border border-line bg-surface-2/55 p-4"
          action={
            <div className="flex gap-1">
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

        <Accordion className="rounded-lg border border-line bg-surface-2/45">
          <AccordionItem value="instrucoes" className="last:border-b-0">
            <AccordionTrigger className="px-4 hover:no-underline">
              <span className="flex items-center gap-2 text-label font-semibold text-fg-body">
                <Terminal className="size-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
                Instruções técnicas
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <p className="mb-2 text-caption text-fg-muted">
                Teste pela linha de comando somente em um ambiente isolado.
              </p>
              <pre className="wrap-token max-w-full overflow-x-auto whitespace-pre-wrap rounded-control border border-line-strong bg-surface-1 p-3 font-mono text-caption text-fg-muted">
                {curlVisivel}
              </pre>
              <Button variant="outline" className="mt-3" onClick={() => void onSimular()}>
                <Send className="size-4" aria-hidden />
                Simular recebimento
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Expor para a internet" icon={ArrowUpRight}>
          <p className="text-caption text-fg-muted">
            Este console roda em <code className="font-mono">localhost</code> e
            não é alcançável de fora. Para receber webhooks reais, abra um túnel:
          </p>
          <pre className="wrap-token mt-2 overflow-x-auto rounded-control border border-line-strong bg-surface-2 p-2.5 font-mono text-caption text-fg-muted">
            cloudflared tunnel --url http://localhost:3333
          </pre>
          <p className="mt-2 text-caption text-fg-muted">
            Na VPS o console roda em <code className="font-mono">3334</code> (a
            3333 já é de outro container) e o hostname fixo do túnel é{' '}
            <code className="font-mono">capi.proxserverabner.site</code>.
          </p>
          <p className="mt-2 text-caption text-fg-muted">
            Use a URL gerada + <code className="font-mono">/api/webhook/in</code>.
            O segredo é a única proteção — não o compartilhe.
          </p>
        </Panel>
      </div>
    </div>
  );
}

export default WebhookInstalacao;
