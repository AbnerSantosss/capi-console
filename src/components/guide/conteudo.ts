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
  ListChecksIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  PaperPlaneTiltIcon,
  ProhibitIcon,
  QueueIcon,
  ReceiptIcon,
  SealCheckIcon,
  ShieldCheckIcon,
  TargetIcon,
} from '@phosphor-icons/react';

/** Matiz de identificacao do topico. So fundo, icone e linha — nunca texto. */
export type Hue =
  | 'manual'
  | 'auto'
  | 'conferencia'
  | 'dados'
  | 'qualidade'
  | 'regras';

/* Aqui morava o type `Textura`: seis desenhos de capa (pontos, fluxo, trilha,
   grade-marcada, barras, listras) implementados em TopicBackdrop.tsx. Os seis
   sairam na FASE 3b e o arquivo junto, porque eram desenho gerado atras de
   texto — ornamento, nao informacao.

   O que entrou no lugar nao e desenho: e um objeto fotografado de cima em
   papel creme, um por assunto, encostado a direita da faixa (`capa`, logo
   abaixo). A tinta do assunto a 8% continua sendo o FUNDO da faixa; o objeto
   so pousa em cima dela, longe do tile e do titulo, que e quem continua
   dizendo de que assunto o cartao trata. */

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
  icone: Icon;
  /**
   * Capa da faixa: o objeto do assunto em papel creme, fotografado de cima,
   * em `public/brand/guia/<id>.webp`. Fica ENCOSTADO A DIREITA da faixa; a
   * tinta do assunto continua sendo o fundo. E decoracao: entra com `alt=""`
   * e `aria-hidden` e nao repete nada que o titulo ao lado ja nao diga.
   *
   * O caminho vem escrito, e nao deduzido do `id`, porque o campo e
   * OPCIONAL: topico sem arquivo fica so com a tinta, e uma regra
   * `/brand/guia/${id}.webp` esconderia essa saida e quebraria calada no dia
   * em que um `id` mudar sem o arquivo mudar junto.
   */
  capa?: string;
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
/* Botao de atalho das tarefas e dos caminhos                          */
/* ------------------------------------------------------------------ */

/**
 * O botao que leva do Guia a tela que responde a pergunta.
 *
 * V2 (v7): as telas de trabalho moram em `/e/<slug>/<aba>`, e o slug e da
 * empresa ativa — dado estatico nao sabe qual e. Por isso o atalho guarda as
 * duas formas:
 *
 *  - `aba`: o caminho DENTRO da empresa (`/eventos?vista=fila`), que o cartao
 *    completa com o slug da empresa ativa;
 *  - `href`: o endereco antigo, usado enquanto o store ainda nao leu as
 *    empresas. O proxy o leva num salto so (307) a mesma aba da empresa ativa.
 *
 * Sem `aba`, o atalho nao depende de empresa (ex.: uma ancora do proprio Guia).
 */
export interface Atalho {
  rotulo: string;
  href: string;
  aba?: string;
}

/** O endereco do atalho: a aba da empresa ativa, ou o endereco antigo. */
export function destinoDoAtalho(atalho: Atalho, slugAtiva: string | null | undefined): string {
  if (!atalho.aba || !slugAtiva) return atalho.href;
  return `/e/${encodeURIComponent(slugAtiva)}${atalho.aba}`;
}

/* ------------------------------------------------------------------ */
/* Tarefas frequentes — o que o operador faz quase todo dia            */
/* ------------------------------------------------------------------ */

/**
 * Sao duas perguntas, e so duas, que se repetem em toda operacao. Elas vem
 * antes da explicacao dos caminhos de proposito: quem ja sabe o que quer nao
 * deveria precisar ler a teoria para achar o botao.
 *
 * Cada tarefa cabe em tres passos. Se um dia precisar de quatro, o problema
 * esta na interface, nao no texto.
 */
export interface Tarefa {
  id: string;
  hue: Hue;
  icone: Icon;
  /** A pergunta nas palavras do operador, nao nas do sistema. */
  pergunta: string;
  /** Onde mora a resposta, em uma linha. */
  resposta: string;
  /** No maximo tres. Cada um cabe em uma linha. */
  passos: string[];
  cta: Atalho;
  /** A confusao conhecida: qual tela NAO responde isso. */
  naoConfundir?: string;
}

