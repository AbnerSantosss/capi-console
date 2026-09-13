import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Import de TIPO: o `tsc --noEmit` recusa uma regra semente com nome de evento
// que nao existe em EVENTOS_META. Sincronizacao das duas listas vira erro de
// compilacao, nao um evento personalizado silencioso no Gerenciador.
import type { NomeEventoMetaPadrao } from './meta-events';

// Import de TIPO do bloco da tag: tag-dominios.ts e um arquivo puro, usado
// tambem pela tela no navegador, e daqui so interessa a forma do dado. Ja o
// catalogo de eventos da tag entra como VALOR, porque as regras semente dele
// precisam ir para dentro do arquivo gravado em disco.
import type { ConfigTag } from './tag-dominios';
import { regrasSementeTag } from './tag-eventos';

// Escrita atômica com backup (B-1) e fila de escrita por arquivo (B-2).
// Nenhum `fs.writeFile` direto pode voltar para este arquivo: o teste C15
// (`scripts/persistencia-atomica.test.mjs`) reprova o build se voltar.
import {
  ErroConfiguracaoIndisponivel,
  caminhoBak,
  gravarAtomico,
  naFila,
} from './arquivo-atomico';

export { ErroConfiguracaoIndisponivel } from './arquivo-atomico';

/**
 * Configuracao local do console, guardada em disco no servidor.
 *
 * Motivo de existir: o token de acesso da Meta estava sendo persistido em
 * localStorage pelo Zustand, o que contraria a regra 2 do CLAUDE.md do projeto
 * ("tokens ... use o arquivo local .env"). Qualquer script rodando na origem
 * conseguia ler o token. Agora o segredo nunca sai do servidor: o cliente so
 * recebe `temToken: boolean`.
 *
 * A pasta `config/` esta no .gitignore.
 */

const DIR = path.join(process.cwd(), 'config');
const ARQ_MARCAS = path.join(DIR, 'marcas.json');
const ARQ_INTEGRACOES = path.join(DIR, 'integracoes.json');

/* ------------------------------------------------------------------ */
/* Marcas                                                              */
/* ------------------------------------------------------------------ */

export interface Marca {
  id: string;
  nome: string;
  pixelId: string;
  /** NUNCA vai para o cliente. */
  accessToken: string;
  testCode: string;
  /** ID da conta de anuncios, para montar os deep links do Gerenciador. */
  adAccountId?: string;
  /** true quando os valores vem do .env e nao de config/marcas.json. */
  doEnv?: boolean;
}

/** A forma que o cliente pode ver. */
export interface MarcaPublica {
  id: string;
  nome: string;
  pixelId: string;
  temToken: boolean;
  testCode: string;
  adAccountId?: string;
  doEnv?: boolean;
}

export function publicarMarca(m: Marca): MarcaPublica {
  return {
    id: m.id,
    nome: m.nome,
    pixelId: m.pixelId,
    temToken: Boolean(m.accessToken?.trim()),
    testCode: m.testCode ?? '',
    adAccountId: m.adAccountId,
    doEnv: m.doEnv,
  };
}

async function garantirDir() {
  await fs.mkdir(DIR, { recursive: true });
}

/* ------------------------------------------------------------------ */
/* Leitura e gravação dos arquivos de configuração (B-1)               */
/* ------------------------------------------------------------------ */

/** O que uma tentativa de leitura encontrou. `ausente` ≠ `ilegivel` (B1-f). */
type Tentativa<T> =
  | { estado: 'ok'; dados: T }
  | { estado: 'ausente' }
  | { estado: 'ilegivel'; motivo: string };

/**
 * Lê um arquivo e diz o que encontrou, SEM engolir a diferença entre "não
 * existe" e "existe e está quebrado".
 *
 * Essa distinção é a alteração mais importante desta fase. O código antigo
 * tratava as duas iguais (`lerJson` devolvia o padrão nos dois casos), e é
 * exatamente por isso que um `integracoes.json` truncado virava um segredo de
 * entrada novo — e as vendas paravam de entrar (B1-f).
 *
 * `valido` existe porque um arquivo pode fazer `JSON.parse` e ainda assim não
 * servir (ex.: `{}`, ou um objeto sem `entrada.segredo`).
 */
