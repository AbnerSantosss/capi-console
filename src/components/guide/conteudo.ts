/**
 * Conteudo do Guia — fonte unica.
 *
 * Este modulo e so dado: nenhum JSX, nenhum estilo. A pagina /guia monta a
 * interface a partir daqui. Os textos tecnicos foram conferidos contra o
 * codigo (parser, config-store, auto-dispatch, meta-capi) — nao os reescreva
 * sem reconferir.
 *
 * Marcacao aceita nos textos: `trecho entre crases` vira <code>. Ver
 * RichText em ./RichText.tsx.
 */

import type { Icon } from '@phosphor-icons/react';
import {
  ChartBarIcon,
  ClockCountdownIcon,
  CopyIcon,
  CursorClickIcon,
  DownloadSimpleIcon,
  FlaskIcon,
  GaugeIcon,
  LightningIcon,
  LockKeyIcon,
  MapTrifoldIcon,
  PaperPlaneTiltIcon,
  ReceiptIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  TargetIcon,
} from '@phosphor-icons/react';

/** Matiz de identificacao do topico. So fundo, icone e linha — nunca texto. */
export type Hue = 'manual' | 'auto' | 'dados' | 'qualidade' | 'regras';

/** Textura da capa do card. Implementada em TopicBackdrop.tsx. */
export type Textura = 'pontos' | 'fluxo' | 'grade-marcada' | 'barras' | 'listras';

export interface ItemGuia {
  id: string;
  titulo: string;
  /** Ate ~60 caracteres. Fica visivel com a linha fechada. */
  resumo: string;
  icone: Icon;
  /** O que a etapa faz. */
  oQue: string;
  /** Onde na interface. Opcional (as regras da Meta nao tem "onde"). */
  onde?: string;
  /** Armadilha conhecida. Opcional. */
  erro?: string;
}

export interface Topico {
  /** Ancora da URL: /guia#<id>. */
  id: string;
  hue: Hue;
  textura: Textura;
  icone: Icon;
  titulo: string;
  /** Uma linha, visivel com o card fechado. */
  frase: string;
  /** Ex.: "5 passos". Visivel com o card fechado. */
  contador: string;
  /** Rotulo curto para o indice. */
  indice: string;
  paraQue: string;
  quandoUsar: string;
  saiSabendo: string;
  /** Passos numerados (1,2,3...) ou itens com icone. */
  numerado: boolean;
  itens: ItemGuia[];
  /** Conteudo especial renderizado depois dos itens. */
  extra?: 'tabela-emq' | 'regra-de-ouro' | 'ordem-webhook';
}

/* ------------------------------------------------------------------ */
/* Os dois caminhos                                                    */
/* ------------------------------------------------------------------ */

export interface Caminho {
  id: 'manual' | 'auto';
  hue: Hue;
  icone: Icon;
  eyebrow: string;
  titulo: string;
  definicao: string;
  quandoUsar: string;
  quemAperta: string;
  cta: { rotulo: string; href: string };
}

export const CAMINHOS: Caminho[] = [
  {
    id: 'manual',
    hue: 'manual',
    icone: CursorClickIcon,
    eyebrow: 'Caminho 1',
    titulo: 'Disparo manual',
    definicao:
      'Você monta o evento no formulário, ou carrega um da caixa de entrada, confere e envia.',
    quandoUsar:
      'Venda no PIX que o pixel do navegador perdeu, correção pontual, teste de um pixel novo.',
    quemAperta: 'Você aperta o botão, sempre.',
    cta: { rotulo: 'Ir para o disparo manual', href: '/' },
  },
  {
    id: 'auto',
    hue: 'auto',
    icone: LightningIcon,
    eyebrow: 'Caminho 2',
    titulo: 'Disparo automático',
    definicao:
      'O xWinner manda o webhook, a regra escolhe o evento da Meta e o app envia sozinho.',
    quandoUsar:
      'Depois de um disparo manual bem-sucedido e da conferência no Testar eventos.',
    quemAperta: 'Ninguém aperta nada. Por isso a rede de segurança importa.',
    cta: { rotulo: 'Ver as regras', href: '/integracoes#regras' },
  },
];

/* ------------------------------------------------------------------ */
/* Topicos                                                             */
/* ------------------------------------------------------------------ */

