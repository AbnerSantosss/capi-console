/**
 * O conjunto de icones do produto — UM SO, e ele e o Phosphor.
 *
 * FASE 4 do `plano-redesign-visual-v4.md` (movimento M5).
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * Ate aqui o console desenhava com DOIS conjuntos: o Lucide em 56 arquivos e o
 * Phosphor no Guia. Dois conjuntos na mesma tela e uma das assinaturas de
 * template que a pesquisa da §8 do plano lista, e pelo motivo mais concreto
 * possivel: cada familia tem uma gramatica propria de traco, de raio de canto e
 * de como termina uma linha. Misturadas, o olho nao le "dois estilos", le
 * "ninguem decidiu" — que e exatamente a queixa do dono sobre o design inteiro.
 * O Phosphor ficou porque ja estava instalado, ja era o do Guia, e tem peso
 * optico uniforme de verdade (o traco nao engorda quando o glifo fica cheio).
 *
 * POR QUE UM BARRIL DE RE-EXPORTACAO, E NAO 56 EDICOES DE VERDADE
 *
 * Cada nome abaixo sai com o nome que o Lucide usava. Assim os 56 arquivos que
 * consomem icone trocaram SO o caminho do import — nenhum JSX mudou, o diff da
 * fase e legivel, e o risco de um `Warning` virar `WarningCircle` por descuido
 * em algum ponto perdido de 19 mil linhas e zero. O ganho de verdade e o
 * proximo: trocar de conjunto de icones amanha e editar ESTE arquivo, nao 56.
 *
 * O preco e honesto e esta escrito aqui: os nomes sao do conjunto que saiu.
 * `Zap` nao existe no Phosphor — o glifo chama `Lightning`. Quem vier depois le
 * o mapa abaixo e sabe o que esta desenhando.
 *
 * DE ONDE VEM (`/ssr`, e nao a raiz)
 *
 * O Phosphor publica duas construcoes do mesmo desenho. A da raiz le
 * `IconContext` com `useContext` — e portanto so roda em componente de cliente,
 * sem `'use client'` declarado. SEIS das sete paginas do console sao componente
 * de servidor e renderizam icone direto (`icon={Workflow}` em
 * `automatico/page.tsx`, por exemplo), entao a raiz quebraria o build. A
 * construcao `/ssr` nao tem hook nenhum e serve aos dois lados. Perdemos o
 * `IconContext` global — e nao faz falta, porque o padrao do produto e o peso
 * `regular` (o default) e o tamanho vem das classes `size-*` do Tailwind, que
 * vencem por CSS o `size="1em"` do componente.
 *
 * PESO
 *
 * `regular` em TUDO, e por isso nao se escreve `weight` em lugar nenhum: o
 * default ja e ele, e um `weight="regular"` espalhado seria so ruido esperando
 * alguem trocar por outra coisa. A unica excecao autorizada pelo plano e o
 * `duotone` do glifo no titulo da PAGINA (`ConsolePageHeader`), que e um por
 * tela. O Phosphor nao tem prop de espessura de traco; as 30 ocorrencias que o
 * v3 espalhou (todas com o valor 1.75) sairam junto com a troca.
 */

/**
 * O tipo do componente de icone.
 *
 * `Icone` e o nome honesto e e o que codigo novo deve usar. `LucideIcon` e o
 * apelido de compatibilidade: varios pontos tipam a prop com ele, e mante-lo
 * evita mexer em arquivo que nao precisa mudar nesta fase.
 *
 * Vem da RAIZ de proposito: `/ssr` nao reexporta o tipo, e `export type` e
 * apagado na compilacao — nao arrasta a construcao de cliente para o bundle.
 */
export type { Icon as Icone, Icon as LucideIcon } from '@phosphor-icons/react';
export type { IconProps as PropsDeIcone, IconWeight as PesoDeIcone } from '@phosphor-icons/react';