async function tentarLer<T>(arquivo: string, valido?: (d: T) => boolean): Promise<Tentativa<T>> {
  let txt: string;
  try {
    txt = await fs.readFile(arquivo, 'utf8');
  } catch (e) {
    // ENOENT é a ÚNICA forma de "não existe". EACCES, EISDIR e afins são
    // arquivo existente e ilegível — e ali nada pode ser regenerado.
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return { estado: 'ausente' };
    return { estado: 'ilegivel', motivo: (e as NodeJS.ErrnoException)?.code ?? 'erro de leitura' };
  }

  let dados: T;
  try {
    dados = JSON.parse(txt) as T;
  } catch {
    return { estado: 'ilegivel', motivo: 'JSON inválido' };
  }

  if (valido && !valido(dados)) return { estado: 'ilegivel', motivo: 'conteúdo incompleto' };
  return { estado: 'ok', dados };
}

/** O que sobrou depois de tentar o arquivo e, se preciso, o `.bak`. */
type Leitura<T> =
  | { estado: 'ok'; dados: T }
  /** O arquivo não servia e o `.bak` serviu — restaurar e registrar (B1-e). */
  | { estado: 'restaurado'; dados: T }
  /** Nem o arquivo nem o `.bak` existem: primeira subida, volume novo (B1-f). */
  | { estado: 'ausente' }
  /** Existe e está quebrado, e o `.bak` também. Modo degradado (B1-e). */
  | { estado: 'indisponivel'; motivo: string };

async function lerComBackup<T>(arquivo: string, valido?: (d: T) => boolean): Promise<Leitura<T>> {
  const principal = await tentarLer<T>(arquivo, valido);
  if (principal.estado === 'ok') return { estado: 'ok', dados: principal.dados };

  const bak = await tentarLer<T>(caminhoBak(arquivo), valido);
  if (bak.estado === 'ok') return { estado: 'restaurado', dados: bak.dados };

  // "Não existe" só vale quando NENHUMA das duas cópias existe. Se há um `.bak`
  // (mesmo ilegível), o arquivo já existiu um dia — e regenerar em cima disso é
  // justamente o defeito B1.
  if (principal.estado === 'ausente' && bak.estado === 'ausente') return { estado: 'ausente' };

  return {
    estado: 'indisponivel',
    motivo: principal.estado === 'ilegivel' ? principal.motivo : 'arquivo ausente e backup ilegível',
  };
}

/**
 * Leitura tolerante, para quem pode seguir com o padrão.
 *
 * Mantém a assinatura antiga de propósito (`marcas.json` continua caindo para
 * `[]` quando não há nada legível), mas agora tenta o `.bak` antes de desistir:
 * um `marcas.json` corrompido não apaga mais os Pixels no primeiro save.
 */
async function lerJson<T>(arquivo: string, padrao: T): Promise<T> {
  const r = await lerComBackup<T>(arquivo);
  return r.estado === 'ok' || r.estado === 'restaurado' ? r.dados : padrao;
}

/**
 * ÚNICA porta de escrita em `config/*.json`.
 *
 * `backup: false` só na restauração — ver `gravarAtomico`.
 */
async function gravarJson(arquivo: string, dados: unknown, opcoes?: { backup?: boolean }) {
  await garantirDir();
  await gravarAtomico(arquivo, JSON.stringify(dados, null, 2), opcoes);
}

/** Marca implicita vinda do .env. Sempre existe, sempre com id "default". */
function marcaDoEnv(): Marca {
  return {
    id: 'default',
    nome: process.env.BRAND_NAME || 'Código Vencedor',
    pixelId: process.env.PIXEL_ID || '',
    accessToken: process.env.ACCESS_TOKEN || '',
    testCode: process.env.TEST_EVENT_CODE || '',
    adAccountId: process.env.AD_ACCOUNT_ID || undefined,
    doEnv: true,
  };
}

export async function listarMarcas(): Promise<Marca[]> {
  const salvas = await lerJson<Marca[]>(ARQ_MARCAS, []);
  const env = marcaDoEnv();
  const sobrescrita = salvas.find((m) => m.id === 'default');

  const padrao: Marca = sobrescrita
    ? {
        ...env,
        ...sobrescrita,
        // o token do .env vale como reserva quando a marca nao tem um proprio
        accessToken: sobrescrita.accessToken?.trim() || env.accessToken,
        doEnv: !sobrescrita.accessToken?.trim(),
      }
    : env;

  return [padrao, ...salvas.filter((m) => m.id !== 'default')];
}

