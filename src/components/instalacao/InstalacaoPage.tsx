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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Code2, Globe, Webhook } from '@/components/ui/icones';

import { pedir, SessaoExpirada } from '@/lib/cliente-api';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import { Section, StatusDot } from '@/components/common/primitives';
import { TagDoSite } from '@/components/integrations/TagDoSite';
import type { Integracoes } from '@/components/integrations/tipos';
import type { DominioTag } from '@/lib/tag-dominios';
import { WebhookInstalacao } from './WebhookInstalacao';

/** Âncoras públicas desta tela. O `?aba=` antigo de `/automatico` aponta para cá. */
const ANCORA_WEBHOOK = 'webhook';
const ANCORA_TAG = 'tag';

/** Campos onde o operador digita (os de só leitura e as caixas de marcar ficam de fora). */
const TIPOS_DE_TEXTO = new Set(['text', 'search', 'url', 'email', 'tel', 'number']);
function campoEditavel(alvo: EventTarget | null): alvo is HTMLInputElement | HTMLTextAreaElement {
  if (alvo instanceof HTMLTextAreaElement) return !alvo.readOnly && !alvo.disabled;
  if (alvo instanceof HTMLInputElement) return TIPOS_DE_TEXTO.has(alvo.type) && !alvo.readOnly && !alvo.disabled;
  return false;
}