export {
  /* --- Avisos e estados ------------------------------------------------- */
  WarningCircleIcon as AlertCircle,
  // `AlertTriangle` e `TriangleAlert` sao o MESMO aviso: o Lucide renomeou no
  // meio do caminho e o codigo ficou com os dois nomes vivos. Os dois apontam
  // para o triangulo de atencao do Phosphor, que se chama so `Warning`.
  WarningIcon as AlertTriangle,
  WarningIcon as TriangleAlert,
  CheckCircleIcon as CheckCircle2,
  XCircleIcon as XCircle,
  InfoIcon as Info,
  // Ajuda: o Phosphor nao tem "circulo com interrogacao" — tem a interrogacao,
  // que e o sinal que importa.
  QuestionIcon as HelpCircle,
  ShieldWarningIcon as ShieldAlert,
  ShieldCheckIcon as ShieldCheck,
  // "Nao enviar" / acao bloqueada. O Phosphor chama de `Prohibit` o circulo
  // cortado que o Lucide chamava de `Ban`.
  ProhibitIcon as Ban,
  // Lista vazia porque o filtro "so compras" nao achou nada — NAO e proibicao,
  // e ausencia. Por isso vai no circulo tracejado, e nao no `Prohibit` do `Ban`.
  CircleDashedIcon as CircleSlash,
  PauseCircleIcon as PauseCircle,

  /* --- Carregando ------------------------------------------------------- */
  // `Loader2` e `LoaderCircle` sao o mesmo giro: o primeiro e o nome que o
  // shadcn gerou, o segundo o nome novo do Lucide. Um destino so — o arco
  // aberto do Phosphor, que e o unico glifo dele feito para girar.
  CircleNotchIcon as Loader2,
  CircleNotchIcon as LoaderCircle,

  /* --- Setas e navegacao ------------------------------------------------ */
  ArrowLeftIcon as ArrowLeft,
  ArrowRightIcon as ArrowRight,
  ArrowUpRightIcon as ArrowUpRight,
  ArrowDownRightIcon as ArrowDownRight,
  // Puxar para dentro ("carregar no formulario"): seta que bate numa linha.
  ArrowLineDownIcon as ArrowDownToLine,
  // Sai do app e abre outra aba. No Phosphor a seta que sai de um quadrado.
  ArrowSquareOutIcon as ExternalLink,
  // `ChevronDown`/`ChevronDownIcon` sao o mesmo glifo com dois nomes — o
  // segundo e o que os arquivos do shadcn (select, accordion) importam. No
  // Phosphor o chevron de interface chama `Caret`.
  CaretDownIcon as ChevronDown,
  CaretDownIcon as ChevronDownIcon,
  CaretUpIcon as ChevronUpIcon,
  // Menu de tres pontinhos ("mais acoes").
  DotsThreeIcon as MoreHorizontal,

  /* --- Confirmar, fechar, marcar ---------------------------------------- */
  // `Check`/`CheckIcon` e `X`/`XIcon`: mesmo par de sempre — nome curto usado
  // pelo produto, nome com sufixo usado pelos arquivos do shadcn. Mesmo destino.
  CheckIcon,
  CheckIcon as Check,
  XIcon,
  XIcon as X,
  PlusIcon as Plus,
  SquareIcon as Square,

  /* --- Dado, dinheiro e venda ------------------------------------------- */
  ShoppingBagIcon as ShoppingBag,
  ShoppingCartIcon as ShoppingCart,
  CreditCardIcon as CreditCard,
  // Recibo do pedido. O Phosphor nao separa "recibo com texto" de "recibo".
  ReceiptIcon as ReceiptText,
  GaugeIcon as Gauge,
  TargetIcon as Target,

  /* --- Pessoas ---------------------------------------------------------- */
  UserIcon as User,
  UsersIcon as Users,
  UserPlusIcon as UserPlus,
  UserCheckIcon as UserCheck,
  // Identidade do comprador (os dados que casam a compra com a pessoa).
  FingerprintIcon as Fingerprint,
  HandHeartIcon as HandHeart,
  HeartIcon as Heart,
  PhoneCallIcon as PhoneCall,
  EnvelopeIcon as Mail,
  MapPinIcon as MapPin,

  /* --- Integracao, rede e codigo ---------------------------------------- */
  // O webhook do Phosphor e um "logo" no nome, mas o desenho e o mesmo no da
  // ferramenta: tres bracos saindo de um ponto.
  WebhooksLogoIcon as Webhook,
  PlugIcon as Plug,
  // Tomada COM energia: o automatico ligado, recebendo. O Phosphor diz
  // "carregando" onde o Lucide dizia "raio".
  PlugChargingIcon as PlugZap,
  NetworkIcon as Network,
  GlobeIcon as Globe,
  // O fluxo do automatico: evento entra, regra decide, evento sai.
  FlowArrowIcon as Workflow,
  // Ramo de versao da regra.
  GitBranchIcon as GitBranch,
  // Arvore de campos do payload (chave dentro de chave).
  TreeStructureIcon as ListTree,
  // `Code2` e "codigo" no sentido de "cole este trecho no site".
  CodeIcon as Code2,
  // `Braces` e literalmente a aba "Colar JSON" — o par de chaves `{}`. Por isso
  // vai nos colchetes curvos, e nao no simbolo generico de codigo.
  BracketsCurlyIcon as Braces,
  // Arquivo de payload JSON para inspecao.
  FileCodeIcon as FileJson,
  FileTextIcon as FileText,
  // O corpo do webhook NAO pode ser lido — o arquivo falhou, nao esta so
  // avisando. Por isso o "X" e nao o triangulo.
  FileXIcon as FileWarning,
  TerminalIcon as Terminal,
  // Container do Google Tag Manager: a caixa que guarda as tags do cliente.
  PackageIcon as Container,
  // Predio = a empresa (o console e multiempresa).
  BuildingsIcon as Building2,

  /* --- Acoes ------------------------------------------------------------ */
  // Disparar para a Meta: o aviao de papel inclinado, que e o "enviar" do
  // Phosphor.
  PaperPlaneTiltIcon as Send,
  CopyIcon as Copy,
  // Salvar: o Phosphor so tem o disquete.
  FloppyDiskIcon as Save,
  PencilIcon as Pencil,
  TrashIcon as Trash2,
  EraserIcon as Eraser,
  // Recarregar a lista.
  ArrowsClockwiseIcon as RefreshCw,
  // Desfazer / voltar ao estado anterior do formulario.
  ArrowCounterClockwiseIcon as RotateCcw,
  // Assinatura recorrente (`Subscribe`): a coisa se repete para sempre.
  RepeatIcon as Repeat,
  // "E-mail repetido em varias compras" — o MESMO de novo, uma ocorrencia
  // duplicada. Fica no `RepeatOnce` para nao virar o mesmo glifo de recarregar:
  // sao dois sentidos diferentes e a tela mostra os dois.
  RepeatOnceIcon as Repeat2,
  // Sair da sessao.
  SignOutIcon as LogOut,
  // Preferencias do app.
  GearIcon as Settings,
  // Ajustes finos de um evento personalizado.
  SlidersIcon as Sliders,
  // Varinha: "preencher sozinho / adivinhar para mim".
  MagicWandIcon as Wand2,
  // Clique do visitante na tag do site.
  CursorClickIcon as MousePointerClick,

  /* --- Busca e filtro --------------------------------------------------- */
  MagnifyingGlassIcon as Search,
  // Busca sem resultado (estado vazio "nada bate com o filtro"). O Phosphor
  // nao tem "lupa com X"; a lupa de menos e a que diz "menos do que voce
  // procurava", que e o sentido da tela.
  MagnifyingGlassMinusIcon as SearchX,
  // Filtro da caixa de entrada. O funil e o glifo de filtro do Phosphor; o
  // `Simple` e a versao sem as listras, que combina com o peso regular.
  FunnelSimpleIcon as ListFilter,

  /* --- Tempo ------------------------------------------------------------ */
  ClockIcon as Clock,
  // Historico de disparos: o relogio que anda para tras.
  ClockCounterClockwiseIcon as History,
  // Seletor de periodo (Hoje / 7 d / 30 d / intervalo livre).
  CalendarBlankIcon as CalendarRange,
  // `Schedule` da Meta: marcou call, consulta ou visita — um DIA marcado na
  // agenda. O Phosphor nao tem calendario com relogio; tem o dia marcado.
  CalendarDotIcon as CalendarClock,

  /* --- Caixa de entrada e conteudo -------------------------------------- */
  // Caixa de entrada: a bandeja do Phosphor.
  TrayIcon as Inbox,
  BookOpenIcon as BookOpen,
  // Ao vivo: o automatico esta escutando. O Phosphor chama de `Broadcast` as
  // ondas que o Lucide chamava de `Radio`.
  BroadcastIcon as Radio,
  // Formulario de inscricao enviado (`SubmitApplication`).
  ClipboardTextIcon as ClipboardCheck,
  BellIcon as Bell,
  SparkleIcon as Sparkles,
  PaletteIcon as Palette,
  // "Densidade da interface" nas preferencias: tamanho do texto.
  TextAaIcon as Type,
  // Teste (cupom de R$ 0,01, ping de conexao): o frasco de laboratorio.
  FlaskIcon as FlaskConical,

  /* --- Visibilidade e seguranca ----------------------------------------- */
  EyeIcon as Eye,
  EyeSlashIcon as EyeOff,
  LockIcon as Lock,
  // Token de acesso. O Phosphor tem uma chave so.
  KeyIcon as KeyRound,
  LinkIcon as Link2,
  // Energia: disparo instantaneo / conexao ativa.
  LightningIcon as Zap,
  LightningSlashIcon as ZapOff,
  WifiSlashIcon as WifiOff,
} from '@phosphor-icons/react/ssr';
