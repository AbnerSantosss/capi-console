import 'server-only';

import { NextRequest, NextResponse, after } from 'next/server';

import {
  lerIntegracoes,
  atualizarIntegracoes,
  acharRegra,
} from '@/lib/config-store';
import { acharEmpresaPorChaveTag, listarEmpresas } from '@/lib/empresas';
import { origemPermitida, type DominioTag } from '@/lib/tag-dominios';
import { eventoTagPermitido } from '@/lib/tag-eventos';
import { registrarEntrada } from '@/lib/inbox';
import { calcularEmq } from '@/lib/emq';
import { guardarPerfil } from '@/lib/perfil-atribuicao';
import { dispararItem } from '@/lib/auto-dispatch';
import { resolverModoPorMarca } from '@/lib/modo-por-marca';

/**
 * Coletor da tag de navegador — o unico endpoint PUBLICO deste console.
 *
 * O webhook da plataforma nao manda PageView nenhum: sem esta rota a Meta nao ve
 * visita alguma no site e o algoritmo otimiza no escuro. Alem do sinal de topo,
 * o hit e o que captura fbc/fbp/fbclid na pagina de vendas — onde o visitante
 * ainda e ANONIMO (o e-mail so nasce depois, no backoffice). A juncao com a
 * venda e feita pelo `visitId`, guardado em perfil-atribuicao.
 *
 * QUEM PROTEGE ESTA ROTA (ela nao tem senha, e nao pode ter):
 *   1. A lista branca de Origin (dominios cadastrados) — a tranca principal.
 *   2. A chave publica `tag.chave`, que NAO e `entrada.segredo`. O segredo de
 *      entrada jamais pode ir para dentro de uma tag de GTM: qualquer visitante
 *      leria o HTML e forjaria um Purchase.
 *   3. A lista branca de eventos (`eventoTagPermitido`), que recusa Purchase e
 *      Subscribe. Dinheiro so entra pelo webhook autenticado.
 *   4. Um freio por IP, porque qualquer navegador do mundo pode bater aqui.
 *
 * CONTRATO DE FIO (o gerador de tag precisa falar exatamente isto). Chaves
 * curtas de proposito: o hit sai por `navigator.sendBeacon`, que tem teto de
 * corpo apertado e nao pode falhar em conexao ruim de celular.
 *
 *   { k: chave publica, e: 'tag.pageview', i: event_id, u: URL da pagina,
 *     vi: visitId, r: referrer, fbc, fbp, fbclid, gclid, ttclid, msclkid }
 *
 * Os nomes longos (`chave`, `evento`, `eventId`, `sourceUrl`, `visitId`,
 * `referrer`) tambem sao aceitos: uma tag escrita a mao por um cliente nao pode
 * perder a coleta so por ter usado o nome legivel.
 */

/**
 * Teto do corpo. Um hit de tag tem algumas centenas de bytes; 32 KB ja e folga
 * grande. Teto baixo e o que impede o unico endpoint publico do console de
 * comer a memoria do container com um corpo gigante.
 */
const LIMITE_TAG = 32_000;

/* ------------------------------------------------------------------ */
/* Origem e CORS                                                       */
/* ------------------------------------------------------------------ */

/**
 * Tentativas recusadas por Origin fora da lista. So um numero, em memoria, sem
 * nada do payload: trafego hostil nao merece disco. Mesmo espirito de
 * `tentativasComSegredoInvalido()` em webhook-handler.ts.
 */
let origensRecusadas = 0;

/** Quantas vezes alguem bateu no coletor a partir de um site nao cadastrado. */
export function tentativasComOrigemInvalida(): number {
  return origensRecusadas;
}

/** Tentativas com a chave publica errada (tag velha depois de girar a chave). */
let chavesRecusadas = 0;

/** Quantas vezes o coletor recebeu chave de tag invalida. */
export function tentativasComChaveInvalida(): number {
  return chavesRecusadas;
}

/** Base publica do console; e ela que autoriza a origem do nosso proprio dominio. */
function baseAtual(): string {
  return process.env.PUBLIC_BASE_URL || '';
}