export const TAREFAS: Tarefa[] = [
  {
    id: 'conferir-venda',
    hue: 'conferencia',
    icone: MagnifyingGlassIcon,
    pergunta: 'A venda foi para a Meta?',
    resposta:
      'A prova fica no próprio item da Fila: situação, data e nome do evento enviado.',
    passos: [
      'Abra Eventos → Fila.',
      'Ache a venda pelo e-mail, pelo valor ou pelo número do pedido.',
      'Leia a situação do item: Enviado à Meta, Na fila ou Ignorado.',
    ],
    cta: {
      rotulo: 'Abrir a Fila',
      aba: '/eventos?vista=fila',
      href: '/automatico?aba=inbox',
    },
    naoConfundir:
      'A aba Repasse não responde isso — ela conta as entregas para n8n e CRM, não os envios para a Meta.',
  },
  {
    id: 'ligar-purchase',
    hue: 'auto',
    icone: LightningIcon,
    pergunta: 'Como ligo o envio automático do Purchase?',
    resposta:
      'Primeiro o Código de teste, depois a regra. É essa ordem que segura o erro.',
    passos: [
      'Preencha o Código de teste em Pixel e token.',
      'Em Regras → aba Regras, mude `purchase_approved` de Fila para Automático.',
      'Salve e confira o selo do menu: ele sai de Desligado para "1 em teste".',
    ],
    cta: {
      rotulo: 'Ver o passo a passo completo',
      href: '/guia#webhook-automatico',
    },
    naoConfundir:
      'Sem Código de teste preenchido, a compra seguinte entra nas métricas reais da campanha.',
  },
];

/* ------------------------------------------------------------------ */
/* Os dois caminhos                                                    */
/* ------------------------------------------------------------------ */

export interface Caminho {
  id: 'manual' | 'auto';
  hue: Hue;
  icone: Icon;
  titulo: string;
  definicao: string;
  quandoUsar: string;
  quemAperta: string;
  cta: Atalho;
}

export const CAMINHOS: Caminho[] = [
  {
    id: 'manual',
    hue: 'manual',
    icone: CursorClickIcon,
    titulo: 'Envio manual',
    definicao:
      'Você monta o evento no formulário, ou carrega um da Fila, confere e envia.',
    quandoUsar:
      'Venda no PIX que o pixel do navegador perdeu, correção pontual, teste de um pixel novo.',
    quemAperta: 'Você aperta o botão, sempre.',
    // O endereco antigo e `/painel?vista=manual`, e nao `/`: o proxy repassa a
    // query, entao ele cai direto no envio manual; `/` cairia na Visao geral.
    cta: {
      rotulo: 'Ir para o envio manual',
      aba: '/eventos?vista=manual',
      href: '/painel?vista=manual',
    },
  },
  {
    id: 'auto',
    hue: 'auto',
    icone: LightningIcon,
    titulo: 'Envio automático',
    definicao:
      'A plataforma manda o webhook, a regra escolhe o evento da Meta e o app envia sozinho.',
    quandoUsar:
      'Depois de um envio manual bem-sucedido e da conferência no Testar eventos.',
    quemAperta: 'Ninguém aperta nada. Por isso a rede de segurança importa.',
    cta: { rotulo: 'Ver as regras', aba: '/regras', href: '/automatico?aba=regras' },
  },
];

/* ------------------------------------------------------------------ */
/* Topicos                                                             */
/* ------------------------------------------------------------------ */