export async function acharMarca(id: string): Promise<Marca | undefined> {
  const todas = await listarMarcas();
  return todas.find((m) => m.id === id) ?? todas[0];
}

/**
 * Cria ou atualiza uma marca.
 *
 * B2-a/B2-b: a LEITURA acontece dentro da fila. Ler fora e gravar dentro
 * deixaria a janela aberta — dois saves simultâneos e o segundo apagaria o
 * primeiro, que é o defeito B2 inteiro.
 */
export async function salvarMarca(entrada: Partial<Marca> & { id: string }) {
  return naFila(ARQ_MARCAS, async () => {
    const salvas = await lerJson<Marca[]>(ARQ_MARCAS, []);
    const i = salvas.findIndex((m) => m.id === entrada.id);

    const base: Marca = i >= 0
      ? salvas[i]
      : {
          id: entrada.id,
          nome: '',
          pixelId: '',
          accessToken: '',
          testCode: '',
        };

    const atualizada: Marca = {
      ...base,
      ...entrada,
      // string vazia significa "nao mexer no token"; para limpar, envie null.
      accessToken:
        entrada.accessToken === null
          ? ''
          : entrada.accessToken?.trim()
            ? entrada.accessToken.trim()
            : base.accessToken,
    };

    if (i >= 0) salvas[i] = atualizada;
    else salvas.push(atualizada);

    await gravarJson(ARQ_MARCAS, salvas);
    return atualizada;
  });
}

export async function removerMarca(id: string) {
  if (id === 'default') throw new Error('A marca padrão não pode ser removida.');
  return naFila(ARQ_MARCAS, async () => {
    const salvas = await lerJson<Marca[]>(ARQ_MARCAS, []);
    await gravarJson(
      ARQ_MARCAS,
      salvas.filter((m) => m.id !== id)
    );
  });
}

/* ------------------------------------------------------------------ */
/* Integracoes (webhooks de entrada e saida)                           */
/* ------------------------------------------------------------------ */

export type EventoRelay = 'dispatch.success' | 'dispatch.error' | 'inbox.received';

export interface DestinoRelay {
  id: string;
  nome: string;
  url: string;
  headers: Record<string, string>;
  eventos: EventoRelay[];
  ativo: boolean;
}

export type ModoRegra = 'auto' | 'fila' | 'ignorar';

export interface RegraRoteamento {
  id: string;
  /** Nome exato do evento na origem (ex.: purchase_approved). '*' = qualquer evento sem regra propria. */
  eventoOrigem: string;
  /** Evento padrao da Meta ou nome customizado. Ignorado quando modo = 'ignorar'. */
  eventoMeta: string;
  /** IDs das marcas (pixels) que recebem o evento. Vazio = marca 'default'. */
  marcas: string[];
  modo: ModoRegra;
  ativo: boolean;
}

export interface Integracoes {
  entrada: {
    /** Segredo exigido no header X-CAPI-Secret. Nunca vai inteiro ao cliente. */
    segredo: string;
    /**
     * Campo legado. NAO e lido por `processarWebhook`: o fallback de evento sem
     * regra propria e sempre 'fila', por decisao de projeto (regra 3 do
     * CLAUDE.md). Ligar automatico e sempre por regra nomeada, nunca por um
     * interruptor global.
     */
    modo: 'fila' | 'auto';
    /** Apelido publico do endpoint. NAO autentica nada — quem protege e o segredo. */
    rotulo?: string;
  };
  regras: RegraRoteamento[];
  saida: DestinoRelay[];
  /**
   * Tag do navegador: chave publica de escrita e dominios autorizados.
   *
   * `tag.chave` NAO e `entrada.segredo` e os dois nunca podem se encostar. A
   * chave viaja dentro do HTML do cliente (GTM ou script colado na pagina), ou
   * seja, qualquer visitante le no codigo-fonte; o segredo de entrada autentica
   * o xWinner e nunca sai do servidor. Se o segredo fosse parar na tag,
   * qualquer pessoa forjaria um Purchase e a Meta aprenderia com venda que nao
   * existiu (regra 1 do CLAUDE.md).
   *
   * Como a chave nao vale dinheiro sozinha — o coletor recusa Purchase e
   * Subscribe e so aceita Origin da lista de dominios —, ela pode ser girada a
   * qualquer momento: o pior que acontece e a tag do cliente parar de coletar
   * ate ele colar o codigo novo. A entrega de vendas pelo webhook continua
   * intacta, porque nao depende dela.
   */
  tag: ConfigTag;
}

