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

// Mesmo motivo: so a FORMA da lista de testes interessa aqui. A regra que decide
// quem e teste mora em `deteccao-de-teste.ts` e e usada tambem pelo navegador.
import type { ListaDeTeste } from './deteccao-de-teste';

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

/* ------------------------------------------------------------------ */
/* Empresa dona do Pixel (FASE D)                                      */
/* ------------------------------------------------------------------ */

/**
 * A empresa que sempre existe: a instalação que já roda hoje.
 *
 * O registro de empresas mora em `empresas.ts`, e não aqui — mas o ID da
 * padrão e a cerca do formato precisam morar NESTE arquivo, porque é ele que
 * filtra Pixel por empresa e `empresas.ts` já importa daqui. Definir os dois
 * lá e importar de volta fecharia um ciclo; definir os dois nos DOIS lugares
 * criaria a segunda fonte de verdade que sempre diverge.
 *
 * `empresas.ts` reexporta estes três símbolos para quem lê o registro: quem
 * trabalha com empresas continua importando de lá.
 */
export const EMPRESA_DEFAULT_ID = 'default';

/**
 * 🔴 Esta expressão é uma CERCA, não uma preferência de estilo.
 *
 * O id de empresa vira NOME DE ARQUIVO na FASE E (`integracoes.<id>.json`).
 * Sem a cerca, um id com `../` viajaria até um `path.join` e passaria perto de
 * `config/integracoes.json` — o arquivo que guarda o segredo pelo qual a venda
 * entra hoje (E-4). Letras, números, `_` e `-`, começando por alfanumérico, no
 * máximo 40 caracteres.
 */
const RE_ID_EMPRESA = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

export function idDeEmpresaValido(id: unknown): id is string {
  return typeof id === 'string' && RE_ID_EMPRESA.test(id);
}


const DIR = path.join(process.cwd(), 'config');
const ARQ_MARCAS = path.join(DIR, 'marcas.json');

/**
 * 🔴 O arquivo da empresa PADRÃO continua sendo `config/integracoes.json`.
 *
 * Não é detalhe de nomenclatura: é a regra E-4 do plano. Aquele arquivo guarda
 * o segredo com que a plataforma de vendas entrega HOJE, e a URL derivada dele
 * já está cadastrada num backoffice que ninguém deste lado controla. Renomeá-lo
 * para `integracoes.default.json` derrubaria a entrada de venda no primeiro
 * redeploy — e a plataforma não avisa, ela só para de conseguir entregar.
 *
 * Empresa nova ganha `config/integracoes.<id>.json`. O `<id>` passou pela cerca
 * `RE_ID_EMPRESA` (letras, números, `_`, `-`), e é ela que impede um `../` de
 * transformar este `path.join` em escrita por cima do arquivo de cima.
 */
export function arquivoIntegracoes(empresaId: string = EMPRESA_DEFAULT_ID): string {
  if (empresaId === EMPRESA_DEFAULT_ID || !idDeEmpresaValido(empresaId)) {
    return path.join(DIR, 'integracoes.json');
  }
  return path.join(DIR, `integracoes.${empresaId}.json`);
}

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
  /**
   * 🔴 Disparo automatico DESTE Pixel. OPCIONAL de proposito, e AUSENTE = DESLIGADO.
   *
   * Todas as marcas gravadas antes da FASE 6 nao tem o campo. Qualquer leitura
   * que trate a ausencia como "ligado" liga o automatico de TODOS os Pixels ja
   * existentes no primeiro boot depois do deploy — e o sistema nunca disparou
   * automaticamente em producao (9.1.1: 0 regras em `auto`).
   *
   * A UNICA leitura aceita, em qualquer lugar do codigo, e:
   *
   *     marca?.autoDisparo === true
   *
   * PROIBIDOS: `!!marca.autoDisparo`, `marca.autoDisparo ?? true`,
   * `marca.autoDisparo !== false`. Os tres ligam quando o campo falta.
   * Regra 1 de 9.5.1 — item de revisao de codigo, nao preferencia de estilo.
   */
  autoDisparo?: boolean;
  /**
   * Empresa dona deste Pixel. OPCIONAL de propósito: ausente = empresa padrão.
   *
   * Todo Pixel gravado antes da FASE D não tem o campo, e todos eles são do
   * dono do console — que é exatamente a empresa padrão. Nunca leia este campo
   * cru: use `empresaDaMarca(m)`, que aplica a ausência e a cerca de formato.
   */
  empresaId?: string;
}