/**
 * Resolve o cabecalho Origin contra a lista de dominios cadastrados.
 *
 * Devolve o valor EXATO para ecoar em `Access-Control-Allow-Origin` (o
 * navegador compara string por string) ou null quando a origem nao vale.
 *
 * Exportado porque o OPTIONS precisa da mesma resposta antes de existir
 * qualquer corpo: preflight recusado nao pode ganhar cabecalho de CORS.
 *
 * 🔴 POR QUE ACEITA SE **QUALQUER** EMPRESA TIVER O DOMINIO (e nao mexa nisso
 * achando que e frouxidao): o preflight chega no OPTIONS, onde existe SO o
 * cabecalho Origin — nao ha corpo, nao ha chave de tag, nao ha como saber de
 * que empresa e o hit. Entao aqui a pergunta e apenas "alguem cadastrou este
 * dominio?". Isso libera o navegador a MANDAR o POST; nao autoriza coleta
 * nenhuma. Quem casa dominio com a empresa DONA DA CHAVE e `processarTag`
 * (passo 4b), que devolve 403 quando o site do cliente A usa a chave do B.
 */
export async function resolverOrigemTag(request: NextRequest): Promise<string | null> {
  const origin = request.headers.get('origin');
  try {
    for (const e of await listarEmpresas()) {
      try {
        const cfg = await lerIntegracoes(e.id);
        const permitida = origemPermitida(origin, cfg.tag.dominios, baseAtual());
        if (permitida) return permitida;
      } catch {
        // Arquivo de UMA empresa ilegivel nao derruba a coleta das outras: o
        // cliente A nao pode perder sinal porque a config do B corrompeu.
        continue;
      }
    }
  } catch {
    // Registro de empresas ilegivel: na duvida nao autoriza ninguem. Perder
    // hits de navegacao custa sinal de topo; autorizar todo mundo custa o
    // pixel inteiro.
    return null;
  }
  return null;
}

/**
 * Cabecalhos de CORS do coletor.
 *
 * `Vary: Origin` e obrigatorio: sem ele um proxy (ou o cache do proprio
 * navegador) guarda o cabecalho liberado para o dominio A e entrega para o
 * dominio B — a tranca de Origin viraria enfeite.
 */
export function cabecalhosCorsTag(origem: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/* ------------------------------------------------------------------ */
/* Freio por IP                                                        */
/* ------------------------------------------------------------------ */

/**
 * Primeiro limitador de taxa do projeto, e ele nasce aqui por um motivo
 * especifico: /api/tag/coletar e a UNICA rota que qualquer navegador do mundo
 * pode chamar. Todas as outras exigem sessao (proxy.ts) ou o segredo de entrada
 * da plataforma. Sem freio, uma pagina qualquer com a chave publica copiada faria
 * o container gravar jsonl sem parar ate encher o volume — e volume cheio
 * derruba o recebimento de venda, que e a coisa que este projeto existe para
 * nao perder.
 *
 * Em memoria, no estilo do freio de forca bruta de src/app/api/sessao/route.ts:
 * 120 hits por IP em 10 minutos, com teto de entradas no Map para o proprio
 * freio nao virar o vazamento de memoria que ele deveria impedir.
 */
const HITS_POR_IP = new Map<string, { n: number; ate: number }>();
const IP_MAX_ENTRADAS = 5_000;
const IP_LIMITE = 120;
const IP_JANELA_MS = 10 * 60_000;

/** true quando o IP estourou a cota da janela. Tambem limpa os vencidos. */
function estourouCota(ip: string): boolean {
  const agora = Date.now();
  for (const [chave, reg] of HITS_POR_IP) {
    if (reg.ate <= agora) HITS_POR_IP.delete(chave);
  }
  const reg = HITS_POR_IP.get(ip);
  if (reg && reg.ate > agora) {
    reg.n += 1;
    return reg.n > IP_LIMITE;
  }
  if (HITS_POR_IP.size >= IP_MAX_ENTRADAS) {
    const primeira = HITS_POR_IP.keys().next().value;
    if (primeira) HITS_POR_IP.delete(primeira);
  }
  HITS_POR_IP.set(ip, { n: 1, ate: agora + IP_JANELA_MS });
  return false;
}

/**
 * IP em que o freio confia. Igual a sessao.ts: CF-Connecting-IP primeiro, senao
 * o ULTIMO item de X-Forwarded-For — o unico que o proxy mais proximo escreveu.
 * Os itens da frente sao texto que o cliente manda, e usa-los como chave do
 * freio deixaria qualquer atacante trocar de identidade a cada requisicao.
 */
function ipDoFreio(req: NextRequest): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const partes = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (partes.length > 0) return partes[partes.length - 1];
  }
  return 'desconhecido';
}