/* ------------------------------------------------------------------ */
/* Rotulo do endpoint de entrada (apelido publico, nao credencial)     */
/* ------------------------------------------------------------------ */

export const ROTULO_PADRAO = 'xwinner-codigo-vencedor';
export const ROTULO_MIN = 3;
export const ROTULO_MAX = 40;
const RE_ROTULO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aceita o que o operador digitou e devolve o slug. Nao valida, normaliza. */
export function normalizarRotulo(v: string): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ROTULO_MAX)
    .replace(/-+$/g, '');
}

/** Erro legivel, ou null se o slug serve. */
export function erroDoRotulo(v: string): string | null {
  if (v.length < ROTULO_MIN) return `Use ao menos ${ROTULO_MIN} caracteres.`;
  if (v.length > ROTULO_MAX) return `Máximo de ${ROTULO_MAX} caracteres.`;
  // [a-z0-9-] ja elimina por construcao '/', '..', '%2e%2e', espaco, '<' e aspas:
  // o rotulo nunca vira travessia de caminho nem HTML injetado.
  if (!RE_ROTULO.test(v)) return 'Só minúsculas, dígitos e hífen entre palavras.';
  if (RE_UUID.test(v)) return 'Isso tem cara de segredo. O rótulo é público — use um apelido.';
  return null;
}

export function rotuloDaConfig(cfg: Integracoes): string {
  return cfg.entrada.rotulo?.trim() || ROTULO_PADRAO;
}

/* ------------------------------------------------------------------ */
/* Regras semente                                                      */
/* ------------------------------------------------------------------ */

/** Nome do evento da Meta que a semente pode usar. '' = a regra ignora. */
type EventoMetaSemente = NomeEventoMetaPadrao | '';

function regra(
  id: string,
  eventoOrigem: string,
  eventoMeta: EventoMetaSemente,
  modo: ModoRegra
): RegraRoteamento {
  return {
    id,
    eventoOrigem,
    eventoMeta,
    marcas: eventoMeta ? ['default'] : [],
    modo,
    ativo: true,
  };
}

/** Regra de ignorar, com id derivado do nome de origem. */
function ignorar(eventoOrigem: string, eventoMeta: EventoMetaSemente = ''): RegraRoteamento {
  return regra(`r-ign-${eventoOrigem.replace(/\W+/g, '-')}`, eventoOrigem, eventoMeta, 'ignorar');
}

/**
 * Regras iniciais — uma para CADA nome de MAPA_EVENTOS_ORIGEM, para o operador
 * conseguir explicar na tela o destino de todo evento que chega. Nada aqui muda
 * o que o parser ja fazia em silencio: so torna visivel e editavel.
 *
 * TODAS nascem em 'fila' ou 'ignorar' de proposito: nada pode disparar sozinho
 * antes de o humano ver funcionando no Test Events. Ligar o 'auto' do Purchase
 * e uma decisao consciente, feita na tela de Integracoes.
 */