/**
 * De qual empresa é este Pixel. ÚNICA leitura aceita de `Marca.empresaId`.
 *
 * Três regras, nesta ordem:
 *
 *  1. 🔴 a marca `default` (a implícita, vinda do `.env`) é SEMPRE da empresa
 *     padrão, venha o que vier gravado: ela é o Pixel do dono do console;
 *  2. id gravado fora do formato é tratado como ausente — um valor estranho
 *     deixa o Pixel na empresa padrão, que é a direção segura, em vez de criar
 *     um grupo órfão sem tela que o mostre;
 *  3. ausente = empresa padrão (E-3: campo novo é sempre opcional na leitura e
 *     tem valor derivado quando falta).
 */
export function empresaDaMarca(m: Marca): string {
  if (m.id === 'default') return EMPRESA_DEFAULT_ID;
  return idDeEmpresaValido(m.empresaId) ? m.empresaId : EMPRESA_DEFAULT_ID;
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
  /**
   * Booleano FIRME, nunca opcional: o cliente recebe sempre `true` ou `false`.
   * A normalizacao acontece aqui, na borda, para que nenhuma tela precise
   * decidir o que fazer com `undefined` — e para que nenhuma tela seja tentada
   * a usar `?? true` (9.A, 9.5.1).
   */
  autoDisparo: boolean;
  /**
   * Empresa dona, já resolvida por `empresaDaMarca()` — nunca opcional, pelo
   * mesmo motivo de `autoDisparo`: a normalização acontece na borda, e nenhuma
   * tela precisa decidir o que fazer com `undefined`.
   */
  empresaId: string;
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
    // === true e o ponto inteiro. Ver o JSDoc de `Marca.autoDisparo`.
    autoDisparo: m.autoDisparo === true,
    empresaId: empresaDaMarca(m),
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

/**
 * O que sobrou depois de tentar o arquivo e, se preciso, o `.bak`.
 *
 * Exportado (junto de `lerComBackup`) porque `empresas.ts` mantinha uma cópia
 * privada deste par — e duas cópias da regra "ausente ≠ ilegível" é a forma
 * mais fácil de uma delas, um dia, voltar a tratar arquivo quebrado como
 * arquivo novo. Que é o defeito B1 inteiro.
 */
export type Leitura<T> =
  | { estado: 'ok'; dados: T }
  /** O arquivo não servia e o `.bak` serviu — restaurar e registrar (B1-e). */
  | { estado: 'restaurado'; dados: T }
  /** Nem o arquivo nem o `.bak` existem: primeira subida, volume novo (B1-f). */
  | { estado: 'ausente' }
  /** Existe e está quebrado, e o `.bak` também. Modo degradado (B1-e). */
  | { estado: 'indisponivel'; motivo: string };

export async function lerComBackup<T>(
  arquivo: string,
  valido?: (d: T) => boolean
): Promise<Leitura<T>> {
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
    /**
     * B3-d: a marca implicita nasce DESLIGADA, e isso e escrito de proposito.
     *
     * Sem `marcas.json` em disco (primeiro boot, volume novo, restauracao de
     * backup) esta e a UNICA marca que existe. Omitir o campo daria o mesmo
     * resultado hoje, porque `autoDisparo === true` ja e falso para
     * `undefined` — mas o `false` escrito aqui e o que continua desligado
     * se alguem, la na frente, escrever um `?? true` por engano.
     */
    autoDisparo: false,
  };
}