/* ------------------------------------------------------------------ */
/* IP do visitante (o que vai para a Meta)                             */
/* ------------------------------------------------------------------ */

/**
 * Copia local de `ehIpNaoRoteavel` de parser.ts, que nao e exportado de la.
 *
 * IP de pod/proxy/loopback nao e o IP do comprador: a Meta descarta o campo ou,
 * pior, credita o geo do datacenter e o publico semelhante aprende com a cidade
 * errada.
 */
function ehIpNaoRoteavel(ip: string): boolean {
  if (!ip) return true;
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  return false;
}

/**
 * IP do visitante, para o `user_data` da Meta. Aqui, ao contrario do freio,
 * queremos o PRIMEIRO valor publico de X-Forwarded-For: e o navegador de
 * verdade, antes da Cloudflare e do proxy interno. Nunca do corpo — IP vindo do
 * corpo e IP escolhido pelo visitante, e um `ip` forjado envenena o geo do pixel
 * sem deixar rastro.
 */
function ipDoVisitante(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  for (const parte of xff.split(',').map((p) => p.trim())) {
    if (parte && !ehIpNaoRoteavel(parte)) return parte;
  }
  const cf = (req.headers.get('cf-connecting-ip') ?? '').trim();
  if (cf && !ehIpNaoRoteavel(cf)) return cf;
  return '';
}

/* ------------------------------------------------------------------ */
/* Freio de volume por visita                                          */
/* ------------------------------------------------------------------ */

/**
 * No maximo um item de caixa de entrada por (visita, evento) a cada 24 h.
 *
 * Sem isto, um visitante com a aba aberta recarregando a pagina gera centenas
 * de PageView: a caixa tem teto de 100 itens em memoria, entao a venda que
 * chegasse no meio seria empurrada para fora da tela pelo proprio ruido — e o
 * jsonl cresceria sem limite no volume.
 *
 * Vale so para o ITEM de caixa. O perfil de atribuicao (passo 8) e gravado em
 * TODO hit, sempre: e ele que carrega o fbc ate a venda.
 */
const VISTOS = new Map<string, number>();
const VISTOS_MAX = 20_000;
const VISTOS_JANELA_MS = 24 * 3600 * 1000;

/** true quando este par (visita, evento) ja virou item na janela de 24 h. */
function jaVistoNaJanela(visitId: string, evento: string): boolean {
  const agora = Date.now();
  const chave = visitId + '|' + evento;
  const ate = VISTOS.get(chave);
  if (ate && ate > agora) return true;
  if (VISTOS.size >= VISTOS_MAX) {
    // Limpeza barata: descarta o que ja venceu e, se nada venceu, tira o mais
    // antigo. Um Map sem teto aqui viraria vazamento de memoria lento.
    for (const [k, v] of VISTOS) if (v <= agora) VISTOS.delete(k);
    if (VISTOS.size >= VISTOS_MAX) {
      const primeira = VISTOS.keys().next().value;
      if (primeira) VISTOS.delete(primeira);
    }
  }
  VISTOS.set(chave, agora + VISTOS_JANELA_MS);
  return false;
}

/* ------------------------------------------------------------------ */
/* Contador de hits do dominio                                         */
/* ------------------------------------------------------------------ */