export const REGRAS_SEMENTE = (): RegraRoteamento[] => [
  // --- formato A (xWinner) que vira conversao ---
  regra('r-precheckout', 'precheckout_opened', 'Lead', 'fila'),
  regra('r-checkout', 'checkout_session_opened', 'InitiateCheckout', 'fila'),
  regra('r-pix', 'payment_generated', 'AddPaymentInfo', 'fila'),
  regra('r-card', 'checkout_card_attempted', 'AddPaymentInfo', 'fila'),
  regra('r-purchase', 'purchase_approved', 'Purchase', 'fila'),

  // --- formato B (gateway / Checkout Platform) que vira conversao ---
  regra('r-precheckout-b', 'pre.checkout.session.opened', 'Lead', 'fila'),
  regra('r-checkout-b', 'checkout.session.opened', 'InitiateCheckout', 'fila'),
  regra('r-pix-b', 'checkout.pix.generated', 'AddPaymentInfo', 'fila'),
  regra('r-purchase-b', 'checkout.session.completed', 'Purchase', 'fila'),
  regra('r-purchase-c', 'payment.paid', 'Purchase', 'fila'),

  // --- sinonimos do tracker tkr: ja produziam conversao pelo fallback 'fila'
  // hardcoded do webhook. Aqui viram linha visivel, que o operador pode desligar.
  regra('r-sin-purchase', 'purchase', 'Purchase', 'fila'),
  regra('r-sin-order-approved', 'order_approved', 'Purchase', 'fila'),
  regra('r-sin-begin-checkout', 'begin_checkout', 'InitiateCheckout', 'fila'),
  regra('r-sin-pre-checkout-opened', 'pre_checkout_opened', 'Lead', 'fila'),

  // --- mapeados, mas desligados por decisao do projeto ---
  regra('r-registro', 'user_registered', 'CompleteRegistration', 'ignorar'),
  regra('r-assinatura', 'subscription_started', 'Subscribe', 'ignorar'),

  // --- abandono, expiracao, estorno, chargeback: nao sao conversao ---
  ignorar('precheckout_expired'),
  ignorar('checkout_abandoned'),
  ignorar('checkout_lead_abandoned'),
  ignorar('purchase_refunded'),
  ignorar('chargeback_opened'),
  ignorar('checkout.session.expired'),
  ignorar('checkout.lead.abandoned'),
  ignorar('pre.checkout.session.expired'),
  ignorar('pre_checkout_abandoned'),

  // --- ciclo de assinatura, afiliado, financeiro e engajamento: sem equivalente
  // padrao na Meta. Enviar qualquer um seria evento ficticio (regra 1).
  ignorar('onboarding_completed'),
  ignorar('subscription_renewed'),
  ignorar('subscription_cancelled'),
  ignorar('subscription_expired'),
  ignorar('affiliate_registered'),
  ignorar('affiliate_approved'),
  ignorar('commission_released'),
  ignorar('commission_reversed'),
  ignorar('withdrawal_requested'),
  ignorar('withdrawal_paid'),
  ignorar('ebook_completed'),
  ignorar('tool_used'),

  // --- testes da propria plataforma (botao "Testar" do xWinner) ---
  regra('r-ping', 'ping', '', 'ignorar'),
  ignorar('test'),
  ignorar('webhook.test'),
  ignorar('endpoint.test'),
];

/**
 * As sementes do webhook mais as da tag do navegador, numa lista so.
 *
 * Existe para a mesclagem de `lerIntegracoes` enxergar as duas origens de uma
 * vez. Se a tag ficasse de fora, a instalacao que ja roda na VPS receberia
 * 'tag.pageview' sem regra nenhuma: o evento cairia no fallback invisivel e o
 * operador nao teria onde ver, na tela, por que o PageView nao chega na Meta.
 */
function todasSementes(): RegraRoteamento[] {
  return [...REGRAS_SEMENTE(), ...regrasSementeTag()];
}

/* ------------------------------------------------------------------ */
/* Chave publica da tag do navegador                                   */
/* ------------------------------------------------------------------ */

/**
 * Prefixo legivel. O operador vai encontrar essa string no meio do HTML do
 * cliente ou num print de suporte; com 'cvt_' na frente ele reconhece na hora
 * que aquilo e a chave da tag (publica, pode aparecer) e nao o segredo de
 * entrada (que, se aparecer, tem que ser girado imediatamente).
 */
const PREFIXO_CHAVE_TAG = 'cvt_';

/** Chave nova da tag. Publica por natureza, mas nao adivinhavel. */
function gerarChaveTag(): string {
  return PREFIXO_CHAVE_TAG + crypto.randomBytes(24).toString('base64url');
}

const INTEGRACOES_PADRAO = (): Integracoes => ({
  entrada: { segredo: crypto.randomUUID(), modo: 'fila', rotulo: ROTULO_PADRAO },
  regras: todasSementes(),
  saida: [],
  tag: { chave: gerarChaveTag(), dominios: [] },
});

