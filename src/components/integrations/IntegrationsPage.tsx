'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ErroApi, pedir, SessaoExpirada } from '@/lib/cliente-api';
import {
  ArrowUpRight,
  FlaskConical,
  GitBranch,
  Inbox,
  Plug,
  ShieldAlert,
} from '@/components/ui/icones';

import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Section, Panel, Callout } from '@/components/common/primitives';
import { InboxList } from './InboxList';
import { RulesSection } from './RulesSection';
import { Repasse } from './Repasse';
import type { Destino, Entrega, Integracoes } from './tipos';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import {
  IntegrationFlow,
  type IntegrationTab,
} from './IntegrationFlow';
import { ChaveDoAutomatico } from './ChaveDoAutomatico';
import { ListaDeTestes } from './ListaDeTestes';
import type { ListaDeTeste } from '@/lib/deteccao-de-teste';

/**
 * Tres abas em dois grupos rotulados. O grupo responde "em que parte do caminho
 * do evento isto acontece", que e a pergunta que a lista plana de seis abas nao
 * respondia (§7.6).
 *
 * O grupo "O que entra" — Recebimento e Tag do site — saiu inteiro daqui na
 * FASE A do plano multi-empresa e virou a rota `/instalacao`. As duas abas nao
 * eram "o que acontece com o evento": eram o que se faz UMA vez, antes de
 * qualquer evento existir. Enquanto moravam dentro de uma tela chamada "Disparo
 * automatico", a primeira tarefa do produto era tambem a mais escondida.
 */
const GRUPOS: Array<{
  id: string;
  label: string;
  abas: Array<{ value: IntegrationTab; label: string; icon: typeof Inbox }>;
}> = [
  {
    id: 'acontece',
    label: 'O que acontece',
    abas: [
      { value: 'inbox', label: 'Fila', icon: Inbox },
      { value: 'regras', label: 'Regras', icon: GitBranch },
      // Fica junto de Regras porque responde a mesma pergunta — "o que decide
      // o destino deste evento?" —, so que pelo lado de quem mandou em vez do
      // lado do que foi mandado.
      { value: 'testes', label: 'Teste interno', icon: FlaskConical },
    ],
  },
  {
    id: 'sai',
    label: 'O que sai',
    abas: [{ value: 'retornos', label: 'Repasse', icon: ArrowUpRight }],
  },
];

const ABAS = GRUPOS.flatMap((grupo) => grupo.abas);

const ABA_PADRAO: IntegrationTab = 'inbox';

/** `?aba=` so aceita o que existe; qualquer outra coisa cai no padrao. */
function abaDaConsulta(valor: string | null): IntegrationTab | null {
  return ABAS.some((item) => item.value === valor)
    ? (valor as IntegrationTab)
    : null;
}

/**
 * 🔴 COMPATIBILIDADE PERMANENTE COM O HASH ANTIGO — NAO TIRE ESTE MAPA.
 *
 * Ate a FASE 4 a aba vivia em `window.location.hash`. Todo `#inbox`, `#regras`
 * ou `#historico` ja salvo em favorito ou colado numa conversa continua tendo
 * que abrir a aba certa: link publicado nao expira. Mesmo princípio da decisao
 * irreversivel #10 (a URL de webhook de um segmento vale para sempre). Isto nao
 * e uma migracao com prazo — e uma traducao que fica.
 *
 * `#historico` e o caso especial: a aba deixou de existir, entao ele aponta
 * para Retornos, onde o Historico virou secao. O hash sobrevive como ANCORA de
 * conteudo (`#historico` rola ate a secao), que e a funcao nativa que o uso
 * como estado de aba vinha roubando (IA-R4).
 */
const HASH_LEGADO: Record<string, IntegrationTab> = {
  inbox: 'inbox',
  regras: 'regras',
  retornos: 'retornos',
  historico: 'retornos',
};

/**
 * 🔴 COMPATIBILIDADE PERMANENTE COM AS DUAS ABAS QUE MUDARAM DE ROTA.
 *
 * `?aba=recebimento` e `?aba=tag` (e os hashes `#recebimento`/`#tag`) sao links
 * que ja existem em favorito, em anotacao e em conversa com cliente. Eles nao
 * podem morrer so porque o conteudo mudou de endereco: levam para `/instalacao`
 * na ancora certa, que e exatamente onde a pessoa esperava cair.
 *
 * Vale o mesmo principio da decisao irreversivel #10 — endereco publicado
 * responde para sempre. Isto nao tem prazo de validade.
 */