/**
 * Acumulado de hits por dominio, esperando para ir ao disco.
 *
 * config-store reescreve config/integracoes.json INTEIRO e sem trava. Gravar a
 * cada hit faria duas requisicoes simultaneas lerem o mesmo estado e a segunda
 * apagar a primeira — e o que se perde nao e o contador, e o DOMINIO que o
 * operador acabou de cadastrar na outra aba. Por isso o contador vive em
 * memoria e vai ao disco no maximo uma vez por minuto por dominio; entre uma
 * gravacao e outra o numero exibido fica alguns hits atrasado, o que nao muda
 * nenhuma decisao (a tela so usa isso para dizer "instalada").
 */
const HITS_DOMINIO = new Map<
  string,
  { pendentes: number; ultimoHit: string; gravadoEm: number }
>();
const HITS_DOMINIO_MAX = 500;
const HITS_INTERVALO_MS = 60_000;

/** Qual dominio cadastrado responde por esta origem (a base publica nao conta). */
function acharDominioDaOrigem(origem: string, dominios: DominioTag[]): DominioTag | undefined {
  let host = '';
  try {
    host = new URL(origem).hostname.toLowerCase().replace(/\.+$/, '');
  } catch {
    // A origem ja passou por origemPermitida(); se nao parseia aqui e caso
    // impossivel, e contador nenhum vale derrubar a coleta do hit.
    return undefined;
  }
  return (Array.isArray(dominios) ? dominios : []).find((d) => {
    const alvo = String(d?.host ?? '')
      .trim()
      .toLowerCase();
    return Boolean(alvo) && (host === alvo || host.endsWith('.' + alvo));
  });
}

/** Soma o hit em memoria e, no maximo uma vez por minuto, leva o total ao disco. */
async function contabilizarHit(idDominio: string, empresaId: string): Promise<void> {
  const agora = Date.now();
  // O mapa e global ao processo, mas o id do dominio so e unico DENTRO do
  // arquivo da empresa: sem o prefixo, id repetido em duas empresas somaria os
  // hits de uma no contador da outra.
  const chaveMem = empresaId + '|' + idDominio;
  if (!HITS_DOMINIO.has(chaveMem) && HITS_DOMINIO.size >= HITS_DOMINIO_MAX) {
    const primeira = HITS_DOMINIO.keys().next().value;
    if (primeira) HITS_DOMINIO.delete(primeira);
  }
  const reg = HITS_DOMINIO.get(chaveMem) ?? { pendentes: 0, ultimoHit: '', gravadoEm: 0 };
  reg.pendentes += 1;
  reg.ultimoHit = new Date(agora).toISOString();
  HITS_DOMINIO.set(chaveMem, reg);

  if (agora - reg.gravadoEm < HITS_INTERVALO_MS) return;
  reg.gravadoEm = agora;
  const soma = reg.pendentes;
  reg.pendentes = 0;

  // B2-c: o contador de hits e o escritor MAIS FREQUENTE de integracoes.json e
  // o unico que ninguem ve. Ler fora e gravar depois deixava a janela em que um
  // save de regra feito pelo operador no mesmo instante era apagado por um hit
  // de navegador. `atualizarIntegracoes` le e grava dentro da MESMA fila.
  try {
    await atualizarIntegracoes((cfg) => {
      const d = cfg.tag.dominios.find((x) => x.id === idDominio);
      if (!d) throw new DominioSumiu(); // dominio removido enquanto o hit esperava
      d.hits = (Number(d.hits) || 0) + soma;
      d.ultimoHit = reg.ultimoHit;
    }, empresaId);
  } catch (e) {
    if (e instanceof DominioSumiu) return;
    // Config indisponivel ou disco cheio: o contador e telemetria, nao venda.
    // Perder a contagem de um minuto nao pode derrubar a coleta do hit.
    return;
  }
}

/** Aborta o save sem gravar nada: o dominio sumiu entre o hit e a gravacao. */
class DominioSumiu extends Error {}