/**
 * Os Pixels. Com `empresaId`, só os daquela empresa (D.1.2).
 *
 * O parâmetro é OPCIONAL e a ausência dele devolve TUDO — e isso é deliberado.
 * Quem chama sem argumento (`auto-dispatch`, `modo-por-marca`, o handler do
 * webhook, o de tag) precisa enxergar todos os Pixels: um evento que chega pelo
 * webhook é resolvido pela CREDENCIAL apresentada, não pela empresa que o
 * operador está olhando no navegador. Filtrar por padrão faria uma venda de um
 * cliente sumir só porque a aba estava aberta em outro — e conversão perdida
 * não volta atrás.
 *
 * Quem passa o argumento é a tela: `GET /api/marcas`, com a empresa ativa.
 */
export async function listarMarcas(empresaId?: string): Promise<Marca[]> {
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

  const todas = [padrao, ...salvas.filter((m) => m.id !== 'default')];
  if (empresaId === undefined) return todas;
  return todas.filter((m) => empresaDaMarca(m) === empresaId);
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

    /**
     * `empresaId` gravado passa pela cerca de formato ANTES do disco.
     *
     * Um id fora do formato é IGNORADO, nunca coagido: o Pixel fica onde estava
     * (ou na empresa padrão, se é novo). O `...entrada` acima já teria copiado
     * o valor cru, então a atribuição explícita abaixo é o que fecha a porta —
     * `undefined` some do arquivo no `JSON.stringify`, que é o que queremos
     * para um Pixel da empresa padrão.
     */
    const empresaId = idDeEmpresaValido(entrada.empresaId) ? entrada.empresaId : base.empresaId;

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
      empresaId,
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
   * a plataforma e nunca sai do servidor. Se o segredo fosse parar na tag,
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
  /**
   * Quem e testador, na palavra do operador.
   *
   * O console ja reconhecia sozinho o padrao obvio (`@example.com`,
   * `evt_preview…`, cupom de centavos). O que ele NAO tinha como adivinhar e o
   * e-mail pessoal que o testador da equipe usa para bater no checkout — esse
   * so a pessoa que opera sabe, e e por isso que ele se cadastra aqui.
   *
   * 🔴 Opcional de proposito, e `lerListaDeTeste` trata ausencia como lista
   * vazia. Instalacao que nunca abriu a tela nao pode quebrar, e um arquivo
   * editado a mao sem o bloco tem que continuar entregando venda.
   *
   * Nada aqui e credencial: sao nomes e e-mails de gente da propria equipe, e o
   * arquivo ja vive em `config/`, fora do git (regra 2 do CLAUDE.md).
   */
  testes?: ListaDeTeste;
}

/* ------------------------------------------------------------------ */
/* Rotulo do endpoint de entrada (apelido publico, nao credencial)     */
/* ------------------------------------------------------------------ */

/**
 * Rotulo da empresa `default`, e NAO um nome a manter generico: este valor ja
 * faz parte de uma URL de webhook publicada e cadastrada na plataforma agora,
 * entregando venda de verdade. Mudar a string derruba aquele endpoint — e
 * historico, nao vocabulario de tela.
 */
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
 * As sementes de UMA empresa (D-14).
 *
 * Para a empresa padrao: as sementes do webhook mais as da tag, numa lista so.
 * Existe para a mesclagem de `lerIntegracoes` enxergar as duas origens de uma
 * vez. Se a tag ficasse de fora, a instalacao que ja roda na VPS receberia
 * 'tag.pageview' sem regra nenhuma: o evento cairia no fallback invisivel e o
 * operador nao teria onde ver, na tela, por que o PageView nao chega na Meta.
 *
 * 🔴 Para QUALQUER OUTRA empresa, `REGRAS_SEMENTE()` fica de fora, e o motivo
 * e o proprio conteudo dela: 'precheckout_opened', 'purchase_approved',
 * 'commission_reversed' sao o vocabulario de UMA plataforma de vendas, o
 * xWinner. Semear isso no console de um cliente que usa outra plataforma
 * entrega 40 regras para eventos que nunca vao chegar — o operador abre a tela
 * de Integracoes e tem que decidir, uma a uma, sobre nomes que nao existem no
 * sistema dele. A tag do navegador e o `ping` ficam porque sao deste console,
 * nao da plataforma: a tag e o nosso proprio script, e `ping` e o que quase
 * todo backoffice manda no botao "Testar" — nao e conversao e nao pode virar
 * evento ficticio (regra 1 do CLAUDE.md).
 *
 * Sem este parametro, `resolverIntegracoes` reinjetava as 40 regras do xWinner
 * na PRIMEIRA leitura de uma empresa nova, desfazendo em silencio o que
 * `criarIntegracoesDaEmpresa` tinha acabado de gravar.
 */