/** Um arquivo de integrações só serve se tiver o segredo de entrada dentro. */
function integracoesUtil(d: Integracoes | null): boolean {
  return Boolean(d && typeof d === 'object' && typeof d.entrada?.segredo === 'string' && d.entrada.segredo.trim());
}

/**
 * O núcleo de `lerIntegracoes`, SEM fila — para poder ser chamado de dentro da
 * fila por `atualizarIntegracoes` sem travar (`naFila` não é reentrante).
 *
 * 🔴 Este é o ramo que o portão D32 vigia. As três situações são diferentes e
 * o código antigo tratava as três igual:
 *
 * | situação                               | o que acontece                    |
 * |----------------------------------------|-----------------------------------|
 * | arquivo íntegro                        | migra o que falta e devolve       |
 * | arquivo quebrado, `.bak` bom           | restaura do `.bak` — MESMO segredo|
 * | arquivo quebrado e `.bak` quebrado     | lança → modo degradado, 503       |
 * | arquivo e `.bak` inexistentes          | `INTEGRACOES_PADRAO()` (1ª subida)|
 *
 * `INTEGRACOES_PADRAO()` gera segredo novo. Ele roda SÓ na última linha dessa
 * tabela (B1-f). O segredo de entrada nunca é regenerado por falha de leitura;
 * só por clique humano, em `novoSegredoEntrada()` (B1-g).
 */
async function resolverIntegracoes(): Promise<Integracoes> {
  const leitura = await lerComBackup<Integracoes>(ARQ_INTEGRACOES, integracoesUtil);

  if (leitura.estado === 'indisponivel') {
    // NADA é gravado aqui. Regenerar seria trocar o segredo do xWinner em
    // silêncio e derrubar a entrada de vendas (defeito B1).
    throw new ErroConfiguracaoIndisponivel(ARQ_INTEGRACOES, leitura.motivo);
  }

  if (leitura.estado === 'ausente') {
    const nova = INTEGRACOES_PADRAO();
    await gravarJson(ARQ_INTEGRACOES, nova);
    return nova;
  }

  const atual = leitura.dados;
  // Restaurado do `.bak`: precisa voltar ao arquivo principal, e SEM sobrescrever
  // o `.bak` com o arquivo corrompido que acabamos de recusar.
  const restaurado = leitura.estado === 'restaurado';
  {
    let mudou = restaurado;

    // Migracao: arquivo criado antes das regras existirem.
    if (!Array.isArray(atual.regras)) {
      atual.regras = todasSementes();
      mudou = true;
    } else {
      // A semente so roda em instalacao nova; em producao o arquivo ja existe.
      // Sem esta mesclagem, regra nova nunca apareceria na VPS. Acrescenta so o
      // que falta, por eventoOrigem: NUNCA sobrescreve regra existente — o
      // operador pode ter editado o modo a mao e a decisao dele vale mais.
      const existentes = new Set(atual.regras.map((r) => r.eventoOrigem));
      const novas = todasSementes().filter((r) => !existentes.has(r.eventoOrigem));
      if (novas.length) {
        atual.regras.push(...novas);
        mudou = true;
      }
    }

    // Migracao do apelido do endpoint. Nao toca no segredo: a URL de um
    // segmento ja cadastrada no xWinner continua entregando igual.
    if (!atual.entrada.rotulo) {
      atual.entrada.rotulo = ROTULO_PADRAO;
      mudou = true;
    }

    // Migracao do bloco da tag. Sem ela, TODA instalacao que ja existe le
    // `tag` como undefined e a tela de dominios quebra no primeiro acesso —
    // inclusive a producao, que nunca passou por INTEGRACOES_PADRAO.
    if (!atual.tag || typeof atual.tag !== 'object') {
      atual.tag = { chave: gerarChaveTag(), dominios: [] };
      mudou = true;
    }
    if (!atual.tag.chave?.trim()) {
      atual.tag.chave = gerarChaveTag();
      mudou = true;
    }
    if (!Array.isArray(atual.tag.dominios)) {
      atual.tag.dominios = [];
      mudou = true;
    }

    if (!Array.isArray(atual.saida)) atual.saida = [];
    if (mudou) await gravarJson(ARQ_INTEGRACOES, atual, { backup: !restaurado });
    return atual;
  }
}