/* ------------------------------------------------------------------ */
/* Leitura do corpo                                                    */
/* ------------------------------------------------------------------ */

/** Primeiro valor de texto util entre os apelidos aceitos da mesma informacao. */
function texto(corpo: Record<string, unknown>, ...chaves: string[]): string {
  for (const k of chaves) {
    const v = corpo[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Descarta campo vazio: `fbc: ''` no perfil sobrescreveria um fbc bom com nada. */
function sePreenchido(alvo: Record<string, string>, chave: string, valor: string): void {
  if (valor) alvo[chave] = valor;
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

/**
 * Recebe um hit da tag do navegador e devolve sempre um corpo minusculo.
 *
 * A resposta NUNCA carrega a chave, o segredo nem eco do payload: ela e lida
 * por um `sendBeacon` que ninguem consulta, e qualquer dado devolvido aqui e
 * dado entregue a qualquer script de terceiro que esteja na pagina do cliente.
 *
 * @param request requisicao crua do navegador.
 * @param origemJaResolvida origem autorizada que a rota ja resolveu para montar
 *   o CORS. Evita ler a config duas vezes no mesmo hit; passe `undefined` para
 *   o handler resolver sozinho.
 */
export async function processarTag(
  request: NextRequest,
  origemJaResolvida?: string | null
): Promise<NextResponse> {
  // 1. Origin. Evita que qualquer site da internet mande evento em nome do
  // cliente — a chave da tag e publica e nao serve de tranca sozinha.
  const origem =
    origemJaResolvida !== undefined ? origemJaResolvida : await resolverOrigemTag(request);
  if (!origem) {
    origensRecusadas++;
    return NextResponse.json({ erro: 'Origem nao autorizada.' }, { status: 403 });
  }

  // 2. Tamanho, no cabecalho E no texto lido. O cabecalho sozinho e so promessa
  // do cliente; o texto e o que de fato entrou na memoria do container.
  const anunciado = Number(request.headers.get('content-length') || 0);
  if (anunciado > LIMITE_TAG) {
    return NextResponse.json({ erro: 'Corpo grande demais para um hit de tag.' }, { status: 413 });
  }
  const cru = await request.text();
  if (cru.length > LIMITE_TAG) {
    return NextResponse.json({ erro: 'Corpo grande demais para um hit de tag.' }, { status: 413 });
  }

  // 3. Corpo. Nao olhamos Content-Type de proposito: `sendBeacon` manda
  // text/plain e `fetch` manda application/json, e recusar por tipo derrubaria
  // metade dos navegadores. JSON invalido morre aqui SEM gravar nada em disco:
  // trafego hostil nao merece disco.
  let corpo: Record<string, unknown>;
  try {
    const lido: unknown = JSON.parse(cru);
    if (!lido || typeof lido !== 'object' || Array.isArray(lido)) throw new Error('nao e objeto');
    corpo = lido as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erro: 'O corpo nao e um JSON valido.' }, { status: 400 });
  }

  // 4. Chave publica da tag. Nao e o segredo da plataforma: esta aqui pode ser
  // girada a qualquer hora sem derrubar venda. E ela que diz DE QUEM e o hit —
  // a varredura vai pelas empresas todas e devolve a dona da chave.
  const achado = await acharEmpresaPorChaveTag(texto(corpo, 'k', 'chave'));
  if (!achado) {
    chavesRecusadas++;
    return NextResponse.json({ erro: 'Chave da tag invalida.' }, { status: 401 });
  }
  const { empresaId, cfg } = achado;

  // 4b. 🔴 A AUTORIZACAO DE VERDADE. O passo 1 so descobriu que ALGUMA empresa
  // conhece esta origem — no preflight nao ha corpo, logo nao ha chave, logo
  // nao da para saber a empresa. Agora, com a chave em maos, o dominio tem de
  // estar na lista DESTA empresa. E isto que impede o site do cliente A de
  // coletar com a chave do cliente B.
  if (!origemPermitida(request.headers.get('origin'), cfg.tag.dominios, baseAtual())) {
    origensRecusadas++;
    return NextResponse.json({ erro: 'Origem nao autorizada.' }, { status: 403 });
  }

  // 5. Freio por IP. Ver o comentario de HITS_POR_IP: esta e a unica rota do
  // console que o mundo inteiro alcanca.
  if (estourouCota(ipDoFreio(request))) {
    return NextResponse.json({ erro: 'Hits demais. Tente de novo mais tarde.' }, { status: 429 });
  }

  // 6. Lista branca de eventos. ESTA E A TRAVA QUE IMPEDE UM VISITANTE DE
  // FORJAR UMA VENDA com a chave publica que ele leu no HTML da pagina:
  // Purchase e Subscribe caem exatamente aqui. Dinheiro so entra pelo webhook
  // da plataforma, autenticado por um segredo que nunca sai do servidor.
  const eventoOrigem = texto(corpo, 'e', 'evento');
  const doCatalogo = eventoTagPermitido(eventoOrigem);
  if (!doCatalogo) {
    return NextResponse.json({ erro: 'Evento nao permitido pela tag.' }, { status: 400 });
  }
  const eventoMeta = doCatalogo.evento;

  // 7. Campos no MESMO vocabulario do parser, para o resto do sistema (perfil,
  // enriquecimento, disparo, EMQ, log de atribuicao) nao precisar saber que
  // este evento veio da tag e nao do webhook.
  const campos: Record<string, string> = {};
  sePreenchido(campos, 'visitId', texto(corpo, 'vi', 'visitId'));
  sePreenchido(campos, 'fbc', texto(corpo, 'fbc'));
  sePreenchido(campos, 'fbp', texto(corpo, 'fbp'));
  sePreenchido(campos, 'sourceUrl', texto(corpo, 'u', 'sourceUrl', 'url'));
  sePreenchido(campos, 'referrer', texto(corpo, 'r', 'referrer'));
  sePreenchido(campos, 'fbclid', texto(corpo, 'fbclid'));
  sePreenchido(campos, 'gclid', texto(corpo, 'gclid'));
  sePreenchido(campos, 'ttclid', texto(corpo, 'ttclid'));
  sePreenchido(campos, 'msclkid', texto(corpo, 'msclkid'));
  sePreenchido(campos, 'eventId', texto(corpo, 'i', 'eventId'));
  // IP e user-agent SEMPRE do cabecalho, nunca do corpo: vindos do corpo sao
  // escolha do visitante, e um par ip/ua forjado suja o geo do pixel.
  sePreenchido(campos, 'ip', ipDoVisitante(request));
  sePreenchido(campos, 'userAgent', request.headers.get('user-agent') ?? '');

  // 8. O coracao do recurso. Grava a atribuicao ANTES de qualquer decisao sobre
  // disparo: mesmo com a regra em 'ignorar', o fbc capturado agora vai
  // enriquecer o Purchase que chegar pelo webhook horas depois — que e
  // justamente o PIX que chega sem atribuicao nenhuma.
  //
  // Rodar antes das travas de volume dos passos 9 e 10 e proposital, e por isso
  // quem segura o disco e o proprio guardarPerfil: ele nao regrava perfil
  // identico (ver REFRESCO_MS) e a carga compacta o jsonl. Sem isso, cada
  // PageView de cada visitante deixava duas linhas para sempre.
  await guardarPerfil(campos, empresaId).catch(() => {});

  // 13. Contador do dominio, para a tela dizer "instalada". Tolerante a falha:
  // contador nao pode derrubar coleta. Vai no after() para nao competir com a
  // resposta e porque escreve na config (ver HITS_DOMINIO).
  const dominio = acharDominioDaOrigem(origem, cfg.tag.dominios);
  if (dominio) {
    const idDominio = dominio.id;
    after(() => contabilizarHit(idDominio, empresaId).catch(() => {}));
  }

  // 9. Regra de roteamento. Em 'ignorar' o hit para aqui, sem virar item: a
  // caixa tem teto de 100 itens em memoria e PageView ignorado empurraria a
  // venda para fora da tela — e o jsonl cresceria sem limite.
  const regra = acharRegra(cfg, eventoOrigem);
  const modo: 'auto' | 'fila' | 'ignorar' = regra ? regra.modo : 'ignorar';
  if (modo === 'ignorar') {
    return NextResponse.json({ ok: true, guardado: true, disparado: false }, { status: 202 });
  }

  // 10. Freio de volume por visita (ver VISTOS). Sem visitId nao da para
  // deduplicar, e ai quem segura o volume e o freio por IP do passo 5.
  if (campos.visitId && jaVistoNaJanela(campos.visitId, eventoOrigem)) {
    return NextResponse.json({ ok: true, guardado: true, disparado: false }, { status: 202 });
  }

  // 11. Item de caixa de entrada no mesmo formato do webhook. E o que faz o hit
  // aparecer na tela, no SSE, no relay e no log de atribuicao sem uma linha de
  // codigo nova em nenhum deles.
  const emq = calcularEmq({
    fbc: campos.fbc,
    fbp: campos.fbp,
    ip: campos.ip,
    userAgent: campos.userAgent,
    sourceUrl: campos.sourceUrl,
    eventId: campos.eventId,
  });

  // A chave sai do payload guardado: e publica, mas nao ha motivo para ela ficar
  // no jsonl e no SSE, onde so atrapalha quem le a tela.
  const payload: Record<string, unknown> = { ...corpo };
  delete payload.k;
  delete payload.chave;

  // A TRAVA DO PIXEL (FASE 6, alteracao 9.B). Mesma decisao do webhook, mesma
  // funcao: a tag do site e o segundo caminho que chega em dispararItem(), e
  // duas copias da mesma regra e como nasce um disparo fantasma (§9.5.1 r. 2).
  //
  // Fica depois do freio de volume de proposito: hit repetido nao precisa
  // pagar uma leitura de marcas.json para ser descartado.
  const marcas = regra?.marcas?.length ? regra.marcas : ['default'];
  const decisao = await resolverModoPorMarca(modo, marcas);

  const item = await registrarEntrada({
    empresaId,
    origem: 'tag',
    evento: eventoMeta,
    eventoOrigem,
    eventoMeta,
    regraId: regra?.id,
    modo,
    modoPorMarca: decisao.modoPorMarca,
    motivoFila: decisao.motivoFila,
    conhecido: true,
    classificacao: 'mapeado',
    temFbc: Boolean(campos.fbc),
    temFbp: Boolean(campos.fbp),
    // A tag do site mede VISITA, nao venda: nao ha nome de comprador para
    // guardar aqui, e por isso `nomeCliente` fica ausente de proposito. O que
    // ha e a atribuicao de clique, que e justamente o motivo de a tag existir —
    // e o fbclid capturado na pagina de vendas que salva o Purchase do PIX,
    // que chega depois, fora do navegador, sem atribuicao nenhuma.
    temFbclid: Boolean(campos.fbclid),
    temGclid: Boolean(campos.gclid),
    emq: emq.nota,
    payload,
  });

  // 12. Disparo depois da resposta. O beacon do navegador nao espera: se o
  // disparo para a Meta ficasse na frente da resposta, a aba fecharia antes e o
  // hit se perderia inteiro.
  if (decisao.marcasAuto.length > 0) {
    after(async () => {
      try {
        await dispararItem({
          item,
          campos,
          eventoMeta,
          marcas: decisao.marcasAuto,
          origem: 'auto',
        });
      } catch (e) {
        console.error('[tag] auto-dispatch falhou:', e);
      }
    });
  }

  // 14. Corpo minusculo, sempre 202. Nada de chave, de segredo, nem eco do payload.
  return NextResponse.json(
    // "disparado" agora e o que aconteceu, nao o que a regra queria: com o
    // Switch do Pixel desligado a regra continua em 'auto' e nada sai.
    { ok: true, guardado: true, disparado: decisao.marcasAuto.length > 0 },
    { status: 202 }
  );
}