function todasSementes(empresaId: string = EMPRESA_DEFAULT_ID): RegraRoteamento[] {
  if (empresaId === EMPRESA_DEFAULT_ID) {
    return [...REGRAS_SEMENTE(), ...regrasSementeTag()];
  }
  return [...regrasSementeTag(), regra('r-ping', 'ping', '', 'ignorar')];
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

/**
 * Configuração de estreia. `rotulo` é parâmetro porque ele vira o CAMINHO da
 * URL de webhook (`/api/webhook/in/<rotulo>`): duas empresas nascendo com
 * `xwinner-codigo-vencedor` dariam a mesma URL para clientes diferentes.
 */
const INTEGRACOES_PADRAO = (
  rotulo: string = ROTULO_PADRAO,
  empresaId: string = EMPRESA_DEFAULT_ID
): Integracoes => ({
  entrada: { segredo: crypto.randomUUID(), modo: 'fila', rotulo },
  regras: todasSementes(empresaId),
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
async function resolverIntegracoes(
  empresaId: string = EMPRESA_DEFAULT_ID
): Promise<Integracoes> {
  const arquivo = arquivoIntegracoes(empresaId);
  /**
   * O apelido de reserva é o ID DA EMPRESA, nunca `ROTULO_PADRAO`.
   *
   * `ROTULO_PADRAO` é o apelido do endpoint que a plataforma do dono já tem
   * cadastrado. Dá-lo a uma empresa nova faria duas empresas responderem na
   * mesma URL — e a única coisa que as separaria seria o segredo, que é
   * justamente o que não se quer depender por engano.
   */
  const rotuloPadrao = empresaId === EMPRESA_DEFAULT_ID ? ROTULO_PADRAO : empresaId;
  const leitura = await lerComBackup<Integracoes>(arquivo, integracoesUtil);

  if (leitura.estado === 'indisponivel') {
    // NADA é gravado aqui. Regenerar seria trocar o segredo de entrada em
    // silêncio e derrubar a entrada de vendas (defeito B1).
    throw new ErroConfiguracaoIndisponivel(arquivo, leitura.motivo);
  }

  if (leitura.estado === 'ausente') {
    const nova = INTEGRACOES_PADRAO(rotuloPadrao, empresaId);
    await gravarJson(arquivo, nova);
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
      atual.regras = todasSementes(empresaId);
      mudou = true;
    } else {
      // A semente so roda em instalacao nova; em producao o arquivo ja existe.
      // Sem esta mesclagem, regra nova nunca apareceria na VPS. Acrescenta so o
      // que falta, por eventoOrigem: NUNCA sobrescreve regra existente — o
      // operador pode ter editado o modo a mao e a decisao dele vale mais.
      const existentes = new Set(atual.regras.map((r) => r.eventoOrigem));
      const novas = todasSementes(empresaId).filter((r) => !existentes.has(r.eventoOrigem));
      if (novas.length) {
        atual.regras.push(...novas);
        mudou = true;
      }
    }

    // Migracao do apelido do endpoint. Nao toca no segredo: a URL de um
    // segmento ja cadastrada na plataforma continua entregando igual.
    if (!atual.entrada.rotulo) {
      atual.entrada.rotulo = rotuloPadrao;
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

    // Migracao do bloco de testes, no mesmo molde do bloco da tag — com uma
    // diferenca deliberada: aqui NAO se grava nada quando o bloco falta.
    //
    // O bloco da tag precisa nascer porque tem uma chave dentro; este so tem
    // listas, e lista ausente ja significa "vazia" para `lerListaDeTeste`.
    // Gravar um `{ emails: [], nomes: [] }` inutil em toda instalacao existente
    // seria uma reescrita do arquivo que entrega venda, em troca de nada.
    //
    // O que se conserta e o bloco PRESENTE e torto (editado a mao, campo virou
    // string): ai a forma errada fica gravada certa, uma vez so.
    if (atual.testes && typeof atual.testes === 'object') {
      if (atual.testes.emails !== undefined && !Array.isArray(atual.testes.emails)) {
        atual.testes.emails = [];
        mudou = true;
      }
      if (atual.testes.nomes !== undefined && !Array.isArray(atual.testes.nomes)) {
        atual.testes.nomes = [];
        mudou = true;
      }
    } else if (atual.testes !== undefined) {
      // Veio como string, numero ou null. Some: `undefined` e a ausencia que o
      // resto do codigo ja sabe tratar.
      delete atual.testes;
      mudou = true;
    }

    if (!Array.isArray(atual.saida)) atual.saida = [];
    if (mudou) await gravarJson(arquivo, atual, { backup: !restaurado });
    return atual;
  }
}

/**
 * Configuração de integrações, já migrada. Passa pela fila do arquivo (B2-a)
 * porque ela PODE gravar (migração de regras, do rótulo e do bloco da tag).
 *
 * Lança `ErroConfiguracaoIndisponivel` quando o arquivo existe e nem ele nem o
 * `.bak` puderam ser lidos. Quem chama de uma rota deve devolver **503** (via
 * `erroDeRota`), nunca 401 — 401 faz a plataforma desistir da entrega.
 */
export async function lerIntegracoes(
  empresaId: string = EMPRESA_DEFAULT_ID
): Promise<Integracoes> {
  const arquivo = arquivoIntegracoes(empresaId);
  return naFila(arquivo, () => resolverIntegracoes(empresaId));
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
  mutador: (atual: Integracoes) => Integracoes | void | Promise<Integracoes | void>,
  empresaId: string = EMPRESA_DEFAULT_ID
): Promise<Integracoes> {
  const arquivo = arquivoIntegracoes(empresaId);
  // `naFila` é POR ARQUIVO: empresas diferentes não disputam fila entre si, e
  // duas escritas na mesma empresa continuam serializadas (defeito B2).
  return naFila(arquivo, async () => {
    const atual = await resolverIntegracoes(empresaId);
    const proposta = await mutador(atual);
    const nova = proposta ?? atual;
    await gravarJson(arquivo, nova);
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
export async function salvarIntegracoes(
  dados: Integracoes,
  empresaId: string = EMPRESA_DEFAULT_ID
) {
  const arquivo = arquivoIntegracoes(empresaId);
  await naFila(arquivo, () => gravarJson(arquivo, dados));
  return dados;
}

/**
 * O ÚNICO lugar que troca o segredo de entrada (B1-g).
 *
 * Chamado só pelo `POST /api/integracoes`, ou seja, por um clique humano no
 * botão do console. Nenhum caminho de leitura, de falha ou de restauração
 * chega aqui.
 */
export async function novoSegredoEntrada(
  empresaId: string = EMPRESA_DEFAULT_ID
): Promise<string> {
  const salva = await atualizarIntegracoes((atual) => {
    atual.entrada.segredo = crypto.randomUUID();
  }, empresaId);
  return salva.entrada.segredo;
}

/**
 * Gira a chave publica da tag. Invalida a anterior na hora.
 *
 * Diferente de `novoSegredoEntrada`, isto NAO derruba a entrega de vendas: o
 * webhook da plataforma autentica pelo segredo de entrada, que nao e tocado aqui.
 * O custo de girar e o cliente precisar colar o codigo novo no site — ate la a
 * tag dele para de coletar navegacao, mas nenhum Purchase se perde.
 */
export async function novaChaveTag(empresaId: string = EMPRESA_DEFAULT_ID): Promise<string> {
  const salva = await atualizarIntegracoes((atual) => {
    atual.tag.chave = gerarChaveTag();
  }, empresaId);
  return salva.tag.chave;
}

/**
 * Dá a uma empresa nova o próprio webhook, a própria tag e as próprias regras.
 *
 * 🔴 Recusa `default` e é IDEMPOTENTE: se o arquivo já existe, não encosta
 * nele. As duas travas apontam para o mesmo perigo — este é o único código novo
 * da FASE E que GRAVA um `integracoes.*`, e um erro aqui é um segredo de
 * entrada trocado em silêncio, que é a família do defeito B1. Chamar duas vezes
 * (o `PUT /api/empresas` é idempotente por id) não pode girar segredo nenhum.
 *
 * As sementes são só as da TAG mais o `ping` ignorado, e não as 50 do webhook:
 * aquelas nomeiam eventos do xWinner (`order.paid`, `pix.generated`…), e uma
 * empresa de Hotmart não deve nascer com 50 regras que nunca vão casar. A tag,
 * essa sim, é igual em qualquer site — e sem `tag.pageview` o PageView cairia
 * num fallback invisível.
 *
 * `rotulo: slug` porque o apelido vira o caminho da URL de webhook que o
 * operador vai copiar em Instalação (D-15).
 */
export async function criarIntegracoesDaEmpresa(e: {
  id: string;
  slug?: string;
}): Promise<Integracoes | null> {
  if (e.id === EMPRESA_DEFAULT_ID || !idDeEmpresaValido(e.id)) return null;

  const arquivo = arquivoIntegracoes(e.id);
  return naFila(arquivo, async () => {
    // Existência é checada DENTRO da fila: fora dela, duas criações simultâneas
    // passariam as duas pelo `catch` e a segunda giraria o segredo da primeira.
    try {
      await fs.access(arquivo);
      return null;
    } catch {
      /* não existe — é o caso que este método serve */
    }

    const nova: Integracoes = {
      entrada: {
        segredo: crypto.randomUUID(),
        modo: 'fila',
        rotulo: normalizarRotulo(e.slug?.trim() || e.id) || e.id,
      },
      // Mesma lista que a primeira leitura vai mesclar: duas definicoes de
      // "com o que a empresa nova nasce" divergem no primeiro dia em que
      // alguem mexer so numa delas.
      regras: todasSementes(e.id),
      saida: [],
      tag: { chave: gerarChaveTag(), dominios: [] },
    };
    await garantirDir();
    await gravarJson(arquivo, nova);
    return nova;
  });
}

/**
 * Aposenta o arquivo de integrações de uma empresa apagada (D-17).
 *
 * RENOMEIA para `.removido-<ts>` em vez de apagar. O arquivo carrega o segredo
 * de entrada e o histórico de regras de um cliente; se a remoção foi um clique
 * errado, o operador tem o arquivo ali para o dono restaurar à mão. Apagar de
 * verdade é irreversível e não devolve nada em troca — espaço em disco não é o
 * problema deste sistema.
 *
 * Ausência não é erro: uma empresa criada antes da FASE E (ou que nunca teve
 * arquivo) simplesmente não tem o que aposentar.
 */
export async function aposentarIntegracoesDaEmpresa(empresaId: string): Promise<boolean> {
  if (empresaId === EMPRESA_DEFAULT_ID || !idDeEmpresaValido(empresaId)) return false;

  const arquivo = arquivoIntegracoes(empresaId);
  return naFila(arquivo, async () => {
    try {
      await fs.rename(arquivo, `${arquivo}.removido-${Date.now()}`);
      return true;
    } catch {
      return false;
    }
  });
}

/** Comparacao em tempo constante — evita vazar o segredo por timing. */
export function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(String(recebido ?? ''));
  const b = Buffer.from(String(esperado ?? ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