const ROTA_LEGADA: Record<string, string> = {
  recebimento: '/instalacao#webhook',
  tag: '/instalacao#tag',
};

/** Unica ancora de conteudo que sobrevive a traducao do hash. */
const ANCORA_HISTORICO = 'historico';

function abaDoHashLegado(hash: string): IntegrationTab | null {
  return HASH_LEGADO[hash.replace(/^#/, '')] ?? null;
}

/**
 * O hash como fonte externa, lido por `useSyncExternalStore`. Duas razoes para
 * nao ser `useState` + efeito: no servidor o hash nao existe (o snapshot de
 * servidor e string vazia, e a hidratacao nao acusa divergencia), e o valor em
 * cache so e invalidado por `hashchange`/`popstate` — nunca pelo nosso proprio
 * `replaceState` de limpeza. Se o cache reagisse a limpeza, a aba escolhida
 * pelo link antigo sumiria no intervalo entre apagar o hash e o roteador
 * publicar o `?aba=` equivalente.
 */
let hashEmCache: string | null = null;

function lerHash(): string {
  if (hashEmCache === null) hashEmCache = window.location.hash;
  return hashEmCache;
}

function lerHashNoServidor(): string {
  return '';
}

function assinarHash(aoMudar: () => void): () => void {
  const sincronizar = () => {
    hashEmCache = window.location.hash;
    aoMudar();
  };
  window.addEventListener('hashchange', sincronizar);
  window.addEventListener('popstate', sincronizar);
  return () => {
    window.removeEventListener('hashchange', sincronizar);
    window.removeEventListener('popstate', sincronizar);
  };
}

/** Id de destino de retorno. Fora do componente: o relogio e impuro e o corpo
 *  de um componente precisa ser idempotente (react-hooks/purity). */
function novoIdDeDestino(): string {
  return `dest_${Date.now().toString(36)}`;
}

type Regras = Integracoes['regras'];

/** Mesma lista de regras, campo a campo. */
function mesmasRegras(a: Regras, b: Regras): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * C5 (T11) — o motivo que o servidor deu, para a descrição do toast de erro.
 *
 * Quando o servidor responde `erro` E `erros`, o `pedir` põe em
 * `ErroApi.message` só a frase geral ("Não foi possível salvar as regras —
 * nada foi alterado.") e a lista que diz O QUE está errado ("regra r_x: o
 * Pixel 123 é de outra empresa") fica em `dados.erros`. Sem a lista, o
 * operador sabia que falhou, mas não o que corrigir.
 */
function motivoDoErro(e: unknown): string {
  if (e instanceof ErroApi) {
    const dados = e.dados as { erros?: unknown } | undefined;
    const lista = Array.isArray(dados?.erros) ? dados.erros.map(String).filter(Boolean) : [];
    return lista.length > 0 ? lista.join(' · ') : e.message;
  }
  return e instanceof Error && e.message ? e.message : 'Erro desconhecido.';
}

export function IntegrationsPage({
  empresaId,
  inicial,
}: {
  /** Empresa cujos dados vieram em `inicial` (a página remonta por ela). Vai no
   *  corpo do PUT (o servidor recusa com 409 se a ativa já for outra) e no
   *  header `X-Empresa-Id` das leituras e do teste de destino: esta tela só
   *  lê e testa a empresa dela. */
  empresaId: string;
  inicial: { integracoes: Integracoes; entregas: Entrega[] };
}) {
  // Os dados chegam prontos do Server Component: sem efeito de mount, sem
  // primeiro paint vazio. `carregar` fica so para o botao de atualizar.
  const [cfg, setCfg] = useState<Integracoes>(inicial.integracoes);
  const [entregas, setEntregas] = useState<Entrega[]>(inicial.entregas);
  const [salvando, setSalvando] = useState(false);

  // C2 (T6): o que está no disco, para saber se a tela tem rascunho. Com
  // rascunho, a troca de empresa feita em OUTRA aba não recarrega esta tela
  // sozinha: o seletor avisa e oferece "Recarregar agora".
  const [salvo, setSalvo] = useState<Integracoes>(inicial.integracoes);
  const rascunho = cfg !== salvo && JSON.stringify(cfg) !== JSON.stringify(salvo);

  /**
   * 🔴 C5 (T10) — o rascunho das regras mora FORA de `cfg`.
   *
   * Antes a edição da aba Regras ia direto para `cfg`, e todo "Salvar" desta
   * tela manda `cfg`: salvar um e-mail em Testes da equipe, ligar um destino
   * de retorno ou sair do campo de URL gravava junto a regra que o operador
   * ainda estava editando — uma regra automática pela metade passava a mandar
   * venda para a Meta sem ninguém ter clicado em "Salvar regras".
   *
   * Agora `cfg.regras` é sempre o que está GRAVADO (muda só no sucesso de
   * `salvarRegras` e no `carregar`), e o que a aba mostra é o rascunho.
   * `null` = sem rascunho: a aba mostra as regras gravadas e acompanha o
   * `carregar()`; com rascunho, o `carregar()` ("Atualizar", "Testar destino")
   * troca as gravadas e o rascunho fica.
   */
  const [regrasRascunho, setRegrasRascunho] = useState<Regras | null>(null);
  const regrasNaTela = regrasRascunho ?? cfg.regras ?? [];
  const regrasSujas =
    regrasRascunho !== null && !mesmasRegras(regrasRascunho, cfg.regras ?? []);

  // Regra não salva também é rascunho para o aviso da troca de empresa vinda
  // de outra aba (C2): sem isto, a tela recarregaria sozinha por cima dela.
  useEffect(() => {
    const { marcarRascunho } = useEmpresaStore.getState();
    marcarRascunho(rascunho || regrasSujas);
    return () => marcarRascunho(false);
  }, [rascunho, regrasSujas]);

  // Fechar ou recarregar a aba do navegador com regra não salva pede
  // confirmação. A navegação interna do console não passa por aqui; para ela
  // vale o aviso na própria aba Regras.
  useEffect(() => {
    if (!regrasSujas) return;
    const segurar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = '';
    };
    window.addEventListener('beforeunload', segurar);
    return () => window.removeEventListener('beforeunload', segurar);
  }, [regrasSujas]);

  // So para batizar o destino novo com o nome de quem o esta criando.
  const empresaAtiva = useEmpresaStore((s) => s.ativa());

  // A aba ativa mora na URL, nao em estado local (IA-R3): `?aba=regras` abre
  // Regras direto, inclusive em aba nova do navegador e ja no HTML que vem do
  // servidor. O hash antigo entra como segunda opcao e nunca ganha do `?aba=`.
  // Filtro e busca continuam FORA da URL de proposito (IA-R5): sao efemeros e
  // so poluiriam o historico.
  const parametros = useSearchParams();
  const router = useRouter();
  const hash = useSyncExternalStore(assinarHash, lerHash, lerHashNoServidor);
  const aba: IntegrationTab =
    abaDaConsulta(parametros.get('aba')) ?? abaDoHashLegado(hash) ?? ABA_PADRAO;

  /**
   * Troca de aba REESCREVE a entrada atual do historico em vez de empilhar uma
   * nova. Com `pushState`, sete cliques em aba deixariam sete entradas entre o
   * operador e a tela de onde ele veio, e o "voltar" do navegador viraria um
   * "desfazer clique de aba" — o caminho de volta fica inutilizavel. Aba e
   * ponto de vista, nao destino; a URL continua copiavel e compartilhavel, que
   * era o objetivo de tirar isto do hash.
   *
   * `window.history.replaceState` e nao `router.replace` porque a rota e
   * `force-dynamic`: uma navegacao do roteador releria a configuracao inteira
   * no servidor a cada clique. O Next reflete o replaceState nativo em
   * `useSearchParams`.
   */
  const selecionarAba = (value: IntegrationTab) => {
    const novos = new URLSearchParams(parametros.toString());
    novos.set('aba', value);
    window.history.replaceState(null, '', `?${novos.toString()}`);
  };

  // As duas abas que viraram `/instalacao` precisam LEVAR o visitante para la,
  // e nao apenas cair no padrao: quem abriu `?aba=tag` queria a tag do site, e
  // aterrissar calado na caixa de entrada e pior do que um 404 — parece que o
  // recurso sumiu. `useRef` porque `router.replace` remonta esta tela: sem a
  // trava, o efeito reentraria e o historico viraria um laco.
  const jaRedirecionou = useRef(false);
  useEffect(() => {
    if (jaRedirecionou.current) return;
    const daConsulta = parametros.get('aba') ?? '';
    const doHash = window.location.hash.replace(/^#/, '');
    const destino = ROTA_LEGADA[daConsulta] ?? ROTA_LEGADA[doHash];
    if (!destino) return;
    jaRedirecionou.current = true;
    router.replace(destino);
  }, [parametros, router]);

  // Traduz o hash antigo em `?aba=` uma unica vez, por higiene da URL — quem ja
  // mostrou a aba certa foi a derivacao acima, entao esta limpeza nunca pode
  // ser o que faz o link antigo funcionar.
  const hashJaTraduzido = useRef(false);
  useEffect(() => {
    if (hashJaTraduzido.current) return;
    const legado = abaDoHashLegado(window.location.hash);
    const jaTemConsulta = new URLSearchParams(window.location.search).has('aba');
    if (!legado || jaTemConsulta) return;
    hashJaTraduzido.current = true;
    const ehAncora = window.location.hash.replace(/^#/, '') === ANCORA_HISTORICO;
    const novos = new URLSearchParams(window.location.search);
    novos.set('aba', legado);
    window.history.replaceState(
      null,
      '',
      `?${novos.toString()}${ehAncora ? `#${ANCORA_HISTORICO}` : ''}`
    );
  }, []);

  // `#historico` continua rolando ate a secao — so que agora como ancora de
  // conteudo dentro de Retornos. O painel so existe depois de a aba virar, por
  // isso o efeito depende de `aba` e nao roda so na montagem.
  const historicoJaRolado = useRef(false);
  useEffect(() => {
    if (historicoJaRolado.current || aba !== 'retornos') return;
    if (window.location.hash.replace(/^#/, '') !== ANCORA_HISTORICO) return;
    const alvo = document.getElementById(ANCORA_HISTORICO);
    if (!alvo) return;
    historicoJaRolado.current = true;
    alvo.scrollIntoView({ block: 'start' });
  }, [aba]);

  // Em tela estreita as cinco abas passam da largura e a faixa rola na
  // horizontal — nenhuma aba e escondida. Se a aba ativa veio da URL, ela pode
  // nascer fora do campo de visao: entao a FAIXA rola ate mostra-la, nunca a
  // pagina.
  const faixaDeAbas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const caixa = faixaDeAbas.current;
    const alvo = caixa?.querySelector<HTMLElement>(
      '[data-slot="tabs-trigger"][data-active]'
    );
    if (!caixa || !alvo) return;
    const folga = 12;
    const limites = caixa.getBoundingClientRect();
    const item = alvo.getBoundingClientRect();
    if (item.left < limites.left + folga) {
      caixa.scrollLeft -= limites.left + folga - item.left;
    } else if (item.right > limites.right - folga) {
      caixa.scrollLeft += item.right - (limites.right - folga);
    }
  }, [aba]);

  /**
   * C2 (T6), revisão rodada 2 — as leituras dizem a empresa da TELA no header,
   * como as escritas. Outra aba troca para B com rascunho aberto aqui: o store
   * desta aba vai para B e esta instância continua com a `key` de A. Sem o
   * header, um "Atualizar" (ou o `carregar()` do erro de salvar e do teste de
   * destino) relia pelo store e punha a config de B aqui dentro. Se a empresa
   * depois voltasse para A, a `key` era a mesma, nada remontava, e o PUT
   * seguinte gravava a config de B no arquivo de A com o `empresaId` certo. O
   * `pedir` respeita header explícito e o GET resolve header → cookie.
   *
   * C5: não mexe no rascunho das regras (ver `regrasRascunho`) e devolve se a
   * leitura deu certo, para o "Descartar e recarregar" só descartar depois de
   * ter o que pôr no lugar.
   */
  const carregar = useCallback(async (): Promise<boolean> => {
    try {
      const [a, b] = await Promise.all([
        pedir<{ integracoes: Integracoes }>('/api/integracoes', {
          cache: 'no-store',
          headers: { 'X-Empresa-Id': empresaId },
        }),
        pedir<{ entregas?: Entrega[] }>('/api/relay', {
          cache: 'no-store',
          headers: { 'X-Empresa-Id': empresaId },
        }),
      ]);
      setCfg(a.integracoes);
      setSalvo(a.integracoes);
      setEntregas(b.entregas ?? []);
      return true;
    } catch (e) {
      if (e instanceof SessaoExpirada) return false;
      /* servidor pode estar reiniciando */
      return false;
    }
  }, [empresaId]);

  /**
   * C5 (T11) — o único caminho que joga fora o que foi digitado, e só por
   * clique. Relê o disco desta empresa e, se a leitura deu certo, descarta
   * também o rascunho das regras.
   */
  const descartarERecarregar = async () => {
    if (await carregar()) {
      setRegrasRascunho(null);
      toast.info('Alterações descartadas.', {
        description: 'A tela mostra agora o que está salvo.',
      });
    } else {
      toast.error('Não foi possível recarregar.', {
        description: 'Nada foi descartado. Tente de novo em instantes.',
      });
    }
  };

  /**
   * 🔴 C5 (T11) — erro ao salvar: diz o motivo e NÃO apaga nada.
   *
   * Antes o `catch` mostrava só "Não foi possível salvar." e chamava
   * `carregar()`, que relia o disco por cima do que tinha sido digitado: o
   * operador perdia o trabalho sem saber por quê. Agora o toast leva o motivo
   * do servidor, o formulário fica como estava e recarregar é um botão.
   *
   * 409 = os dados desta tela são de uma empresa que já não é a ativa (outra
   * aba trocou). Reler o disco daqui não resolve — o próximo Salvar daria 409
   * de novo —, então o botão é "Recarregar agora": o `router.refresh()` faz a
   * página de servidor ler o cookie e remontar esta tela pela `key` da empresa
   * ativa, o mesmo do aviso do seletor de empresa.
   */
  const avisarErroAoSalvar = (titulo: string, e: unknown) => {
    const empresaMudou = e instanceof ErroApi && e.status === 409;
    toast.error(titulo, {
      description: `${motivoDoErro(e)} O que você digitou continua na tela.`,
      duration: 12_000,
      action: empresaMudou
        ? { label: 'Recarregar agora', onClick: () => router.refresh() }
        : { label: 'Descartar e recarregar', onClick: () => void descartarERecarregar() },
    });
  };

  /**
   * Acrescenta um destino de retorno. Extraido do `onClick` do cabecalho porque
   * o EstadoVazio precisa oferecer exatamente a MESMA acao (C-11): duas copias
   * do mesmo corpo divergiriam no primeiro ajuste.
   */
  const novoDestino = async () => {
    const id = novoIdDeDestino();
    const nomeEmpresa = empresaAtiva?.nome?.trim();
    await salvar({
      ...cfg,
      saida: [
        ...cfg.saida,
        {
          id,
          // 🔴 Nome e URL saem da empresa ativa, e a URL nasce VAZIA. Antes os
          // dois eram literais do n8n de um cliente especifico: num console com
          // mais de uma empresa, o destino novo da empresa B nascia apontando
          // para o n8n da empresa A — e bastava alguem ligar o Ativo para os
          // retornos de B irem parar no fluxo de A. Nao ha URL padrao possivel
          // aqui: so o operador sabe qual e a desta empresa.
          nome: nomeEmpresa ? `n8n — ${nomeEmpresa}` : 'Endereço de repasse',
          url: '',
          headers: {},
          eventos: ['dispatch.success', 'dispatch.error'],
          ativo: false,
        },
      ],
    });
  };

  /**
   * O "Salvar" das outras abas (Testes da equipe, Retornos). 🔴 C5 (T10):
   * regras NÃO viajam por aqui — só `salvarRegras` as grava. `cfg.regras`
   * continua o que está gravado mesmo que um chamador mande outra coisa.
   */
  const salvar = async (novo: Integracoes) => {
    setSalvando(true);
    setCfg((atual) => ({ ...novo, regras: atual.regras }));

    // 🔴 Destino sem URL fica NA TELA e fora do disco. O esquema do servidor
    // exige URL http(s) — e o destino novo nasce vazio de proposito, porque so
    // o operador sabe qual e a desta empresa. Mandar o destino pela metade
    // faria TODA gravacao desta pagina responder 400 enquanto ele nao colasse o
    // endereco, inclusive as gravacoes de regra e de dominio da tag, que nao
    // tem nada a ver com retornos.
    const pendentes = novo.saida.filter((d) => !d.url.trim());
    const paraGravar: Integracoes =
      pendentes.length > 0
        ? { ...novo, saida: novo.saida.filter((d) => d.url.trim()) }
        : novo;

    // 🔴 C5 (T10) — o corpo vai SEM `regras`. O servidor trata o campo ausente
    // como "não mexi" (`api/integracoes/route.ts`, o mesmo contrato de `saida`
    // e `testes`), então nada que esteja no rascunho da aba Regras — nem as
    // regras gravadas, reenviadas por cima de uma edição feita em outra aba do
    // navegador — vai ao disco por este botão.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { regras: _regras, ...semRegras } = paraGravar;

    try {
      await pedir('/api/integracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...semRegras, empresaId }),
      });
      // Destino sem URL fica fora de `salvo`: ele continua sendo rascunho. As
      // regras de `salvo` são as gravadas, que este PUT não tocou.
      setSalvo((atual) => ({ ...semRegras, regras: atual.regras }));
      // O que NAO foi salvo e dito em voz alta: um destino que some na proxima
      // recarga sem ninguem avisar e a definicao de tela que mente.
      toast.success(
        'Alterações salvas.',
        pendentes.length > 0
          ? {
              description:
                pendentes.length === 1
                  ? 'Um endereço de repasse ainda está sem URL e não foi salvo.'
                  : `${pendentes.length} endereços de repasse ainda estão sem URL e não foram salvos.`,
            }
          : undefined
      );
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      avisarErroAoSalvar('Não foi possível salvar.', e);
    } finally {
      setSalvando(false);
    }
  };

  /**
   * 🔴 C5 (T10) — o ÚNICO caminho que grava regras: o botão "Salvar regras".
   * O corpo é `{ regras, empresaId }` e nada mais; o servidor mescla sobre o
   * disco, então destinos, testes, tag e apelido ficam como estão.
   */
  const salvarRegras = async (regras: Regras) => {
    setSalvando(true);
    try {
      const resposta = await pedir<{ integracoes?: Integracoes }>('/api/integracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regras, empresaId }),
      });
      // O que o servidor gravou (validado e podado), não o que foi mandado.
      const gravadas = resposta.integracoes?.regras ?? regras;
      setCfg((atual) => ({ ...atual, regras: gravadas }));
      setSalvo((atual) => ({ ...atual, regras: gravadas }));
      // Se o operador mexeu de novo enquanto o PUT viajava, o rascunho novo
      // fica: só some o rascunho que foi exatamente o gravado.
      setRegrasRascunho((atual) => (atual === regras ? null : atual));
      toast.success('Regras salvas.');
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      avisarErroAoSalvar('Não foi possível salvar as regras.', e);
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Os quatro gestos do Repasse (V7: o painel foi para `Repasse.tsx`, os
   * gestos ficaram aqui, com o mesmo ritmo de antes). Ativo e "Enviar quando"
   * gravam na hora; remover grava na hora; Nome e URL só mudam a tela enquanto
   * se digita e gravam ao sair do campo. Tudo pelo `salvar()` desta página.
   */
  const editarDestino = (id: string, mudanca: Partial<Destino>) => {
    setCfg({
      ...cfg,
      saida: cfg.saida.map((d) => (d.id === id ? { ...d, ...mudanca } : d)),
    });
  };
  const gravarDestino = (id: string, mudanca: Partial<Destino>) => {
    void salvar({
      ...cfg,
      saida: cfg.saida.map((d) => (d.id === id ? { ...d, ...mudanca } : d)),
    });
  };
  const removerDestino = (id: string) => {
    void salvar({ ...cfg, saida: cfg.saida.filter((x) => x.id !== id) });
  };
  const gravarDestinos = () => {
    void salvar(cfg);
  };

  // O ping vai para o destino que ESTA tela lista (a empresa dela, no header):
  // pelo store, com outra aba já em outra empresa, o servidor procuraria o id
  // nos destinos da outra e responderia "Destino não encontrado".
  const testarDestino = async (id: string) => {
    toast.info('Enviando ping…');
    try {
      const d = await pedir<{ entrega?: Entrega }>('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Empresa-Id': empresaId },
        body: JSON.stringify({ destinoId: id }),
      });
      const e: Entrega | undefined = d.entrega;
      if (e?.ok) {
        toast.success(`O endereço respondeu ${e.httpStatus}`, {
          description: `${e.duracaoMs} ms · ${e.tentativas} tentativa(s)`,
        });
      } else {
        toast.error('O endereço não respondeu', {
          description: e?.erro ?? 'Sem resposta após 3 tentativas.',
        });
      }
    } catch (e) {
      if (e instanceof SessaoExpirada) return;
      toast.error('Falha ao testar o endereço.', {
        description: e instanceof Error ? e.message : 'Erro desconhecido.',
      });
    }
    void carregar();
  };

  return (
    <div className="min-w-0">
      {/* A trava do Pixel, no topo da tela que fala de automatico. A trava da
          REGRA continua na aba Regras — a chave so mostra a contagem dela, e
          por isso recebe `cfg.regras`: desde a C5 sao as regras GRAVADAS, as
          que valem para o servidor, e nao o rascunho que a aba Regras edita. */}
      <div className="mb-6 min-w-0">
        <ChaveDoAutomatico
          regras={cfg.regras ?? []}
          onIrParaRegras={() => selecionarAba('regras')}
        />
      </div>
      <IntegrationFlow onNavigate={selecionarAba} />
      <Tabs
        value={aba}
        onValueChange={(value) => value && selecionarAba(value as IntegrationTab)}
        className="mt-6 min-w-0 gap-5"
      >
        <div
          ref={faixaDeAbas}
          className="max-w-full overflow-x-auto rounded-panel border border-line-strong bg-surface-1 p-1.5"
        >
          {/* Os grupos sao divisoria visual (P6, proximidade) e nao semantica:
              `role="presentation"` mantem a `tablist` com abas como unicos
              filhos reconhecidos, e cada aba aponta o rotulo do seu grupo por
              `aria-describedby` — quem usa leitor de tela ouve "Recebimento,
              O que entra", e nao uma lista plana de cinco nomes soltos. */}
          <TabsList
            aria-label="Seções da aba Regras"
            className="h-auto w-max min-w-full items-stretch gap-2 bg-transparent p-0"
          >
            {GRUPOS.map((grupo, indice) => (
              <div
                key={grupo.id}
                role="presentation"
                className={cn(
                  'flex min-w-0 flex-col gap-1 px-1',
                  indice > 0 && 'border-l border-line pl-3'
                )}
              >
                <span
                  id={`grupo-${grupo.id}`}
                  className="px-1 text-caption font-semibold tracking-wide text-fg-muted uppercase"
                >
                  {grupo.label}
                </span>
                <div role="presentation" className="flex items-center gap-1">
                  {grupo.abas.map((item) => {
                    const Icon = item.icon;
                    const count =
                      item.value === 'regras'
                        ? regrasNaTela.length
                        : item.value === 'retornos'
                          ? cfg.saida.length
                          : item.value === 'testes'
                            ? // Os dois somados: para quem olha a aba, a
                              // pergunta é "quantas pessoas estão barradas",
                              // e não por qual dos dois campos cada uma entrou.
                              (cfg.testes?.emails?.length ?? 0) +
                              (cfg.testes?.nomes?.length ?? 0)
                            : undefined;
                    return (
                      <TabsTrigger
                        key={item.value}
                        value={item.value}
                        aria-describedby={`grupo-${grupo.id}`}
                        className="h-11 gap-2 rounded-control px-4 text-label data-active:border-line-control data-active:bg-surface-3 data-active:text-fg-strong"
                      >
                        <Icon className="size-[18px]" aria-hidden />
                        {item.label}
                        {count !== undefined && (
                          <Badge className="font-mono tabular">{count}</Badge>
                        )}
                        {/* C5: de qualquer aba se vê que há regra sem salvar
                            (quem salva um teste não leva a regra junto). */}
                        {item.value === 'regras' && regrasSujas && (
                          <span
                            className="size-2 shrink-0 rounded-full bg-warning"
                            title="Regras alteradas, não salvas"
                          >
                            <span className="sr-only">Regras alteradas, não salvas</span>
                          </span>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsList>
        </div>

        <TabsContent value="inbox" className="min-w-0 outline-none">
          <div className="flex min-w-0 flex-col gap-5">
            {/* Este painel vivia na aba Recebimento, que virou `/instalacao`. Ele
                NAO foi junto: a pergunta que ele responde — "por que este evento
                parou aqui em vez de ir para a Meta?" — so aparece olhando a
                caixa de entrada. Em `/instalacao` seria um aviso sobre uma tela
                que o operador ainda nem abriu. */}
            <Panel title="Modo de recebimento" icon={Inbox}>
              <p className="text-caption text-fg-muted">
                Quem decide o que acontece com cada webhook é a tabela de{' '}
                <strong className="text-fg-body">regras</strong>{' '}
                (aba Regras). Um evento sem regra própria fica na fila.
              </p>

              <Callout tone="warning" icon={ShieldAlert} className="mt-3">
                Eventos de teste da plataforma (<code className="font-mono">lead@example.com</code>,{' '}
                <code className="font-mono">evt_preview…</code>, cupons de R$ 0,01)
                são barrados antes da Meta, mesmo em modo automático. O e-mail pessoal que a equipe
                usa para testar o checkout, o console não adivinha — esse se cadastra em{' '}
                <strong className="text-fg-body">Teste interno</strong>.
              </Callout>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => selecionarAba('regras')}>
                  <GitBranch className="size-4" aria-hidden />
                  Ver regras
                </Button>
                <Button variant="outline" onClick={() => selecionarAba('testes')}>
                  <FlaskConical className="size-4" aria-hidden />
                  Teste interno
                </Button>
                <Link
                  href="/instalacao#webhook"
                  className={buttonVariants({ variant: 'ghost' })}
                >
                  <Plug className="size-4" aria-hidden />
                  Onde a URL do webhook é gerada
                </Link>
              </div>
            </Panel>

            <Section
              id="inbox"
              icon={Inbox}
              variant="card"
              title="Fila"
              description="Eventos recebidos das plataformas. Carregue no formulário para revisar ou use Enviar agora."
            >
              <InboxList />
            </Section>
          </div>
        </TabsContent>

      {/* ---------------------------------------------------------- */}
        <TabsContent value="regras" className="min-w-0 outline-none">
      <Section
        icon={GitBranch}
        variant="card"
        title="Regras"
        description="Para cada evento da plataforma: qual evento vira na Meta, para quais Pixels vai e se sai sozinho ou espera revisão."
      >
        {/* C5 (T10): a aba edita o rascunho e só "Salvar regras" grava.
            Voltar ao que está gravado apaga o rascunho, para o aviso de "não
            salvas" não ficar aceso sem diferença nenhuma. */}
        <RulesSection
          regras={regrasNaTela}
          onChange={(regras) =>
            setRegrasRascunho(mesmasRegras(regras, cfg.regras ?? []) ? null : regras)
          }
          onSalvar={salvarRegras}
          onDescartar={() => {
            const anterior = regrasRascunho;
            setRegrasRascunho(null);
            toast.info('Alterações das regras descartadas.', {
              description: 'As regras voltaram ao que está salvo.',
              action: anterior
                ? { label: 'Desfazer', onClick: () => setRegrasRascunho(anterior) }
                : undefined,
            });
          }}
          sujas={regrasSujas}
          salvando={salvando}
        />
      </Section>
        </TabsContent>

      {/* ---------------------------------------------------------- */}
        <TabsContent value="testes" className="min-w-0 outline-none">
      <Section
        icon={FlaskConical}
        variant="card"
        title="Teste interno"
        description="Quem da equipe bate no checkout para testar. O que casa com esta lista nunca chega à Meta."
      >
        {/* 🔴 A gravação passa pelo MESMO `salvar` das outras abas, e manda a
            configuração inteira MENOS as regras (C5: regras só pelo "Salvar
            regras"). Um PUT só com `testes` funcionaria — o servidor mescla
            sobre o disco —, mas duas rotas de gravação para o mesmo arquivo é
            como se perde um campo no dia em que uma delas esquecer de
            reenviar algo. */}
        <ListaDeTestes
          testes={cfg.testes}
          onSalvar={(testes: ListaDeTeste) => void salvar({ ...cfg, testes })}
          salvando={salvando}
        />
      </Section>
        </TabsContent>

      {/* ---------------------------------------------------------- */}
        <TabsContent value="retornos" className="min-w-0 outline-none">
          {/* V7: o painel inteiro mora em `Repasse.tsx`, que só desenha. Toda
              gravação continua aqui, pelo mesmo `salvar()` (C5: sem regras) e
              pelo mesmo `testarDestino()`. O `id="repasse"` vai no <Repasse>,
              não no TabsContent: o base-ui usa o id do painel no
              `aria-controls` da aba, e um id nosso ali o quebraria. */}
          <Repasse
            id="repasse"
            destinos={cfg.saida}
            entregas={entregas}
            salvando={salvando}
            ancoraHistorico={ANCORA_HISTORICO}
            onNovo={() => void novoDestino()}
            onTestar={(id) => void testarDestino(id)}
            onEditar={editarDestino}
            onGravar={gravarDestino}
            onRemover={removerDestino}
            onGravarCampos={gravarDestinos}
            onAtualizar={() => void carregar()}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}

export default IntegrationsPage;