export function InstalacaoPage({
  empresaId,
  inicial,
  publicBaseUrl,
}: {
  /** Empresa cujos dados vieram em `inicial` (a página remonta por ela). Vai no
   *  corpo de cada PUT e no header `X-Empresa-Id` de cada POST (o servidor
   *  recusa com 409 se a ativa já for outra) e da leitura: esta tela só relê a
   *  empresa dela. */
  empresaId: string;
  inicial: { integracoes: Integracoes };
  /** URL publica (tunel). Vem do servidor para a URL copiada ser sempre a certa,
   *  mesmo quando o operador abre o console por localhost dentro da VPS. */
  publicBaseUrl?: string;
}) {
  const [cfg, setCfg] = useState<Integracoes>(inicial.integracoes);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  // C2 (T6): rascunho = campo digitado e ainda não salvo. Com rascunho, a troca
  // de empresa feita em OUTRA aba não recarrega esta tela sozinha: o seletor
  // avisa e oferece "Recarregar agora". Os campos editáveis moram nos filhos
  // (apelido da URL, domínio e subdomínio novos), então um ouvinte só, na raiz,
  // compara o valor de cada campo com o que ele tinha ao receber o foco.
  const valorAoFocar = useRef(new Map<HTMLInputElement | HTMLTextAreaElement, string>());
  const camposSujos = useRef(new Set<HTMLInputElement | HTMLTextAreaElement>());
  const aoFocarCampo = (e: React.FocusEvent<HTMLDivElement>) => {
    const alvo: EventTarget = e.target;
    if (campoEditavel(alvo) && !valorAoFocar.current.has(alvo)) valorAoFocar.current.set(alvo, alvo.value);
  };
  const aoDigitar = (e: React.FormEvent<HTMLDivElement>) => {
    const alvo: EventTarget = e.target;
    if (!campoEditavel(alvo)) return;
    if (alvo.value !== (valorAoFocar.current.get(alvo) ?? '')) camposSujos.current.add(alvo);
    else camposSujos.current.delete(alvo);
    useEmpresaStore.getState().marcarRascunho(camposSujos.current.size > 0);
  };
  /**
   * Relê os campos depois de salvar ou de sair de um campo: o filho limpa ou
   * normaliza o valor no próximo render, e isso não dispara `input`. Depois de
   * salvar o apelido, o valor salvo vira a nova base do campo do webhook.
   */
  const desmontada = useRef(false);
  const reavaliarRascunho = (apelidoSalvo = false) => {
    window.setTimeout(() => {
      if (desmontada.current) return;
      for (const campo of [...valorAoFocar.current.keys()]) {
        if (apelidoSalvo && campo.closest(`#${ANCORA_WEBHOOK}`)) valorAoFocar.current.set(campo, campo.value);
        if (!campo.isConnected || campo.value === valorAoFocar.current.get(campo)) camposSujos.current.delete(campo);
        else camposSujos.current.add(campo);
      }
      useEmpresaStore.getState().marcarRascunho(camposSujos.current.size > 0);
    }, 100);
  };
  // Tela desmontada (troca de empresa, outra rota): não sobra rascunho no store.
  useEffect(() => {
    desmontada.current = false;
    return () => {
      desmontada.current = true;
      useEmpresaStore.getState().marcarRascunho(false);
    };
  }, []);

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

  /**
   * C2 (T6), revisão rodada 2 — a leitura diz a empresa da TELA no header,
   * como as escritas. Com outra aba tendo trocado a empresa e esta tela ainda
   * aberta (rascunho), o header do store já é o da empresa nova: o `carregar()`
   * do "Simular" punha os dados dela nesta instância, que segue com a `key` da
   * anterior. Se a empresa voltasse, nada remontava e o PUT seguinte gravava
   * os dados de uma empresa no arquivo da outra, com o `empresaId` certo.
   */
  const carregar = useCallback(async () => {
    try {
      const d = await pedir<{ integracoes: Integracoes }>('/api/integracoes', {
        cache: 'no-store',
        headers: { 'X-Empresa-Id': empresaId },
      });
      setCfg(d.integracoes);
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      /* servidor pode estar reiniciando */
    }
  }, [empresaId]);

  const copiar = async (texto: string, chave: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(chave);
    setTimeout(() => setCopiado(null), 2000);
    toast.success('Copiado.');
  };

  /**
   * C2 (T6), correção da revisão — os dois POSTs (este e `novaChaveDaTag`) não
   * têm corpo de configuração para levar `empresaId`, então dizem a empresa da
   * TELA no header `X-Empresa-Id`. Sem isso, com outra aba tendo trocado a
   * empresa e esta tela ainda mostrando a anterior (rascunho aberto), o store
   * já sincronizado mandaria o header da empresa NOVA e o servidor giraria a
   * credencial dela, derrubando o n8n ou a tag de outro cliente. Com o header
   * da tela e o cookie da empresa nova, o servidor responde 409 e nada gira. O
   * `pedir` respeita header explícito.
   */
  const novoSegredo = async () => {
    try {
      const d = await pedir<{ segredo: string }>('/api/integracoes', {
        method: 'POST',
        headers: { 'X-Empresa-Id': empresaId },
      });
      setCfg((atual) => ({ ...atual, entrada: { ...atual.entrada, segredo: d.segredo } }));
      toast.warning('Segredo trocado', {
        description: 'O segredo anterior parou de funcionar agora. Atualize o n8n.',
      });
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Não foi possível trocar o segredo.', {
        description: e instanceof Error ? e.message : 'Erro desconhecido.',
      });
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
        body: JSON.stringify({ ...novo, empresaId }),
      });
      setCfg(novo);
      reavaliarRascunho(true);
      toast.warning('Apelido salvo — a URL mudou', {
        description:
          'Cadastre a URL nova na plataforma. A anterior continua funcionando, mas o apelido antigo aparece marcado na Fila.',
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
        body: JSON.stringify({ ...cfg, tag: { ...cfg.tag, dominios }, empresaId }),
      });
      setCfg(d.integracoes);
      reavaliarRascunho();
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
        headers: { 'Content-Type': 'application/json', 'X-Empresa-Id': empresaId },
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
      toast.error('Não foi possível gerar a chave nova.', {
        description: e instanceof Error ? e.message : 'Erro desconhecido.',
      });
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
        description: 'Ele aparece em Eventos → Fila.',
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
    <div
      className="flex min-w-0 flex-col gap-6"
      onFocus={aoFocarCampo}
      onInput={aoDigitar}
      onBlur={() => reavaliarRascunho()}
    >
      {/* V7: dois cartões, um por fonte, cada um com o estado em palavra no
          cabeçalho — a faixa de resumo com os dois estados e o índice de
          âncoras saiu, porque cada cartão já diz o seu. A tag vem primeiro (é
          o que costuma faltar instalar); o webhook depois (já costuma estar
          pronto). As âncoras `#tag` e `#webhook` continuam as mesmas. */}
      <Section
        id={ANCORA_TAG}
        icon={Code2}
        variant="card"
        title="Tag do site"
        description="Mede a visita no navegador e guarda a atribuição antes de a venda por PIX acontecer fora dele."
        action={
          <StatusDot
            tone={medindo.length > 0 ? 'success' : dominios.length > 0 ? 'warning' : 'neutral'}
            icon={Globe}
          >
            {dominios.length === 0
              ? 'Nenhum site permitido ainda'
              : medindo.length === 0
                ? 'Nenhum site enviou evento ainda'
                : `${medindo.length} de ${dominios.length} site(s) enviando`}
          </StatusDot>
        }
      >
        <TagDoSite
          tag={cfg.tag}
          regras={cfg.regras}
          base={base}
          ehLocal={ehLocal}
          onSalvarDominios={salvarDominios}
          onTrocarChave={novaChaveDaTag}
          salvando={salvando}
          blocoWebhood={null}
        />
      </Section>

      {/* O estado do webhook é o que dá para provar: o endereço está sempre no
          ar; que a plataforma de fato o usa, só uma venda chegando na Fila
          confirma — não existe histórico de recebimento no modelo de dados.
          Por isso o tom neutro, nunca o de sucesso. Em localhost, nenhuma
          plataforma alcança o endereço: aí o estado é de alerta. */}
      <Section
        id={ANCORA_WEBHOOK}
        icon={Webhook}
        variant="card"
        title="Webhook de vendas"
        description="Aponte a plataforma de vendas ou o n8n para este endereço. É o que traz a venda — inclusive a de PIX, que acontece fora do navegador. Quem confirma que a plataforma o usa é a primeira venda que aparecer na Fila."
        action={
          <StatusDot tone={ehLocal ? 'warning' : 'neutral'} icon={Webhook}>
            {ehLocal ? 'Só nesta máquina (localhost)' : 'Endereço no ar'}
          </StatusDot>
        }
      >
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
      </Section>
    </div>
  );
}

export default InstalacaoPage;
