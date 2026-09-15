import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import type { ClassificacaoEvento, MotivoIgnorar } from './parser';
import type { MotivoDeTeste } from './deteccao-de-teste';
import { ehCompra } from './inbox-resumo';
import { sinaisDoPayload } from './inbox-sinais';
import { gravarAtomico, naFila } from './arquivo-atomico';
import { EMPRESA_DEFAULT_ID } from './config-store';

/**
 * Caixa de entrada de webhooks.
 *
 * Por que existe: hoje o operador copia o JSON do n8n/Bitrix na mao e cola no
 * console. E o passo mais lento e e onde o fbc se perde. Com a caixa de
 * entrada, o payload chega inteiro e vira um clique.
 *
 * Persistencia: logs/inbox.jsonl (append-only, ja no .gitignore por conter
 * dados de comprador) + um buffer em memoria para a listagem e o SSE.
 */

const DIR = path.join(process.cwd(), 'logs');
const ARQ = path.join(DIR, 'inbox.jsonl');
/**
 * Status e resultados vao para um segundo arquivo, tambem append-only. Reescrever
 * o inbox.jsonl a cada mudanca de status corromperia o historico num restart no
 * meio da escrita — e sem persistir, todo item voltava a "novo" depois do deploy,
 * abrindo espaco para disparar de novo a mesma venda.
 */
const ARQ_EVENTOS = path.join(DIR, 'inbox-resultados.jsonl');
/**
 * Quantos itens da caixa ficam em memoria.
 *
 * 1000 desde o plano do painel: a contagem dos cards e a lista aberta pelo
 * clique vem daqui, e 100 nao cobre 30 dias.
 */
const LIMITE_MEMORIA = 1000;

export type StatusEntrada = 'novo' | 'carregado' | 'disparado' | 'ignorado';

/**
 * O resultado de um disparo, por pixel (P-12).
 *
 * `marcaId` diz QUAL cadastro deste app foi usado; `pixelId` diz PARA ONDE a
 * conversao foi. Sao coisas diferentes, e so a segunda sobrevive ao cadastro
 * ser apagado: `marca_lx8k2p` nao existe fora daqui, o ID do Pixel existe no
 * Gerenciador de Eventos da Meta.
 *
 * `pixelId` e OPCIONAL porque este tipo tambem descreve o que ja esta gravado
 * em `logs/inbox-resultados.jsonl`, escrito antes de o campo existir. Nenhuma
 * linha antiga e reescrita: a tela le a ausencia e mostra "Pixel removido" sem
 * numero. Ausencia = comportamento de hoje.
 */
export interface ResultadoPorPixel {
  marcaId: string;
  /** Ausente em registro antigo. Presente em tudo que for gravado agora. */
  pixelId?: string;
  status: string;
  httpStatus?: number;
  eventsReceived?: number;
  fbtraceId?: string;
  erro?: string;
  modoTeste?: boolean;
  herdados?: string[];
  emq?: number;
}

