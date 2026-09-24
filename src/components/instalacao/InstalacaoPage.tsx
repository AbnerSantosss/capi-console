'use client';

/**
 * `/instalacao` — a primeira coisa que se faz no console.
 *
 * Existe porque a ordem da navegação mentia sobre a ordem do trabalho: as duas
 * únicas formas de um evento ENTRAR no produto — o webhook da plataforma e a
 * tag do site — viviam como abas de uma tela chamada "Disparo automático", que
 * é o que acontece DEPOIS. Quem abria o console pela primeira vez via a tela do
 * disparo manual e não tinha como saber que nada chegaria ali até instalar as
 * duas coisas que estavam escondidas duas telas adiante.
 *
 * Uma página só, com duas âncoras (`#webhook` e `#tag`), e não duas abas: os
 * dois blocos são a MESMA tarefa ("ligar o cliente ao console") e quem instala
 * costuma precisar dos dois no mesmo dia. Aba esconderia metade do trabalho.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Code2, Globe, Link2, Webhook } from '@/components/ui/icones';

import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import { Section, StatusDot } from '@/components/common/primitives';
import { TagDoSite } from '@/components/integrations/TagDoSite';
import type { Integracoes } from '@/components/integrations/tipos';
import type { DominioTag } from '@/lib/tag-dominios';
import { WebhookInstalacao } from './WebhookInstalacao';

/** Âncoras públicas desta tela. O `?aba=` antigo de `/automatico` aponta para cá. */
const ANCORA_WEBHOOK = 'webhook';
const ANCORA_TAG = 'tag';

