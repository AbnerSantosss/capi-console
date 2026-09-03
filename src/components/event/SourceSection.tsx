'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Braces, Inbox, Trash2, Wand2, Zap } from 'lucide-react';

import { useEventStore } from '@/stores/useEventStore';
import { parseWebhook } from '@/lib/parser';
import { Section } from '@/components/common/primitives';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { InboxList } from '@/components/integrations/InboxList';

const EXEMPLO = `{
  "event": "order_approved",
  "data": {
    "order_id": "118",
    "amountMinor": 19700,
    "currency": "BRL",
    "occurred_at": "${new Date().toISOString()}",
    "lead": {
      "name": "Carlos Eduardo Silva",
      "email": "carlos.silva@exemplo.com.br",
      "phone": "11987654321",
      "taxId": "12345678901"
    },
    "product": { "name": "Acesso Código Vencedor" },
    "attribution": {
      "event_source_url": "https://codigovencedor.com/checkout?utm_source=ig&utm_campaign=52666977144600&utm_term=52666977145000&ad_id=52667052465200&fbclid=IwAR3wXYZ",
      "ip_address": "187.54.12.89",
      "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      "cookies": {
        "fbc": "fb.1.1712345678000.IwAR3wXYZ",
        "fbp": "fb.1.1712345678000.1098765432"
      }
    }
  }
}`;

export function SourceSection() {
  const [aba, setAba] = useState('inbox');

  return (
    <Section
      id="secao-origem"
      step={1}
      title="Origem dos dados"
      description="Traga o evento de um webhook recebido, cole o JSON, ou preencha os campos abaixo à mão."
    >
      <Tabs value={aba} onValueChange={(v) => v && setAba(String(v))}>
        <TabsList className="h-auto w-full bg-surface-2 p-1 sm:w-auto">
          <TabsTrigger
            value="inbox"
            className="h-control-sm gap-2 rounded-control px-4 text-label data-active:bg-surface-3 data-active:text-fg-strong"
          >
            <Inbox className="size-4" aria-hidden />
            Caixa de entrada
          </TabsTrigger>
          <TabsTrigger
            value="json"
            className="h-control-sm gap-2 rounded-control px-4 text-label data-active:bg-surface-3 data-active:text-fg-strong"
          >
            <Braces className="size-4" aria-hidden />
            Colar JSON
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4 outline-none">
          <InboxList compacto />
        </TabsContent>

        <TabsContent value="json" className="mt-4 outline-none">
          <JsonPaste />
        </TabsContent>
      </Tabs>
    </Section>
  );
}

/* ------------------------------------------------------------------ */

function JsonPaste() {
  const jsonPayload = useEventStore((s) => s.jsonPayload);
  const setJsonPayload = useEventStore((s) => s.setJsonPayload);
  const carregarDoParser = useEventStore((s) => s.carregarDoParser);

  const formatar = () => {
    if (!jsonPayload.trim()) return toast.error('Cole um JSON primeiro.');
    try {
      setJsonPayload(JSON.stringify(JSON.parse(jsonPayload), null, 2));
      toast.success('JSON formatado.');
    } catch (e) {
      toast.error('JSON inválido', {
        description: e instanceof Error ? e.message : 'Sintaxe incorreta.',
      });
    }
  };

  const extrair = () => {
    if (!jsonPayload.trim()) {
      return toast.error('O campo está vazio.', {
        description: 'Cole o corpo do webhook ou carregue o exemplo.',
      });
    }
    try {
      const r = parseWebhook(jsonPayload);
      const qtd = Object.keys(r.fields).length;
      if (!qtd && !r.eventName) {
        return toast.error('Nada reconhecível no JSON.', {
          description: 'O parser não encontrou dados de cliente nem de transação.',
        });
      }
      // zera o formulario antes de aplicar: nada do payload anterior sobrevive
      carregarDoParser(r.fields as never, r.eventName);
      toast.success(
        `${r.preenchidos.length} ${r.preenchidos.length === 1 ? 'campo preenchido' : 'campos preenchidos'}`,
        { description: r.preenchidos.join(' · ') }
      );
    } catch (e) {
      toast.error('Erro ao processar', {
        description: e instanceof Error ? e.message : 'Falha no parser.',
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor="json-webhook"
          className="text-label font-medium text-fg-body"
        >
          Payload do webhook
        </label>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={formatar}>
            <Wand2 className="size-3.5" aria-hidden />
            Formatar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setJsonPayload(EXEMPLO);
              toast.success('Exemplo carregado.');
            }}
          >
            Exemplo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setJsonPayload('')}
            aria-label="Limpar o campo de JSON"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <Textarea
        id="json-webhook"
        value={jsonPayload}
        onChange={(e) => setJsonPayload(e.target.value)}
        placeholder="Cole aqui o JSON recebido da xWinner, Kiwify, Hotmart, n8n…"
        className="h-44 resize-y font-mono text-caption leading-relaxed"
        spellCheck={false}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-fg-muted">
          Extrair só preenche os campos. Nada é enviado à Meta agora.
        </p>
        <Button onClick={extrair}>
          <Zap className="size-4" aria-hidden />
          Extrair dados
        </Button>
      </div>
    </div>
  );
}

export default SourceSection;