/**
 * Configuração de integrações, já migrada. Passa pela fila do arquivo (B2-a)
 * porque ela PODE gravar (migração de regras, do rótulo e do bloco da tag).
 *
 * Lança `ErroConfiguracaoIndisponivel` quando o arquivo existe e nem ele nem o
 * `.bak` puderam ser lidos. Quem chama de uma rota deve devolver **503** (via
 * `erroDeRota`), nunca 401 — 401 faz o xWinner desistir da entrega.
 */
export async function lerIntegracoes(): Promise<Integracoes> {
  return naFila(ARQ_INTEGRACOES, resolverIntegracoes);
}

/**
 * Read-modify-write serializado de `config/integracoes.json` (B2-a, B2-b).
 *
 * É a forma CORRETA de mexer neste arquivo. `lerIntegracoes()` seguido de
 * `salvarIntegracoes()` são duas entradas separadas na fila — entre elas cabe
 * outro escritor, e foi assim que o contador de hits da Tag passou a poder
 * apagar um save de regra feito no mesmo instante (defeito B2).
 *
 * O mutador recebe a configuração já migrada e pode:
 *  - alterá-la no lugar e não devolver nada;
 *  - devolver um objeto novo, que substitui o anterior;
 *  - LANÇAR — e aí nada é gravado. É como a validação da rota aborta um save.
 */
export async function atualizarIntegracoes(
  mutador: (atual: Integracoes) => Integracoes | void | Promise<Integracoes | void>
): Promise<Integracoes> {
  return naFila(ARQ_INTEGRACOES, async () => {
    const atual = await resolverIntegracoes();
    const proposta = await mutador(atual);
    const nova = proposta ?? atual;
    await gravarJson(ARQ_INTEGRACOES, nova);
    return nova;
  });
}

/**
 * Regra que vale para este evento. Regra exata vence a curinga '*'.
 * Sem regra: quem chamou decide o fallback (o webhook usa 'fila').
 */
export function acharRegra(cfg: Integracoes, eventoOrigem: string): RegraRoteamento | undefined {
  const ativas = (cfg.regras ?? []).filter((r) => r.ativo);
  return ativas.find((r) => r.eventoOrigem === eventoOrigem) ?? ativas.find((r) => r.eventoOrigem === '*');
}

/**
 * Sobrescreve o arquivo inteiro com o que veio.
 *
 * ⚠️ É gravação CEGA: não lê o disco antes. Serve para quem já montou o objeto
 * final a partir de uma leitura feita na MESMA fila. Para qualquer
 * read-modify-write use `atualizarIntegracoes` — senão o defeito B2 volta.
 */
export async function salvarIntegracoes(dados: Integracoes) {
  await naFila(ARQ_INTEGRACOES, () => gravarJson(ARQ_INTEGRACOES, dados));
  return dados;
}

/**
 * O ÚNICO lugar que troca o segredo de entrada (B1-g).
 *
 * Chamado só pelo `POST /api/integracoes`, ou seja, por um clique humano no
 * botão do console. Nenhum caminho de leitura, de falha ou de restauração
 * chega aqui.
 */
export async function novoSegredoEntrada(): Promise<string> {
  const salva = await atualizarIntegracoes((atual) => {
    atual.entrada.segredo = crypto.randomUUID();
  });
  return salva.entrada.segredo;
}

/**
 * Gira a chave publica da tag. Invalida a anterior na hora.
 *
 * Diferente de `novoSegredoEntrada`, isto NAO derruba a entrega de vendas: o
 * webhook do xWinner autentica pelo segredo de entrada, que nao e tocado aqui.
 * O custo de girar e o cliente precisar colar o codigo novo no site — ate la a
 * tag dele para de coletar navegacao, mas nenhum Purchase se perde.
 */
export async function novaChaveTag(): Promise<string> {
  const salva = await atualizarIntegracoes((atual) => {
    atual.tag.chave = gerarChaveTag();
  });
  return salva.tag.chave;
}

/** Comparacao em tempo constante — evita vazar o segredo por timing. */
export function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(String(recebido ?? ''));
  const b = Buffer.from(String(esperado ?? ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