export function InstalacaoPage({
  inicial,
  publicBaseUrl,
}: {
  inicial: { integracoes: Integracoes };
  /** URL publica (tunel). Vem do servidor para a URL copiada ser sempre a certa,
   *  mesmo quando o operador abre o console por localhost dentro da VPS. */
  publicBaseUrl?: string;
}) {
  const [cfg, setCfg] = useState<Integracoes>(inicial.integracoes);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const base =
    publicBaseUrl?.replace(/\/+$/, '') ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3333');
  const ehLocal = base.includes('localhost') || base.includes('127.0.0.1');

  // O link que vem de fora (`/instalacao#tag`, ou a tradução do `?aba=tag`
  // antigo) precisa rolar até o bloco certo. O salto nativo do navegador
  // acontece antes da hidratação, quando o bloco ainda não existe no DOM.
  useEffect(() => {
    const alvo = window.location.hash.replace(/^#/, '');
    if (alvo !== ANCORA_WEBHOOK && alvo !== ANCORA_TAG) return;
    document.getElementById(alvo)?.scrollIntoView({ block: 'start' });
  }, []);

  const carregar = useCallback(async () => {
    try {
      const d = await pedir<{ integracoes: Integracoes }>('/api/integracoes', {
        cache: 'no-store',
      });
      setCfg(d.integracoes);
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      /* servidor pode estar reiniciando */
    }
  }, []);

  const copiar = async (texto: string, chave: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(chave);
    setTimeout(() => setCopiado(null), 2000);
    toast.success('Copiado.');
  };

  const novoSegredo = async () => {
    try {
      const d = await pedir<{ segredo: string }>('/api/integracoes', { method: 'POST' });
      setCfg((atual) => ({ ...atual, entrada: { ...atual.entrada, segredo: d.segredo } }));
      toast.warning('Segredo trocado', {
        description: 'O segredo anterior parou de funcionar agora. Atualize o n8n.',
      });
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Não foi possível trocar o segredo.');
    }
  };

  /**
   * Grava só o apelido da URL de entrada.
   *
   * PUT próprio, e não um "salvar tudo": o aviso de "recadastre na plataforma"
   * só pode aparecer se a gravação realmente deu certo.
   */
  const salvarRotulo = async (rotulo: string): Promise<boolean> => {
    const novo: Integracoes = { ...cfg, entrada: { ...cfg.entrada, rotulo } };
    try {
      await pedir('/api/integracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novo),
      });
      setCfg(novo);
      toast.warning('Apelido salvo — a URL mudou', {
        description:
          'Cadastre a URL nova na plataforma. A anterior continua funcionando, mas o apelido antigo aparece marcado na caixa de entrada.',
      });
      return true;
    } catch (e) {
      if (e instanceof SessaoExpirada) return false;
      toast.error('Não foi possível salvar o apelido.', {
        description: e instanceof Error ? e.message : 'Erro desconhecido.',
      });
      return false;
    }
  };

  /**
   * Grava a lista de domínios da tag.
   *
   * O servidor é quem manda: ele preserva a chave, os contadores e o último hit
   * de cada domínio. Adotar a resposta evita a tela zerar o histórico de acesso
   * de um cliente só porque o navegador mandou o objeto sem esses campos.
   */
  const salvarDominios = async (dominios: DominioTag[]): Promise<boolean> => {
    setSalvando(true);
    try {
      const d = await pedir<{ integracoes: Integracoes }>('/api/integracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cfg, tag: { ...cfg.tag, dominios } }),
      });
      setCfg(d.integracoes);
      toast.success('Domínios da tag salvos.');
      return true;
    } catch (e) {
      if (e instanceof SessaoExpirada) return false;
      toast.error('Não foi possível salvar os domínios.', {
        description: e instanceof Error ? e.message : 'Erro desconhecido.',
      });
      return false;
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Gira só a chave pública da tag. O segredo do webhook não é tocado: a
   * entrega de vendas continua funcionando, o que para é a coleta do navegador
   * até o cliente recolar o código novo no site.
   */
  const novaChaveDaTag = async (): Promise<boolean> => {
    try {
      const d = await pedir<{ chave: string }>('/api/integracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alvo: 'tag' }),
      });
      setCfg((atual) => ({ ...atual, tag: { ...atual.tag, chave: d.chave } }));
      toast.warning('Chave da tag trocada', {
        description:
          'Toda tag já instalada parou de enviar. Mande o código novo para o cliente colar no site.',
      });
      return true;
    } catch (e) {
      if (e instanceof SessaoExpirada) return false;
      toast.error('Não foi possível gerar a chave nova.');
      return false;
    }
  };

  const simular = async () => {
    const exemplo = {
      event: 'order_approved',
      data: {
        order_id: `sim_${Date.now().toString(36)}`,
        amountMinor: 19700,
        currency: 'BRL',
        occurred_at: new Date().toISOString(),
        lead: {
          name: 'Simulação Teste',
          email: 'simulacao@exemplo.com.br',
          phone: '11987654321',
        },
        product: { name: 'Acesso Código Vencedor' },
        attribution: {
          event_source_url:
            'https://codigovencedor.com/checkout?utm_source=ig&utm_campaign=52666977144600&ad_id=52667052465200&fbclid=IwARsimulacao',
          ip_address: '187.54.12.89',
          user_agent: 'Mozilla/5.0 (simulação do console)',
          cookies: { fbc: 'fb.1.1712345678000.IwARsimulacao' },
        },
      },
    };

    try {
      await pedir('/api/webhook/in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CAPI-Secret': cfg.entrada.segredo,
        },
        body: JSON.stringify(exemplo),
      });

      toast.success('Webhook simulado recebido', {
        description: 'Ele aparece na caixa de entrada do disparo automático.',
      });
      void carregar();
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('A simulação falhou.', {
        description: e instanceof Error ? e.message : 'Erro desconhecido.',
      });
    }
  };

  const dominios = cfg.tag.dominios ?? [];
  const medindo = dominios.filter((d) => (d.hits ?? 0) > 0);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Resumo + índice. Duas funções na mesma faixa: dizer em uma linha se a
          instalação está de pé e levar direto ao bloco que falta. */}
      <section
        aria-label="Resumo da instalação"
        className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-panel border border-line-strong bg-surface-1 p-4"
      >
        {/* Nunca houve como saber, a partir do que a integração guarda, se a
            plataforma de fato manda alguma coisa para este endereço — não
            existe histórico de recebimento no modelo de dados. "Pronto para
            receber" era uma alegação real (o endpoint aceita qualquer POST
            autenticado agora mesmo), mas o tom de sucesso e o verbo levavam a
            crer que a integração já tinha sido confirmada de ponta a ponta.
            Tom neutro e o fato que dá para provar: o endpoint está sempre no
            ar, a confirmação de que a plataforma o usa vem de uma venda
            chegando na caixa de entrada. */}
        <StatusDot tone="neutral" icon={Webhook}>
          Endpoint do webhook sempre ativo
        </StatusDot>

        <StatusDot
          tone={medindo.length > 0 ? 'success' : dominios.length > 0 ? 'warning' : 'neutral'}
          icon={Globe}
        >
          {dominios.length === 0
            ? 'Nenhum domínio autorizado ainda'
            : medindo.length === 0
              ? `${dominios.length} domínio(s) autorizado(s), nenhum enviou evento ainda`
              : `${medindo.length} de ${dominios.length} domínio(s) já enviando`}
        </StatusDot>

        <nav aria-label="Blocos desta página" className="ml-auto flex items-center gap-3">
          <a
            href={`#${ANCORA_WEBHOOK}`}
            className="inline-flex items-center gap-1.5 text-caption font-medium text-tinta-texto underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
          >
            <Link2 className="size-3.5" aria-hidden />
            Webhook
          </a>
          <a
            href={`#${ANCORA_TAG}`}
            className="inline-flex items-center gap-1.5 text-caption font-medium text-tinta-texto underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta-texto"
          >
            <Link2 className="size-3.5" aria-hidden />
            Tag do site
          </a>
        </nav>
      </section>

      {/* As duas seções viravam duas paradas de uma corrida (V-01/Tarefa 6):
          o operador terminava o webhook, via "Passo 1 concluído" e não fazia
          ideia de que a tag — o pedaço que realmente falta na maioria das
          instalações — ainda estava logo abaixo. Um Section só, com a tag
          primeiro (o que costuma faltar) e o webhook por último (o que já
          costuma estar pronto), reflete a ordem de trabalho de verdade em vez
          da ordem em que os dois blocos foram escritos no código. */}
      <Section
        id={ANCORA_TAG}
        step={1}
        icon={Code2}
        variant="card"
        title="Webhook e tag do site"
        description="O webhook traz a venda da plataforma; a tag mede a visita no navegador e guarda a atribuição antes de a venda por PIX acontecer fora dele. Comece pela tag — é o que costuma faltar instalar."
      >
        <TagDoSite
          tag={cfg.tag}
          regras={cfg.regras}
          base={base}
          ehLocal={ehLocal}
          onSalvarDominios={salvarDominios}
          onTrocarChave={novaChaveDaTag}
          salvando={salvando}
          blocoWebhood={
            <div id={ANCORA_WEBHOOK} className="flex scroll-mt-32 flex-col gap-3">
              <h3 className="flex items-center gap-2 text-label font-semibold text-fg-strong">
                <Webhook className="size-3.5" aria-hidden />
                Webhook da plataforma de vendas
              </h3>
              <p className="text-body text-fg-body">
                Aponte a plataforma de vendas ou o n8n para este endereço e o
                payload chega pronto para revisão. É o que traz a venda —
                inclusive a de PIX, que acontece fora do navegador.
              </p>
              <WebhookInstalacao
                entrada={cfg.entrada}
                base={base}
                ehLocal={ehLocal}
                copiar={copiar}
                copiado={copiado}
                onTrocarSegredo={novoSegredo}
                onSalvarRotulo={salvarRotulo}
                onSimular={simular}
              />
            </div>
          }
        />
      </Section>
    </div>
  );
}

export default InstalacaoPage;