export interface ItemInbox {
  id: string;
  recebidoEm: string;
  origem: string;
  /**
   * Empresa dona da entrega, resolvida pela CREDENCIAL que chegou (o segredo
   * do webhook, a chave da tag) — nunca pela empresa aberta no navegador: do
   * outro lado de um webhook nao ha navegador nenhum.
   *
   * Opcional porque item gravado antes desta fase nao tem o campo, e a
   * ausencia significa `default`. A ausencia e resolvida na LEITURA, como a
   * de `nomeCliente`: nenhuma linha antiga e reescrita.
   */
  empresaId?: string;
  /** Nome do evento detectado pelo parser. */
  evento?: string;
  valor?: number;
  moeda?: string;
  /**
   * Nome do cliente, COMPLETO e sem mascara.
   *
   * O e-mail continua mascarado (`emailMascarado`) porque e-mail e credencial
   * de acesso; nome nao e. O operador precisa do nome inteiro para achar a
   * pessoa no backoffice antes de decidir disparar — que e exatamente a
   * pergunta que a caixa de entrada existe para responder.
   *
   * Opcional: todo item gravado antes desta fase nao tem o campo. A ausencia e
   * resolvida na leitura (ver `carregarDoDisco`), nunca reescrevendo o arquivo.
   */
  nomeCliente?: string;
  /** E-mail mascarado. O valor inteiro fica so no payload. */
  emailMascarado?: string;
  orderId?: string;
  temFbc: boolean;
  temFbp: boolean;
  /**
   * Atribuicao de CLIQUE, que nao e a mesma coisa que `temFbc`/`temFbp`.
   *
   * `temFbc`/`temFbp` dizem que o cookie do navegador viajou. `temFbclid` diz
   * que existe o parametro que a Meta usa para atribuir ao criativo exato — e e
   * essa a pergunta que o operador faz antes de um disparo em lote ("estas
   * vendas vieram de anuncio?"). `temGclid` marca trafego do Google: serve para
   * conferencia de gasto e NUNCA decide disparo para a Meta.
   *
   * Opcionais pelo mesmo motivo de `nomeCliente`: item antigo nao tem.
   */
  temFbclid?: boolean;
  temGclid?: boolean;
  /** Sinal booleano do ttclid (TikTok Ads), nunca o valor. */
  temTtclid?: boolean;
  /** Sinal booleano do msclkid (Microsoft Ads), nunca o valor. */
  temMsclkid?: boolean;
  emq?: number;
  status: StatusEntrada;
  payload: unknown;
  /** Nome do evento como veio da plataforma (ex.: purchase_approved). */
  eventoOrigem?: string;
  /** Evento da Meta que a regra escolheu. */
  eventoMeta?: string;
  regraId?: string;
  /**
   * Modo que a REGRA pediu, escalar, como sempre foi.
   *
   * Continua sendo gravado — `logs/inbox.jsonl` e append-only e toda a tela
   * atual le este campo. O que ele NAO diz mais, desde a FASE 6, e o que
   * aconteceu de fato: com dois Pixels de destino, um pode ter saido sozinho e
   * o outro ter ficado na fila. Quem precisa do resultado le `modoPorMarca`.
   */
  modo?: 'auto' | 'fila' | 'ignorar';
  /**
   * Modo efetivo POR MARCA, depois de aplicar a trava do Pixel (§9.4.3).
   *
   * Aditivo: ausente em todo item gravado antes da FASE 6, e a tela trata a
   * ausencia caindo de volta em `modo`. Nunca reescrevemos linha antiga.
   */
  modoPorMarca?: Record<string, 'auto' | 'fila'>;
  /**
   * Por que a marca ficou na fila. So texto de tela: nenhuma decisao le isto.
   *
   * O vocabulario e fechado e vive em `modo-por-marca.ts` (`MotivoFila`);
   * aqui ele aparece por extenso porque `inbox.ts` descreve um formato de
   * arquivo, e um formato de arquivo nao deve importar o motor que o escreve.
   */
  motivoFila?: Record<string, 'regra-em-fila' | 'auto-do-pixel-desligado' | 'sem-token'>;
  /** false quando o nome do evento nao esta no catalogo conhecido. */
  conhecido?: boolean;
  /* --- campos de leitura: explicam a decisao, nao mudam roteamento nenhum --- */
  /** Como o parser classificou o nome do evento. */
  classificacao?: ClassificacaoEvento;
  /** Por que nada foi enviado. Separa 'regra' de 'sem equivalente' e de 'teste'. */
  motivoIgnorar?: MotivoIgnorar;
  /** true para o botao "Testar" da plataforma (ping): entrega OK, nada a enviar. */
  testePlataforma?: boolean;
  /** true quando o payload e de teste da equipe (cupom de R$ 0,01, @example.com). */
  testeInterno?: boolean;
  /**
   * Por que o console achou que isto e teste. Preenchido junto com
   * `testeInterno` e tambem — e SO ai esta a novidade — quando ele NAO e teste
   * mas ficou sob suspeita (o mesmo e-mail em varias compras).
   *
   * 🔴 Suspeita NAO e `testeInterno`. Item suspeito continua contando nas
   * metricas e continua disparavel por clique; o que ele perde e o direito de
   * sair sozinho. Fundir os dois campos faria uma venda real que so PARECE
   * teste sumir das porcentagens — e o produto existe para nao perder venda.
   */
  motivoDeTeste?: MotivoDeTeste;
  /** Frase pronta explicando a marca acima. Texto de tela, em portugues. */
  explicacaoDeTeste?: string;
  /**
   * true = o automatico foi barrado por suspeita e o item esperou clique humano.
   * Gravado no recebimento para a tela conseguir dizer POR QUE aquela venda
   * ficou na fila num dia em que o automatico estava ligado.
   */
  autoBloqueadoPorSuspeita?: boolean;
  /** Formato do payload reconhecido: A (plataforma, ex. xWinner), B (gateway) ou outro. */
  formato?: 'A' | 'B' | 'outro';
  /** Apelido que veio na URL. null = chegou pela URL antiga, de um segmento so. */
  rotuloRecebido?: string | null;
  /** true quando o apelido da URL difere do configurado. Nunca recusa a entrega. */
  rotuloDivergente?: boolean;
  /** Palpite da heuristica para nome novo. Texto de tela: nao e disparavel. */
  eventoMetaSugerido?: string;
  /** Um resultado por pixel, preenchido depois do disparo. */
  resultados?: unknown[];
}

