#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Carregar .env.local
async function carregarEnv() {
  try {
    const txt = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8');
    for (const linha of txt.split('\n')) {
      const m = linha.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m) {
        let v = m[2] || '';
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  } catch {}
}

function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function normEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function normTelefone(v, ddi55 = true) {
  let d = String(v || '').replace(/\D+/g, '').replace(/^0+/, '');
  if (!d) return '';
  if (ddi55 && (d.length === 10 || d.length === 11) && !d.startsWith('55')) {
    d = '55' + d;
  }
  return d;
}

function normNome(v) {
  return String(v || '').trim().toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
}

function normIp(v) {
  return String(v || '').trim().replace(/^::ffff:/i, '');
}

function ehIpNaoRoteavel(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(isNaN)) return false;
  if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  return false;
}

function encontrarRaiz(j) {
  if (j.payload) {
    if (j.payload.data && (j.payload.data.lead || j.payload.data.attribution)) return j.payload.data;
    if (j.payload.lead || j.payload.attribution) return j.payload;
  }
  if (j.data && (j.data.lead || j.data.amount !== undefined || j.data.amountMinor !== undefined || j.data.attribution)) return j.data;
  return j;
}

function parseWebhook(raw) {
  const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const raiz = encontrarRaiz(j);
  const fields = {};
  let eventName;

  const evName = (j.event || raiz.event || raiz.eventName || '') + '';
  if (evName) {
    const n = evName.toLowerCase();
    if (n.includes('completed') || n.includes('approved') || n === 'purchase') {
      eventName = 'Purchase';
    } else if (n.includes('pre.checkout') || n.includes('pre_checkout') || n.includes('precheckout') || n.includes('lead')) {
      eventName = 'Lead';
    } else if (n.includes('checkout')) {
      eventName = 'InitiateCheckout';
    }
  }

  const lead = raiz.lead || {};
  if (lead.email) fields.email = lead.email;
  if (lead.phone) fields.phone = lead.phone;
  if (lead.name) {
    const p = String(lead.name).trim().split(/\s+/);
    fields.firstName = p[0];
    if (p.length > 1) fields.lastName = p.slice(1).join(' ');
  }
  if (lead.taxId) fields.externalId = lead.taxId;

  if (raiz.amountMinor !== undefined && raiz.amountMinor !== null) {
    fields.value = Number(raiz.amountMinor) / 100;
  } else if (raiz.amount !== undefined && raiz.amount !== null) {
    fields.value = Number(raiz.amount) / 100;
  }
  fields.currency = raiz.currency || 'BRL';

  const orderId = raiz.order_id || raiz.orderId || raiz.sessionId || '';
  if (orderId) fields.orderId = String(orderId);

  const idCanonico = j.eventId || raiz.eventId || j.event_id || raiz.event_id || '';
  if (idCanonico) {
    fields.eventId = String(idCanonico);
  } else if (orderId) {
    fields.eventId = 'order_' + orderId;
  }

  const attr = raiz.attribution || {};
  const cookies = attr.cookies || {};
  const utms = attr.utm || {};
  const urlBruta = attr.eventSourceUrl || attr.event_source_url || attr.landing_page || '';

  const mFbclid = urlBruta.match(/[?&]fbclid=([^&#]+)/);
  const fbclid = cookies.fbclid || (mFbclid ? decodeURIComponent(mFbclid[1]) : '');

  const quando = raiz.occurredAt || raiz.occurred_at || raiz.approved_at || raiz.generated_at || raiz.opened_at || j.created_at;
  if (cookies.fbc) {
    fields.fbc = cookies.fbc;
  } else if (fbclid) {
    const ms = new Date(quando || '').getTime() || Date.now();
    fields.fbc = `fb.1.${ms}.${fbclid}`;
  }

  if (cookies.fbp) fields.fbp = cookies.fbp;
  if (attr.userAgent || attr.user_agent) fields.userAgent = attr.userAgent || attr.user_agent;

  const ipBruto = String(attr.ipAddress || attr.ip_address || '').replace(/^::ffff:/i, '').trim();
  if (ipBruto && !ehIpNaoRoteavel(ipBruto)) {
    fields.ip = ipBruto;
  }

  let sourceUrl = urlBruta;
  if (!sourceUrl && Object.keys(utms).length) {
    const params = Object.entries(utms).map(([k, v]) => `utm_${k}=${encodeURIComponent(v)}`).join('&');
    sourceUrl = `https://codigovencedor.com/?${params}`;
  }
  if (sourceUrl) {
    if (fbclid && !sourceUrl.includes('fbclid=')) {
      sourceUrl += (sourceUrl.includes('?') ? '&' : '?') + 'fbclid=' + encodeURIComponent(fbclid);
    }
    fields.sourceUrl = sourceUrl;
  }

  if (quando) {
    const d = new Date(quando);
    if (!isNaN(d.getTime())) fields.eventTime = Math.floor(d.getTime() / 1000);
  }

  return { fields, eventName: eventName || 'Lead' };
}

async function main() {
  await carregarEnv();

  const args = process.argv.slice(2);
  const arquivoJson = args.find((a) => !a.startsWith('--'));
  const modoProducao = args.includes('--producao') || args.includes('--prod');
  const argTest = args.find((a) => a.startsWith('--test-code='));
  const testEventCode = argTest ? argTest.split('=')[1] : modoProducao ? undefined : 'TEST85895';

  if (!arquivoJson) {
    console.log(`
Uso:
  node scripts/processar-fila-cli.mjs <caminho-para-eventos.json> [opções]

Opções:
  --producao, --prod          Dispara diretamente em produção (SEM código de teste)
  --test-code=TESTXXXXX       Define o código de teste no Gerenciador de Eventos (padrão TEST85895 em modo teste)
  --dry-run                   Apenas simula e exibe a fila deduplicada sem enviar
`);
    process.exit(1);
  }

  const caminhoCompleto = path.resolve(process.cwd(), arquivoJson);
  console.log(`\n📂 Lendo arquivo de webhooks: ${caminhoCompleto}`);

  const conteudo = await fs.readFile(caminhoCompleto, 'utf8');
  let dados = JSON.parse(conteudo);
  if (!Array.isArray(dados)) {
    dados = dados.data || dados.deliveries || dados.items || [dados];
  }

  console.log(`🔍 Total de entregas brutas encontradas: ${dados.length}`);

  // Passo 1: Construir tabela de atribuição por usuário
  const mapaAtribuicao = {};
  for (const item of dados) {
    try {
      const p = parseWebhook(item);
      const email = normEmail(p.fields.email);
      if (!email) continue;
      if (!mapaAtribuicao[email]) mapaAtribuicao[email] = {};
      for (const [k, v] of Object.entries(p.fields)) {
        if (v && !mapaAtribuicao[email][k]) mapaAtribuicao[email][k] = v;
      }
    } catch {}
  }

  // Passo 2: Deduplicar por (usuário, evento)
  const candidatos = {};
  let ignoradosTestes = 0;
  const agora = Math.floor(Date.now() / 1000);
  const seteDias = 7 * 24 * 3600;

  for (const item of dados) {
    try {
      const p = parseWebhook(item);
      const email = normEmail(p.fields.email);
      const nome = `${p.fields.firstName || ''} ${p.fields.lastName || ''}`.toLowerCase();
      const valor = p.fields.value || 0;

      // Excluir testes internos
      if (nome.includes('jairo') || email.includes('jairo') || email.includes('teste@') || (valor > 0 && valor <= 0.1)) {
        ignoradosTestes++;
        continue;
      }

      if (!email) continue;

      const perfil = mapaAtribuicao[email] || {};
      const merged = { ...perfil, ...p.fields };
      if (!merged.fbc && perfil.fbc) merged.fbc = perfil.fbc;
      if (!merged.fbp && perfil.fbp) merged.fbp = perfil.fbp;
      if (!merged.ip && perfil.ip) merged.ip = perfil.ip;
      if (!merged.userAgent && perfil.userAgent) merged.userAgent = perfil.userAgent;
      if (!merged.sourceUrl && perfil.sourceUrl) merged.sourceUrl = perfil.sourceUrl;

      const metaEventName = p.eventName;
      const chave = `${email}__${metaEventName}`;

      const eventTime = merged.eventTime || agora;
      const expirado = eventTime < agora - seteDias + 120;

      const user_data = {};
      if (merged.email) user_data.em = [sha256(normEmail(merged.email))];
      if (merged.phone) user_data.ph = [sha256(normTelefone(merged.phone))];
      if (merged.firstName) user_data.fn = [sha256(normNome(merged.firstName))];
      if (merged.lastName) user_data.ln = [sha256(normNome(merged.lastName))];
      if (merged.externalId) user_data.external_id = [sha256(String(merged.externalId).trim())];
      if (merged.fbc) user_data.fbc = merged.fbc;
      if (merged.fbp) user_data.fbp = merged.fbp;
      if (merged.ip) user_data.client_ip_address = normIp(merged.ip);
      if (merged.userAgent) user_data.client_user_agent = merged.userAgent;

      const custom_data = {};
      if (merged.value !== undefined) custom_data.value = Number(merged.value);
      if (merged.currency) custom_data.currency = merged.currency;
      if (merged.orderId) custom_data.order_id = merged.orderId;

      const metaEvent = {
        event_name: metaEventName,
        event_time: eventTime,
        action_source: 'website',
        user_data,
        event_id: merged.eventId,
        event_source_url: merged.sourceUrl,
      };
      if (Object.keys(custom_data).length) metaEvent.custom_data = custom_data;

      const evObj = {
        email,
        nome: `${merged.firstName || ''} ${merged.lastName || ''}`.trim(),
        metaEventName,
        eventTime,
        eventTimeIso: new Date(eventTime * 1000).toISOString(),
        orderId: merged.orderId,
        value: merged.value,
        temFbc: Boolean(merged.fbc),
        temFbp: Boolean(merged.fbp),
        expirado,
        metaEvent,
      };

      const existente = candidatos[chave];
      if (!existente || (evObj.temFbc && !existente.temFbc) || evObj.eventTime > existente.eventTime) {
        candidatos[chave] = evObj;
      }
    } catch {}
  }

  const fila = Object.values(candidatos).sort((a, b) => a.eventTime - b.eventTime);

  console.log(`\n======================================================`);
  console.log(`📊 RESUMO DA FILA DEDUPLICADA (Usuário + Evento)`);
  console.log(`======================================================`);
  console.log(`Total de entregas brutas:  ${dados.length}`);
  console.log(`Testes internos excluídos: ${ignoradosTestes}`);
  console.log(`Total de eventos na fila:  ${fila.length}`);
  console.log(`Modo de execução:          ${testEventCode ? `TESTE (code: ${testEventCode})` : '🚀 PRODUÇÃO REAL'}`);
  console.log(`======================================================\n`);

  console.table(
    fila.map((e, idx) => ({
      '#': idx + 1,
      Evento: e.metaEventName,
      Comprador: e.nome || e.email,
      Email: e.email,
      Valor: e.value ? `R$ ${e.value.toFixed(2)}` : '—',
      Data: e.eventTimeIso.slice(0, 19).replace('T', ' '),
      fbc: e.temFbc ? '✅' : '❌',
      fbp: e.temFbp ? '✅' : '❌',
      Expirado: e.expirado ? '⚠️ SIM (>7d)' : 'NÃO',
    }))
  );

  if (args.includes('--dry-run')) {
    console.log(`\n[DRY RUN] Simulação concluída. Nenhum evento foi disparado.`);
    return;
  }

  const pixelId = process.env.PIXEL_ID;
  const accessToken = process.env.ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    console.error('\n❌ ERRO: PIXEL_ID ou ACCESS_TOKEN não configurados em .env.local');
    process.exit(1);
  }

  console.log(`\n⚡ Iniciando disparos para Meta Graph API v26.0 (Pixel: ${pixelId})...\n`);

  let ok = 0;
  let falhas = 0;

  for (let i = 0; i < fila.length; i++) {
    const item = fila[i];
    if (item.expirado) {
      console.log(`[${i + 1}/${fila.length}] ⏭️ Ignorando ${item.metaEventName} (${item.email}) — evento com mais de 7 dias.`);
      continue;
    }

    const corpo = {
      data: [item.metaEvent],
      access_token: accessToken,
    };
    if (testEventCode) corpo.test_event_code = testEventCode;

    try {
      const resp = await fetch(`https://graph.facebook.com/v26.0/${pixelId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const resJson = await resp.json();

      if (resp.status === 200 && resJson.events_received > 0) {
        ok++;
        console.log(`[${i + 1}/${fila.length}] ✅ SUCESSO: ${item.metaEventName} para ${item.email} (fbtrace_id: ${resJson.fbtrace_id})`);
      } else {
        falhas++;
        console.error(`[${i + 1}/${fila.length}] ❌ FALHA: ${item.metaEventName} para ${item.email}`, resJson);
      }
    } catch (err) {
      falhas++;
      console.error(`[${i + 1}/${fila.length}] ❌ ERRO HTTP:`, err.message);
    }

    if (i < fila.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  console.log(`\n======================================================`);
  console.log(`🏁 RESULTADO FINAL: ${ok} sucessos, ${falhas} falhas de ${fila.length} eventos.`);
  console.log(`======================================================\n`);
}

main().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