export const TOPICOS: Topico[] = [
  {
    id: 'como-usar',
    hue: 'manual',
    textura: 'pontos',
    icone: CursorClickIcon,
    titulo: 'Disparo manual em 5 passos',
    frase: 'Sempre na mesma ordem. Você confere tudo antes de enviar.',
    contador: '5 passos',
    indice: 'Manual',
    paraQue: 'Recuperar uma venda que o pixel do navegador não registrou.',
    quandoUsar:
      'Venda no PIX fora da janela do pixel, correção pontual, estreia de um pixel novo.',
    saiSabendo:
      'Disparar um `Purchase` com nota de qualidade acima de 8 e `events_received: 1` na resposta.',
    numerado: true,
    itens: [
      {
        id: 'pixel',
        titulo: 'Escolha o pixel de destino',
        resumo: 'Confira para onde vai e se está em teste.',
        icone: TargetIcon,
        oQue:
          'Veja para qual Pixel o evento vai e se está em teste ou em produção.',
        onde: 'Selo com a seta no topo da tela, ou o botão Trocar pixel, no passo 4.',
        erro:
          'Disparar em produção achando que estava em teste. O selo âmbar "Produção" significa que o evento entra nas métricas reais.',
      },
      {
        id: 'dados',
        titulo: 'Carregue os dados',
        resumo: 'Da caixa de entrada, do JSON colado ou à mão.',
        icone: DownloadSimpleIcon,
        oQue:
          'Use Carregar no formulário num evento da caixa de entrada, cole o JSON, ou preencha os campos à mão. Carregar não envia nada — só preenche.',
        onde: 'Passo 1, De onde vem o evento.',
        erro:
          'Colar só os dados do cliente e esquecer a URL com o `fbclid`. Sem ela não há atribuição ao criativo.',
      },
      {
        id: 'qualidade',
        titulo: 'Leia a qualidade',
        resumo: 'Nota de 0 a 10 e o que está faltando.',
        icone: ChartBarIcon,
        oQue:
          'O painel mostra a nota de 0 a 10 e quais dos 9 parâmetros estão faltando.',
        onde: 'Painel Qualidade do evento, no passo 4.',
        erro:
          'Ignorar a nota. Abaixo de 5.0 a Meta tem dificuldade para casar a conversão com um perfil.',
      },
      {
        id: 'disparar',
        titulo: 'Dispare',
        resumo: 'Em produção aparece uma confirmação antes.',
        icone: PaperPlaneTiltIcon,
        oQue:
          'Em produção aparece uma confirmação com o resumo do que vai ser enviado.',
        onde: 'Botão Disparar evento.',
        erro:
          'Passar pela confirmação no automático. Ela existe para você reler o Pixel e o valor.',
      },
      {
        id: 'resultado',
        titulo: 'Leia o resultado',
        resumo: 'HTTP 200 não basta: confira events_received.',
        icone: ReceiptIcon,
        oQue:
          'Confirme `events_received` igual a 1, guarde o `fbtrace_id` e abra o criativo que converteu.',
        onde: 'Painel que aparece no topo da coluna.',
        erro:
          'Assumir que HTTP 200 basta. Se `events_received` vier 0, a Meta não registrou nada.',
      },
    ],
  },

  {
    id: 'webhook-automatico',
    hue: 'auto',
    textura: 'fluxo',
    icone: LightningIcon,
    titulo: 'Disparo automático em 6 passos',
    frase: 'Ligar o recebimento direto do xWinner, sem copiar e colar.',
    contador: '6 passos',
    indice: 'Automático',
    paraQue:
      'Parar de digitar: o xWinner avisa, a regra decide e o app envia sozinho.',
    quandoUsar:
      'Depois de ao menos um disparo manual bem-sucedido e conferido no Testar eventos.',
    saiSabendo:
      'Ligar o automático no `Purchase` com rede de segurança, e como desligar.',
    numerado: true,
    extra: 'ordem-webhook',
    itens: [
      {
        id: 'url',
        titulo: 'Copiar a URL de recebimento',
        resumo: 'A URL traz o segredo. Trate como senha.',
        icone: MapTrifoldIcon,
        oQue:
          'A URL já vem com o segredo no caminho. Quem tiver essa URL consegue inserir eventos na sua caixa de entrada — trate como senha.',
        onde: 'Integrações → aba Recebimento → "URL para o xWinner" → Copiar.',
      },
      {
        id: 'endpoint',
        titulo: 'Cadastrar o endpoint no xWinner',
        resumo: 'Assine só os eventos que viram conversão.',
        icone: TargetIcon,
        oQue:
          'Marque só os eventos que viram conversão: `precheckout_opened`, `checkout_session_opened`, `payment_generated`, `checkout_card_attempted` e `purchase_approved`. Abandono e estorno não precisam ser assinados.',
        onde: 'admin.codigovencedor.com → Integrações → Webhooks → Novo endpoint.',
      },
      {
        id: 'testar',
        titulo: 'Clicar em "Testar"',
        resumo: 'O payload de exemplo tem que dar "teste-ignorado".',
        icone: FlaskIcon,
        oQue:
          'A plataforma envia um payload de exemplo com `lead@example.com`. Ele tem que aparecer na caixa de entrada e, se você mandar disparar, o resultado tem que ser "teste-ignorado". Se aparecer "enviado", pare tudo.',
        onde: 'xWinner → botão Testar do endpoint; depois Integrações → Caixa de entrada.',
      },
      {
        id: 'venda-real',
        titulo: 'Conferir a caixa de entrada com venda real',
        resumo: 'Evento, valor e fbc de uma compra de verdade.',
        icone: ReceiptIcon,
        oQue:
          'Espere uma compra de verdade chegar. Confira o evento de origem, o evento da Meta escolhido pela regra, o valor e se veio com `fbc`.',
        onde: 'Integrações → Caixa de entrada.',
      },
      {
        id: 'ligar',
        titulo: 'Ligar o automático no Purchase — com Código de teste',
        resumo: 'Automático primeiro, mas só no Testar eventos.',
        icone: LightningIcon,
        oQue:
          'Preencha o Código de teste da marca, depois mude a regra de `purchase_approved` para Automático. A próxima compra dispara sozinha e aparece só no Testar eventos.',
        onde: 'Pixel e token → Código de teste; Integrações → aba Regras.',
      },
      {
        id: 'go-live',
        titulo: 'Limpar o Código de teste (go-live)',
        resumo: 'Só depois de ver o Purchase certo no teste.',
        icone: SealCheckIcon,
        oQue:
          'Depois de ver o `Purchase` certo no Testar eventos, apague o Código de teste. A partir daí as compras entram nas métricas reais da campanha.',
        onde: 'Pixel e token → Código de teste → salvar vazio.',
      },
    ],
  },

  {
    id: 'onde-achar',
    hue: 'dados',
    textura: 'grade-marcada',
    icone: MapTrifoldIcon,
    titulo: 'Onde achar cada dado',
    frase: 'O caminho exato dentro do Gerenciador de Eventos.',
    contador: '6 dados',
    indice: 'Onde achar',
    paraQue: 'Não perder tempo caçando campo no Gerenciador de Eventos.',
    quandoUsar: 'Na primeira configuração e sempre que trocar de pixel.',
    saiSabendo:
      'Localizar Pixel ID, token, código de teste, `fbc`, `fbp` e os IDs do anúncio.',
    numerado: false,
    itens: [
      {
        id: 'pixel-id',
        titulo: 'Pixel ID',
        resumo: 'Fontes de dados → o número fica abaixo do nome.',
        icone: TargetIcon,
        oQue:
          'Gerenciador de Eventos → Fontes de dados → selecione o Pixel → o número aparece abaixo do nome.',
      },
      {
        id: 'token',
        titulo: 'Token de acesso',
        resumo: 'Configurações do pixel → API de Conversões.',
        icone: LockKeyIcon,
        oQue:
          'Gerenciador de Eventos → seu Pixel → Configurações → role até API de Conversões → Gerar token de acesso.',
      },
      {
        id: 'codigo-teste',
        titulo: 'Código de teste',
        resumo: 'Aba Testar eventos, o TEST##### no topo.',
        icone: FlaskIcon,
        oQue:
          'Gerenciador de Eventos → seu Pixel → aba Testar eventos → o código `TEST#####` fica no topo da página.',
      },
      {
        id: 'fbc',
        titulo: 'fbc',
        resumo: 'Cookie _fbc, ou monte a partir do fbclid da URL.',
        icone: CursorClickIcon,
        oQue:
          'Cookie `_fbc` no navegador do comprador. Se não houver, monte a partir do `?fbclid=` da URL: `fb.1.<timestamp em ms>.<fbclid>`.',
      },
      {
        id: 'fbp',
        titulo: 'fbp',
        resumo: 'Cookie _fbp, criado pelo pixel no seu domínio.',
        icone: CursorClickIcon,
        oQue:
          'Cookie `_fbp`, criado pelo Pixel no seu domínio no formato `fb.1.<timestamp>.<número aleatório>`.',
      },
      {
        id: 'ad-id',
        titulo: 'ad_id e UTMs',
        resumo: 'Já vêm na event_source_url do anúncio.',
        icone: MapTrifoldIcon,
        oQue:
          'Já vêm na `event_source_url` quando o anúncio usa os parâmetros dinâmicos da Meta (`{{ad.id}}`, `{{campaign.id}}`, `{{adset.id}}`).',
      },
    ],
  },

  {
    id: 'emq',
    hue: 'qualidade',
    textura: 'barras',
    icone: GaugeIcon,
    titulo: 'Qualidade do evento',
    frase:
      'A soma ponderada dos 9 parâmetros vai de 0 a 10. Acima de 8 a atribuição ao anúncio é direta.',
    contador: '9 parâmetros',
    indice: 'Qualidade',
    paraQue: 'Entender a nota do painel e o que falta para subir.',
    quandoUsar: 'Antes de qualquer disparo com nota abaixo de 8.',
    saiSabendo: 'Qual parâmetro pesa mais e como conseguir cada um.',
    numerado: false,
    extra: 'tabela-emq',
    itens: [],
  },

  {
    id: 'regras',
    hue: 'regras',
    textura: 'listras',
    icone: ShieldCheckIcon,
    titulo: 'Regras da Meta',
    frase: 'O que a API aceita e o que ela recusa.',
    contador: '5 regras',
    indice: 'Regras',
    paraQue: 'Saber o que a API recusa antes de ser recusado por ela.',
    quandoUsar: 'Antes do primeiro disparo e em qualquer erro devolvido pela Meta.',
    saiSabendo:
      '7 dias, deduplicação por `event_id`, SHA-256, teste × produção e `events_received`.',
    numerado: false,
    extra: 'regra-de-ouro',
    itens: [
      {
        id: 'janela',
        titulo: 'Janela de 7 dias',
        resumo: 'Evento com mais de 7 dias é descartado.',
        icone: ClockCountdownIcon,
        oQue:
          'A Meta descarta qualquer evento cujo `event_time` tenha mais de 7 dias. O painel mostra quanto resta da janela.',
      },
      {
        id: 'dedup',
        titulo: 'Deduplicação',
        resumo: 'Mesmo event_id nos dois lados evita a duplicata.',
        icone: CopyIcon,
        oQue:
          'Se o Pixel do navegador e a CAPI enviarem a mesma conversão, a Meta usa o `event_id` para descartar a duplicata. Use sempre o mesmo id nos dois lados — `order_<número>` resolve.',
      },
      {
        id: 'hash',
        titulo: 'Criptografia obrigatória',
        resumo: 'E-mail, telefone, nome e CPF saem em SHA-256.',
        icone: LockKeyIcon,
        oQue:
          'E-mail, telefone, nome, sobrenome e CPF saem daqui já em SHA-256. A Meta nunca recebe o dado em claro. IP, user agent, `fbc` e `fbp` vão em texto puro, por exigência da própria API.',
      },
      {
        id: 'teste-producao',
        titulo: 'Teste e produção',
        resumo: 'Com test_event_code o evento não conta nas métricas.',
        icone: FlaskIcon,
        oQue:
          'Com `test_event_code` preenchido, o evento aparece em Testar eventos e não entra nas métricas. Sem ele, entra — e alimenta o algoritmo de otimização.',
      },
      {
        id: 'recebimento',
        titulo: 'Confirmação de recebimento',
        resumo: 'HTTP 200 sozinho não prova nada.',
        icone: SealCheckIcon,
        oQue:
          'HTTP 200 sozinho não basta. Confira `events_received: 1` na resposta. Guarde o `fbtrace_id`: é com ele que o suporte da Meta rastreia o evento.',
      },
    ],
  },
];