let memoria: ItemInbox[] = [];
let carregado = false;

type Ouvinte = (item: ItemInbox, tipo: 'novo' | 'atualizado') => void;
const ouvintes = new Set<Ouvinte>();

export function assinar(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/**
 * Avisa TODOS os ouvintes do SSE, sem filtro nenhum: item ignorado, teste da
 * plataforma e nome desconhecido tambem sobem para a tela. O operador pediu
 * para ver tudo o que chega — esconder o ignorado e o que faz parecer que o
 * canal morreu.
 */
function avisar(item: ItemInbox, tipo: 'novo' | 'atualizado') {
  for (const fn of ouvintes) {
    try {
      fn(item, tipo);
    } catch {
      /* um ouvinte quebrado nao derruba o recebimento */
    }
  }
}

export function mascararEmail(email?: string): string | undefined {
  if (!email || !email.includes('@')) return undefined;
  const [usuario, dominio] = email.split('@');
  const visivel = usuario.slice(0, 2);
  return `${visivel}${'*'.repeat(Math.max(1, usuario.length - 2))}@${dominio}`;
}

/**
 * A leitura EM VOO, para quem chegar no meio dela esperar em vez de passar reto.
 *
 * 🔴 Corrige uma corrida que só aparecia com duas chamadas simultâneas. O antigo
 * `carregado = true` ficava ANTES do `await fs.readFile`: quem entrasse no
 * mesmo tick via a trava já levantada, voltava na hora e lia `memoria` ainda
 * vazia. Com uma requisição por vez ninguém via nada; com o Painel e a caixa de
 * entrada carregando juntos na primeira tela, o Painel mostrava "0 eventos" —
 * mentira de tela, e da pior espécie, porque um F5 a desfazia.
 */
let leituraEmVoo: Promise<void> | null = null;

async function carregarDoDisco() {
  if (carregado) return;
  if (leituraEmVoo) return leituraEmVoo;
  leituraEmVoo = lerTudoDoDisco().finally(() => {
    leituraEmVoo = null;
  });
  return leituraEmVoo;
}

async function lerTudoDoDisco() {
  try {
    const txt = await fs.readFile(ARQ, 'utf8');
    memoria = txt
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as ItemInbox;
        } catch {
          return null;
        }
      })
      .filter((x): x is ItemInbox => x !== null)
      .slice(-LIMITE_MEMORIA);

    // Retrofit dos sinais em item antigo, SO EM MEMORIA.
    //
    // `logs/inbox.jsonl` e append-only e e o historico de vendas reais: reescrever
    // o arquivo para encaixar campo novo trocaria um beneficio de tela por um
    // risco de corromper o registro num restart no meio da escrita. O payload
    // inteiro ja esta em cada linha, entao o calculo e local e barato — e so
    // acontece uma vez por processo, porque `carregado` trava a releitura.
    //
    // `temFbclid === undefined` e o marcador de "linha de antes desta fase";
    // preenchemos apenas o que falta, para nunca sobrescrever o que o
    // recebimento ja tinha decidido.
    // Item gravado entre a FASE B (13/09) e o plano do painel ja tem
    // `temFbclid` mas NAO tem `temTtclid`: por isso o `continue` exige os dois
    // marcadores, e cada atribuicao e protegida por `=== undefined`.
    for (const item of memoria) {
      if (item.temFbclid !== undefined && item.temTtclid !== undefined) continue;
      const sinais = sinaisDoPayload(item.payload);
      if (item.temFbclid === undefined) item.temFbclid = sinais.temFbclid;
      if (item.temGclid === undefined) item.temGclid = sinais.temGclid;
      if (item.temTtclid === undefined) item.temTtclid = sinais.temTtclid;
      if (item.temMsclkid === undefined) item.temMsclkid = sinais.temMsclkid;
      if (item.nomeCliente === undefined && sinais.nomeCliente) {
        item.nomeCliente = sinais.nomeCliente;
      }
    }
  } catch {
    memoria = [];
  }

  // Reaplica status e resultados gravados depois do recebimento.
  try {
    const txt = await fs.readFile(ARQ_EVENTOS, 'utf8');
    const porId = new Map(memoria.map((i) => [i.id, i]));
    for (const l of txt.split('\n')) {
      if (!l) continue;
      try {
        const e = JSON.parse(l) as { tipo: string; id: string; status?: StatusEntrada; resultados?: ResultadoPorPixel[] };
        const item = porId.get(e.id);
        if (!item) continue;
        if (e.tipo === 'status' && e.status) item.status = e.status;
        if (e.tipo === 'resultado' && e.resultados) item.resultados = e.resultados;
      } catch {
        /* linha corrompida */
      }
    }
  } catch {
    /* ainda nao houve disparo nenhum */
  }

  // A trava só sobe no FIM, com `memoria` já preenchida. Se a leitura lançar
  // antes daqui, `carregado` continua `false` e a próxima chamada tenta de novo
  // — melhor do que travar o processo inteiro numa caixa de entrada vazia.
  carregado = true;
}

