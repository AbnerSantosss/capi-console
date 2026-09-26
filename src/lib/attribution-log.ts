import fs from 'node:fs/promises';
import path from 'node:path';

const DIR_LOG = path.join(process.cwd(), 'logs');
const ARQ_JSONL = path.join(DIR_LOG, 'disparos.jsonl');
const ARQ_MD = path.join(DIR_LOG, 'disparos.md');

export interface Utms {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  id?: string;
}

export interface Atribuicao {
  /** Convencao do Código Vencedor: utm_campaign/utm_id = campanha, utm_term = conjunto, utm_content/ad_id = anuncio */
  campaignId: string;
  adsetId: string;
  adId: string;
  placement: string;
  utms: Utms;
  links: {
    campanha?: string;
    conjunto?: string;
    anuncio?: string;
    biblioteca?: string;
  };
  /** Sem estes o Gerenciador nao abre filtrado */
  faltando: string[];
}

function param(url: string, nome: string): string {
  const m = url.match(new RegExp('[?&]' + nome + '=([^&#]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/** Aceita "act_123", "123" ou vazio; devolve so os digitos. */
function normalizarConta(v?: string): string {
  return String(v || '').replace(/\D+/g, '');
}

function janelaDeUmDia(quando: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const d = `${quando.getUTCFullYear()}-${p(quando.getUTCMonth() + 1)}-${p(quando.getUTCDate())}`;
  return `${d}_${d}`;
}

/**
 * Le a atribuicao de anuncio da event_source_url e monta deep links do
 * Gerenciador de Anuncios ja filtrados na campanha / conjunto / anuncio
 * que trouxe a venda.
 */
export function extrairAtribuicao(
  eventSourceUrl: string,
  opts: { adAccountId?: string; quando?: Date } = {}
): Atribuicao {
  const url = String(eventSourceUrl || '');
  const utms: Utms = {
    source: param(url, 'utm_source'),
    medium: param(url, 'utm_medium'),
    campaign: param(url, 'utm_campaign'),
    content: param(url, 'utm_content'),
    term: param(url, 'utm_term'),
    id: param(url, 'utm_id'),
  };

  const campaignId = utms.campaign || utms.id || '';
  const adsetId = utms.term || '';
  const adId = param(url, 'ad_id') || utms.content || '';
  const placement = param(url, 'placement');

  const conta = normalizarConta(opts.adAccountId ?? process.env.AD_ACCOUNT_ID);
  const data = janelaDeUmDia(opts.quando || new Date());
  const base = 'https://adsmanager.facebook.com/adsmanager/manage';

  const links: Atribuicao['links'] = {};
  const faltando: string[] = [];

  if (!conta) faltando.push('AD_ACCOUNT_ID (defina no .env.local)');
  if (!campaignId) faltando.push('utm_campaign / utm_id');
  if (!adsetId) faltando.push('utm_term (id do conjunto)');
  if (!adId) faltando.push('ad_id / utm_content');

  if (conta) {
    const q = (extra: string) => `?act=${conta}&date=${data}${extra}`;
    if (campaignId) {
      links.campanha = `${base}/campaigns${q(`&selected_campaign_ids=${campaignId}`)}`;
    }
    if (adsetId) {
      links.conjunto = `${base}/adsets${q(
        `${campaignId ? `&selected_campaign_ids=${campaignId}` : ''}&selected_adset_ids=${adsetId}`
      )}`;
    }
    if (adId) {
      links.anuncio = `${base}/ads${q(
        `${campaignId ? `&selected_campaign_ids=${campaignId}` : ''}` +
          `${adsetId ? `&selected_adset_ids=${adsetId}` : ''}` +
          `&selected_ad_ids=${adId}`
      )}`;
    }
  }

  // Independe da conta e do token: mostra o criativo se o anuncio estiver ativo.
  if (adId) links.biblioteca = `https://www.facebook.com/ads/library/?id=${adId}`;

  return { campaignId, adsetId, adId, placement, utms, links, faltando };
}

export interface EntradaLog {
  eventName: string;
  eventId?: string;
  eventTime: number;
  value?: number;
  currency?: string;
  orderId?: string;
  httpStatus: number;
  fbtraceId?: string;
  eventsReceived?: number;
  temFbc: boolean;
  temFbp: boolean;
  eventSourceUrl?: string;
  atribuicao: Atribuicao;
  /**
   * Sem o pixel no log, a deduplicacao nao consegue distinguir dois pixels.
   *
   * OPCIONAL AQUI DE PROPOSITO (P-12): `EntradaLog` tambem e o formato das
   * linhas que ja estao gravadas em `logs/disparos.jsonl`, e as antigas foram
   * escritas antes deste campo existir. Quem LE precisa aceitar a ausencia.
   * Quem ESCREVE nao: `registrarDisparo` exige os dois (ver `EntradaLogNova`).
   */
  pixelId?: string;
  /** Idem: opcional para o leitor de registro antigo, obrigatorio para gravar. */
  marcaId?: string;
  /**
   * O envio foi com `test_event_code` (Pixel em modo teste)? (C8, D12)
   *
   * Envio de teste cai so em "Eventos de teste" da Meta e NAO conta como
   * conversao, entao ele fica FORA da deduplicacao (`dedup.ts`): senao a venda
   * mandada com o Pixel em teste ficaria barrada como "ja aceita" quando o
   * Pixel voltasse para producao, e a conversao real nunca sairia.
   *
   * Opcional aqui pelo mesmo motivo do `pixelId`: as linhas gravadas antes da
   * C8 nao tem o campo, e quem le trata a ausencia como envio REAL (P6) — nao
   * ha como saber, e inferir pelo `testCode` de hoje do Pixel inventaria
   * historia. Quem ESCREVE e obrigado a informar (ver `EntradaLogNova`).
   */
  modoTeste?: boolean;
}

/**
 * O que e exigido de um disparo NOVO (P-12).
 *
 * O par (`pixelId`, `marcaId`) passa a ser obrigatorio na gravacao. Sem ele o
 * historico guarda so o id interno da marca, e quando a marca e apagada a tela
 * fica com `marca_lx8k2p` — um codigo que nao existe em lugar nenhum fora deste
 * app. Com o ID do Pixel junto, o registro continua rastreavel no Gerenciador
 * de Eventos da Meta mesmo depois de a marca sumir daqui.
 *
 * Isto NAO e migracao: nenhuma linha ja gravada e reescrita, nenhum arquivo e
 * convertido. Vale so para o que for gravado daqui para a frente.
 *
 * `modoTeste` (C8, D12) entra no mesmo pacote: todo disparo novo diz se foi
 * com `test_event_code`. Os dois chamadores sao `auto-dispatch.ts` e
 * `api/enviar/route.ts` (o lote que tambem gravava aqui foi apagado na C11).
 */
export type EntradaLogNova = EntradaLog &
  Required<Pick<EntradaLog, 'pixelId' | 'marcaId' | 'modoTeste'>>;

/** Grava uma linha JSON (maquina) + um bloco legivel com os links (humano). */
export async function registrarDisparo(e: EntradaLogNova): Promise<{ jsonl: string; md: string }> {
  await fs.mkdir(DIR_LOG, { recursive: true });
  const agora = new Date();
  const a = e.atribuicao;
  // Sempre um booleano na linha nova, mesmo que um chamador em JS cru esqueca o
  // campo (o tipo o exige): assim "linha sem `modoTeste`" continua querendo
  // dizer so "gravada antes da C8", e a ausencia aqui vira envio real (P6).
  const modoTeste = e.modoTeste === true;

  await fs.appendFile(
    ARQ_JSONL,
    JSON.stringify({ registradoEm: agora.toISOString(), ...e, modoTeste }) + '\n',
    'utf8'
  );

  const brl =
    e.value !== undefined
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: e.currency || 'BRL' }).format(e.value)
      : '—';
  const ok = e.httpStatus === 200 && (e.eventsReceived ?? 0) > 0;

  const linhas = [
    ``,
    `## ${ok ? 'OK' : 'FALHA'} · ${e.eventName} · ${brl} · ${agora.toLocaleString('pt-BR')}`,
    ``,
    `| | |`,
    `|---|---|`,
    `| event_id | \`${e.eventId || '—'}\` |`,
    `| pixel | \`${e.pixelId || '—'}\`${e.marcaId ? ` (marca \`${e.marcaId}\`)` : ''} |`,
    `| modo | ${modoTeste ? 'TESTE (test_event_code; não conta como conversão nem entra na deduplicação)' : 'real'} |`,
    `| event_time | ${e.eventTime} (${new Date(e.eventTime * 1000).toISOString()}) |`,
    `| pedido | \`${e.orderId || '—'}\` |`,
    `| HTTP / recebidos | ${e.httpStatus} / ${e.eventsReceived ?? 0} |`,
    `| fbtrace_id | \`${e.fbtraceId || '—'}\` |`,
    `| fbc / fbp | ${e.temFbc ? 'sim' : 'NAO'} / ${e.temFbp ? 'sim' : 'NAO'} |`,
    ``,
    `**Criativo que converteu**`,
    ``,
    `| nivel | id | UTM de origem |`,
    `|---|---|---|`,
    `| campanha | \`${a.campaignId || '—'}\` | utm_campaign / utm_id |`,
    `| conjunto | \`${a.adsetId || '—'}\` | utm_term |`,
    `| anuncio | \`${a.adId || '—'}\` | ad_id / utm_content |`,
    `| posicionamento | ${a.placement || '—'} | placement |`,
    `| origem / midia | ${a.utms.source || '—'} / ${a.utms.medium || '—'} | utm_source / utm_medium |`,
    ``,
  ];

  if (a.links.anuncio) linhas.push(`- **Abrir o anúncio no Gerenciador:** ${a.links.anuncio}`);
  if (a.links.conjunto) linhas.push(`- Abrir o conjunto: ${a.links.conjunto}`);
  if (a.links.campanha) linhas.push(`- Abrir a campanha: ${a.links.campanha}`);
  if (a.links.biblioteca) linhas.push(`- Ver o criativo na Biblioteca de Anúncios: ${a.links.biblioteca}`);
  if (a.faltando.length) linhas.push(`- ⚠️ Link incompleto, faltou: ${a.faltando.join(', ')}`);

  await fs.appendFile(ARQ_MD, linhas.join('\n') + '\n---\n', 'utf8');
  return { jsonl: ARQ_JSONL, md: ARQ_MD };
}
