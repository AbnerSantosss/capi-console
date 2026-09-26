import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  console.log('\n======================================================');
  console.log('🌐 CONEXÃO COM O GOOGLE CHROME (DevTools Protocol)');
  console.log('======================================================\n');

  let browser;

  // 1. Tenta conectar na porta 9222 (se o Chrome já estiver com a porta de depuração aberta)
  try {
    console.log('Tentando conectar a uma instância ativa do Chrome em http://127.0.0.1:9222...');
    browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null,
    });
    console.log('✅ Conectado com sucesso ao Chrome ativo via porta 9222!');
  } catch (err) {
    console.log('ℹ️ Chrome não está escutando na porta 9222.');
  }

  // 2. Se não conseguiu conectar, orienta ou tenta abrir
  if (!browser) {
    console.log('\n⚠️ Para permitir que o script acesse a sua sessão do Chrome logada:');
    console.log('Feche o Chrome e reabra com a porta de depuração executando no terminal:');
    console.log('  Start-Process "chrome.exe" -ArgumentList "--remote-debugging-port=9222"');
    console.log('\nOu deixe a janela do backoffice aberta e utilize o script no console F12.\n');
    process.exit(1);
  }

  // 3. Procurar aba do backoffice
  const pages = await browser.pages();
  let targetPage = pages.find((p) => p.url().includes('admin.codigovencedor.com'));

  if (!targetPage) {
    console.log('Aba do backoffice não encontrada aberta. Abrindo nova aba em https://admin.codigovencedor.com/backoffice/webhooks...');
    targetPage = await browser.newPage();
    await targetPage.goto('https://admin.codigovencedor.com/backoffice/webhooks', { waitUntil: 'networkidle2' });
  } else {
    console.log(`✅ Aba do backoffice encontrada: ${targetPage.url()}`);
  }

  // 4. Extrair todas as entregas de webhook usando a sessão autenticada da página
  console.log('\n📥 Extraindo entregas de webhook do backoffice via API interna...');

  const resultado = await targetPage.evaluate(async () => {
    const todosEventos = [];
    let pagina = 1;
    let temMais = true;

    while (temMais) {
      try {
        const resp = await fetch(`/api/v1/backoffice/integrations/webhook-deliveries?page=${pagina}&per_page=100`, {
          credentials: 'include',
        });
        if (!resp.ok) break;
        const data = await resp.json();
        const entregas = data.data || data.deliveries || data.items || (Array.isArray(data) ? data : []);
        if (!entregas || entregas.length === 0) break;

        todosEventos.push(...entregas);

        if (data.meta && data.meta.last_page && pagina >= data.meta.last_page) {
          temMais = false;
        } else if (entregas.length < 100) {
          temMais = false;
        } else {
          pagina++;
        }
      } catch (e) {
        break;
      }
    }
    return todosEventos;
  });

  console.log(`✅ Total de entregas extraídas: ${resultado.length}`);

  const caminhoSaida = path.join(ROOT, 'logs', 'webhooks_extraidos.json');
  await fs.mkdir(path.join(ROOT, 'logs'), { recursive: true });
  await fs.writeFile(caminhoSaida, JSON.stringify(resultado, null, 2), 'utf8');

  console.log(`💾 Entregas salvas em: ${caminhoSaida}`);
  console.log(`\nOs disparos em lote foram aposentados em 23/09/2026; use a caixa de entrada do console.\n`);
}

main().catch((e) => {
  console.error('Erro na execução:', e);
  process.exit(1);
});