async function anotar(registro: Record<string, unknown>) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(ARQ_EVENTOS, JSON.stringify({ ...registro, em: new Date().toISOString() }) + '\n', 'utf8');
}

export async function registrarEntrada(
  entrada: Omit<ItemInbox, 'id' | 'recebidoEm' | 'status'> &
    Partial<Pick<ItemInbox, 'status'>>
): Promise<ItemInbox> {
  await carregarDoDisco();

  // Espalha primeiro e deriva depois: com `...entrada` no fim, um chamador que
  // passe `status: undefined` explicitamente apagava o padrao e gravava item sem
  // status — que a tela nao sabe pintar.
  const item: ItemInbox = {
    ...entrada,
    id: crypto.randomUUID(),
    recebidoEm: new Date().toISOString(),
    status: entrada.status ?? 'novo',
  };

  memoria.push(item);
  if (memoria.length > LIMITE_MEMORIA) memoria = memoria.slice(-LIMITE_MEMORIA);

  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(ARQ, JSON.stringify(item) + '\n', 'utf8');

  avisar(item, 'novo');

  return item;
}

/**
 * Quantas COMPRAS ja existem na caixa com este mesmo e-mail — o numero que
 * `avaliarTeste` usa para desconfiar de um checkout sendo martelado.
 *
 * 🔴 A chave e o e-mail MASCARADO, e isso e o ponto. `mascararEmail` e
 * deterministica (`jairo@x.com` sempre vira `ja***@x.com`), entao ela serve de
 * chave de agrupamento sem que e-mail em texto claro precise existir em lugar
 * nenhum alem do payload que ja esta gravado. Somar por e-mail cru obrigaria a
 * decifrar 1000 payloads a cada webhook, e ainda espalharia PII pela memoria.
 *
 * O preco e uma colisao teorica: dois e-mails com as mesmas duas primeiras
 * letras E o mesmo dominio (`joao@x.com` e `jose@x.com`) contam juntos. Como o
 * resultado de uma suspeita e "espera um clique humano" — nunca "descarta" —,
 * o pior caso e uma venda a mais na fila, que e o lado seguro do erro.
 *
 * Nao conta o item que esta chegando: quem chama soma 1 se quiser incluir.
 */
export async function contarComprasDoEmail(
  emailMascarado: string | undefined,
  empresaId?: string
): Promise<number> {
  if (!emailMascarado) return 0;
  await carregarDoDisco();
  let n = 0;
  for (const i of memoria) {
    if (i.emailMascarado !== emailMascarado) continue;
    if (empresaId !== undefined && (i.empresaId ?? EMPRESA_DEFAULT_ID) !== empresaId) continue;
    // `ehCompra` olha o evento da Meta, a mesma regua do painel: duas contas de
    // "compra" diferentes no mesmo produto seriam duas respostas para a mesma
    // pergunta.
    if (ehCompra(i)) n++;
  }
  return n;
}

/**
 * A caixa, do mais novo para o mais velho.
 *
 * SEM `empresaId` devolve TUDO, de proposito: o disparo automatico e os testes
 * leem a caixa inteira, e filtrar por padrao esconderia item deles. Quem
 * desenha tela passa o `empresaId` e ve so o que e da empresa aberta.
 */
export async function listarEntradas(limite = 50, empresaId?: string): Promise<ItemInbox[]> {
  await carregarDoDisco();
  const base =
    empresaId === undefined
      ? memoria
      : memoria.filter((i) => (i.empresaId ?? EMPRESA_DEFAULT_ID) === empresaId);
  return [...base].reverse().slice(0, limite);
}