export const TOPICOS: Topico[] = [
  {
    id: 'conferir-envio',
    hue: 'conferencia',
    icone: SealCheckIcon,
    capa: '/brand/guia/conferir-envio.webp',
    titulo: 'A venda foi para a Meta?',
    frase: 'Onde fica a prova, o que cada situação quer dizer e qual tela não responde isso.',
    contador: '4 conferências',
    indice: 'Conferir',
    paraQue:
      'Responder, com evidência na tela, se uma compra que entrou virou conversão na Meta.',
    quandoUsar:
      'Sempre que uma venda chegar e você precisar saber se ela foi enviada — e depois de qualquer envio.',
    saiSabendo:
      'Ler a situação de um item, separar `Enviado à Meta` de `Na fila` e não confundir repasse com envio.',
    numerado: false,
    itens: [
      {
        id: 'situacao',
        titulo: 'A situação do item',
        resumo: 'Enviado à Meta, Na fila ou Ignorado — na linha do item.',
        icone: ListChecksIcon,
        oQue:
          'Cada evento recebido mostra a própria situação: Enviado à Meta (com a data e o nome do evento que foi enviado), Na fila (chegou, mas nenhuma regra mandou enviar) ou Ignorado (a regra mandou não enviar). É a resposta direta da pergunta.',
        onde: 'Eventos → Fila.',
        erro:
          'Procurar a resposta em outra tela. Nenhuma outra aba do console lista o que foi para a Meta.',
      },
      {
        id: 'events-received',
        titulo: 'O que conta como "enviado"',
        resumo: 'events_received igual a 1, não HTTP 200.',
        icone: SealCheckIcon,
        oQue:
          'Só conta como enviado o envio em que a Meta devolveu `events_received: 1`. HTTP 200 sozinho não prova nada. O `fbtrace_id` guardado junto é o número que o suporte da Meta usa para rastrear o evento.',
        onde: 'No próprio item, ao abrir o resultado do envio.',
      },
      {
        id: 'na-fila',
        titulo: 'Na fila não é erro',
        resumo: 'Chegou e esperou. Nenhuma regra mandou enviar.',
        icone: QueueIcon,
        oQue:
          'Evento sem regra própria, ou com regra em modo Fila, fica esperando uma decisão humana. É o estado normal enquanto o automático está desligado — e é ele que permite conferir o payload antes do go-live.',
        onde: 'Regras → aba Regras mostra o modo de cada evento.',
      },
      {
        id: 'retorno-nao-e-envio',
        titulo: 'Repasse para outros sistemas não é envio para a Meta',
        resumo: 'Repasse zerado não significa nada parado.',
        icone: ProhibitIcon,
        oQue:
          'A aba Repasse trata do que segue para n8n e CRM, depois da Meta. Sem endereço cadastrado, ela mostra zero para sempre — e isso não afeta em nada o envio para a Meta.',
        onde: 'Regras → aba Repasse.',
        erro:
          'Concluir que "nada foi enviado" porque essa tabela está vazia. Foi o susto mais comum desta interface.',
      },
    ],
  },

  {
    id: 'como-usar',
    hue: 'manual',
    icone: CursorClickIcon,
    capa: '/brand/guia/como-usar.webp',
    titulo: 'Envio manual em 5 passos',
    frase: 'Sempre na mesma ordem. Você confere tudo antes de enviar.',
    contador: '5 passos',
    indice: 'Manual',
    paraQue: 'Recuperar uma venda que o pixel do navegador não registrou.',
    quandoUsar:
      'Venda no PIX fora da janela do pixel, correção pontual, estreia de um pixel novo.',
    saiSabendo:
      'Enviar um `Purchase` com nota de qualidade acima de 8 e `events_received: 1` na resposta.',
    numerado: true,
    itens: [
      {
        id: 'pixel',
        titulo: 'Escolha o Pixel que recebe',
        resumo: 'Confira para onde vai e se está em teste.',
        icone: TargetIcon,
        oQue:
          'Veja para qual Pixel o evento vai e se está em teste ou em produção.',
        onde: 'Selo de ambiente no topo da tela, ou o botão Trocar pixel no painel Pixel que recebe (passo 4).',
        erro:
          'Enviar em produção achando que estava em teste. O selo âmbar "Produção" significa que o evento entra nas métricas reais.',
      },
      {
        id: 'dados',
        titulo: 'Carregue os dados',
        resumo: 'Da Fila, do JSON colado ou à mão.',
        icone: DownloadSimpleIcon,
        oQue:
          'Use Carregar no formulário num evento da Fila, cole o JSON, ou preencha os campos à mão. Carregar não envia nada — só preenche.',
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
        onde: 'Painel Qualidade do evento, no passo 4 — Conferir e enviar.',
        erro:
          'Ignorar a nota. Abaixo de 5.0 a Meta tem dificuldade para casar a conversão com um perfil.',
      },
      {
        id: 'disparar',
        titulo: 'Envie',
        resumo: 'Em produção aparece uma confirmação antes.',
        icone: PaperPlaneTiltIcon,
        oQue:
          'Em produção aparece uma confirmação com o resumo do que vai ser enviado.',
        onde: 'Botão Enviar evento.',
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
        onde: 'Painel de resultado, que aparece no topo da coluna de trabalho logo após o envio.',
        erro:
          'Assumir que HTTP 200 basta. Se `events_received` vier 0, a Meta não registrou nada.',
      },
    ],
  },

  {
    id: 'webhook-automatico',
    hue: 'auto',
    icone: LightningIcon,
    capa: '/brand/guia/webhook-automatico.webp',
    titulo: 'Envio automático em 6 passos',
    frase: 'Ligar o recebimento direto da plataforma, sem copiar e colar.',
    contador: '6 passos',
    indice: 'Automático',
    paraQue:
      'Parar de digitar: a plataforma avisa, a regra decide e o app envia sozinho.',
    quandoUsar:
      'Depois de ao menos um envio manual bem-sucedido e conferido no Testar eventos.',
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
          'A URL já vem com o segredo no caminho. Quem tiver essa URL consegue inserir eventos na sua Fila — trate como senha.',
        // O recebimento saiu das abas de Disparo automático e virou o bloco 1
        // de Instalação. O ponteiro precisa levar ao lugar certo: passo com
        // endereco errado e o tipo de erro que faz o operador desistir do Guia.
        onde: 'Instalação → Webhook da plataforma de vendas → "URL para a plataforma" → Copiar.',
      },
      {
        id: 'endpoint',
        titulo: 'Cadastrar o endpoint na plataforma de vendas',
        resumo: 'Assine só os eventos que viram conversão.',
        icone: TargetIcon,
        oQue:
          'Marque só os eventos que viram conversão: `precheckout_opened`, `checkout_session_opened`, `payment_generated`, `checkout_card_attempted` e `purchase_approved`. Abandono e estorno não precisam ser assinados.',
        onde: 'Na plataforma de vendas → Integrações → Webhooks → Novo endpoint. No xWinner é em admin.codigovencedor.com. Este menu é da plataforma, não deste console.',
      },
      {
        id: 'testar',
        titulo: 'Clicar em "Testar"',
        resumo: 'O payload de exemplo tem que dar "teste-ignorado".',
        icone: FlaskIcon,
        oQue:
          'A plataforma envia um payload de exemplo com `lead@example.com`. Ele tem que aparecer na Fila e, se você mandar enviar, o resultado tem que ser "teste-ignorado". Se aparecer "enviado", pare tudo.',
        onde: 'Na plataforma → botão "Testar" do endpoint (no xWinner ele manda um ping); depois Eventos → Fila.',
      },
      {
        id: 'venda-real',
        titulo: 'Conferir a Fila com venda real',
        resumo: 'Evento, valor e fbc de uma compra de verdade.',
        icone: ReceiptIcon,
        oQue:
          'Espere uma compra de verdade chegar. Confira o evento de origem, o evento da Meta escolhido pela regra, o valor e se veio com `fbc`.',
        onde: 'Eventos → Fila.',
      },
      {
        id: 'ligar',
        titulo: 'Ligar o automático no Purchase — com Código de teste',
        resumo: 'Automático primeiro, mas só no Testar eventos.',
        icone: LightningIcon,
        oQue:
          'Preencha o Código de teste do Pixel, depois mude a regra de `purchase_approved` para Automático. A próxima compra vai sozinha e aparece só no Testar eventos.',
        onde: 'Pixel e token → Código de teste; depois Regras → aba Regras.',
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
    icone: MapTrifoldIcon,
    capa: '/brand/guia/onde-achar.webp',
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
    icone: GaugeIcon,
    capa: '/brand/guia/emq.webp',
    titulo: 'Qualidade do evento',
    frase:
      'A soma ponderada dos 9 parâmetros vai de 0 a 10. Acima de 8 a atribuição ao anúncio é direta.',
    contador: '9 parâmetros',
    indice: 'Qualidade',
    paraQue: 'Entender a nota do painel e o que falta para subir.',
    quandoUsar: 'Antes de qualquer envio com nota abaixo de 8.',
    saiSabendo: 'Qual parâmetro pesa mais e como conseguir cada um.',
    numerado: false,
    extra: 'tabela-emq',
    itens: [],
  },

  {
    id: 'regras',
    hue: 'regras',
    icone: ShieldCheckIcon,
    capa: '/brand/guia/regras.webp',
    titulo: 'Regras da Meta',
    frase: 'O que a API aceita e o que ela recusa.',
    contador: '5 regras',
    indice: 'Regras',
    paraQue: 'Saber o que a API recusa antes de ser recusado por ela.',
    quandoUsar: 'Antes do primeiro envio e em qualquer erro devolvido pela Meta.',
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
        titulo: 'Hash SHA-256 obrigatório',
        resumo: 'E-mail, telefone, nome e CPF saem em hash SHA-256.',
        icone: LockKeyIcon,
        oQue:
          'E-mail, telefone, nome, sobrenome e CPF saem daqui transformados em hash SHA-256; o que já chega em hash passa como está. A Meta nunca recebe o dado em claro. IP, user agent, `fbc` e `fbp` vão em texto puro, por exigência da própria API.',
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