export async function acharEntrada(id: string): Promise<ItemInbox | undefined> {
  await carregarDoDisco();
  return memoria.find((i) => i.id === id);
}

export async function marcarStatus(id: string, status: StatusEntrada) {
  await carregarDoDisco();
  const item = memoria.find((i) => i.id === id);
  if (!item) return undefined;
  item.status = status;
  await anotar({ tipo: 'status', id, status }).catch(() => {});
  avisar(item, 'atualizado');
  return item;
}

/** Guarda o resultado por pixel do disparo e avisa a tela pelo SSE. */
export async function anotarResultado(id: string, resultados: ResultadoPorPixel[]) {
  await carregarDoDisco();
  const item = memoria.find((i) => i.id === id);
  if (!item) return undefined;
  item.resultados = resultados;
  await anotar({ tipo: 'resultado', id, resultados }).catch(() => {});
  avisar(item, 'atualizado');
  return item;
}

/**
 * Esvazia a caixa.
 *
 * SEM `empresaId` e o comportamento de sempre: os dois arquivos somem.
 *
 * COM `empresaId` saem so as linhas daquela empresa. Aqui a reescrita e
 * inevitavel (o append-only nao sabe apagar), entao ela passa por
 * `gravarAtomico`: tmp + fsync + rename. Ou fica o arquivo velho inteiro ou o
 * novo inteiro — um restart no meio nunca deixa o historico de venda pela
 * metade, que e o motivo pelo qual `inbox.jsonl` evita reescrita no resto do
 * modulo.
 *
 * `inbox-resultados.jsonl` nao carrega `empresaId` (cada linha so referencia o
 * id do item), por isso a limpeza dele e pelos ids que sairam.
 *
 * 🔴 Linha corrompida NUNCA e descartada: sem conseguir ler o dono, apagar
 * seria apostar que ela era desta empresa — e o historico de outra empresa nao
 * pode pagar por um palpite.
 */
export async function limparEntradas(empresaId?: string) {
  await carregarDoDisco();

  if (empresaId === undefined) {
    memoria = [];
    try {
      await fs.rm(ARQ, { force: true });
      await fs.rm(ARQ_EVENTOS, { force: true });
    } catch {
      /* arquivo pode nem existir */
    }
    return;
  }

  await naFila(ARQ, async () => {
    // Le do DISCO, nao de `memoria`: a memoria guarda so os ultimos 100 itens,
    // e reescrever o arquivo a partir dela apagaria todo o resto do historico.
    let linhas: string[];
    try {
      linhas = (await fs.readFile(ARQ, 'utf8')).split('\n').filter(Boolean);
    } catch {
      return; // nada gravado ainda
    }

    const apagados = new Set<string>();
    const mantidas: string[] = [];
    for (const l of linhas) {
      let item: ItemInbox | null = null;
      try {
        item = JSON.parse(l) as ItemInbox;
      } catch {
        item = null;
      }
      if (item && (item.empresaId ?? EMPRESA_DEFAULT_ID) === empresaId) {
        apagados.add(item.id);
        continue;
      }
      mantidas.push(l);
    }
    if (!apagados.size) return;

    /**
     * Nao sobrou linha nenhuma: o arquivo SAI do disco, nao fica com zero byte.
     *
     * E o contrato que a tela e o teste C20 ja tinham antes desta fase — "e ai
     * sim os dois .jsonl foram apagados" —, e enquanto existir so a empresa
     * padrao (que e o caso da producao hoje) este e exatamente o caminho que o
     * botao de limpar percorre. Escopar a limpeza por empresa nao pode mudar,
     * de lambuja, o que o operador ve depois de confirmar.
     */
    if (!mantidas.length) {
      await fs.rm(ARQ, { force: true });
    } else {
      await gravarAtomico(ARQ, mantidas.map((l) => l + '\n').join(''));
    }

    try {
      const eventos = (await fs.readFile(ARQ_EVENTOS, 'utf8')).split('\n').filter(Boolean);
      const sobrou = eventos.filter((l) => {
        try {
          return !apagados.has((JSON.parse(l) as { id?: string }).id ?? '');
        } catch {
          return true;
        }
      });
      if (sobrou.length !== eventos.length) {
        if (!sobrou.length) {
          await fs.rm(ARQ_EVENTOS, { force: true });
        } else {
          await gravarAtomico(ARQ_EVENTOS, sobrou.map((l) => l + '\n').join(''));
        }
      }
    } catch {
      /* ainda nao houve disparo nenhum */
    }

    memoria = memoria.filter((i) => !apagados.has(i.id));
  });
}
