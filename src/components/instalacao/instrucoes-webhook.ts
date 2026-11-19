/**
 * O selo do bloco do webhook e o texto das instruções — módulo puro (M-14).
 *
 * Nenhum React, nenhum `window`, nenhuma rede e nenhum relógio: a hora entra por
 * parâmetro. Roda no navegador (`InstalacaoPage`, `WebhookInstalacao`) e no
 * teste (`scripts/instalacao-webhook.test.mjs`) do mesmo jeito.
 */
import { NOME_PRODUTO } from '@/lib/produto';
import { HORAS_SEM_RECEBER, haQuantoTempo } from '@/lib/recebimentos-calculo';

/** O tom do selo: verde só com entrega real recente. */
export type TomDoSelo = 'success' | 'warning' | 'neutral';

export interface SeloDoWebhook {
  tom: TomDoSelo;
  texto: string;
}

const HORA_MS = 60 * 60 * 1000;

/**
 * O selo do bloco "Instalar o webhook de vendas".
 *
 *  - em localhost: alerta, porque nenhuma plataforma alcança o endereço;
 *  - sem nenhuma entrega da plataforma registrada: neutro;
 *  - última entrega há 24 h ou menos: verde;
 *  - última entrega mais velha que isso: neutro, com o tempo. O aviso de que a
 *    plataforma parou é da Visão geral (M-02), que só fala quando há histórico
 *    suficiente; aqui a tela só informa.
 *
 * `ultimaEm` é a hora da última entrega REAL da plataforma. O teste mandado
 * pelo console não entra nessa conta.
 */
export function seloDoWebhook(entrada: {
  ehLocal: boolean;
  ultimaEm: string | null | undefined;
  agora: number;
}): SeloDoWebhook {
  if (entrada.ehLocal) return { tom: 'warning', texto: 'Só neste computador' };

  const haQuanto = haQuantoTempo(entrada.ultimaEm, entrada.agora);
  if (haQuanto === null) return { tom: 'neutral', texto: 'Nenhum recebimento ainda' };

  const quando = Date.parse(String(entrada.ultimaEm));
  const recente = entrada.agora - quando <= HORAS_SEM_RECEBER * HORA_MS;
  return { tom: recente ? 'success' : 'neutral', texto: `Último recebimento: ${haQuanto}` };
}

/**
 * O texto que o botão "Copiar instruções para o dev" põe na área de
 * transferência. `url` é o endereço completo do webhook, o mesmo do botão
 * "Copiar a URL": o fim dele é o segredo, e por isso este texto nunca vai para
 * log nem para mensagem de erro.
 */
export function instrucoesParaODev(entrada: { url: string }): string {
  return [
    `Webhook de vendas para o ${NOME_PRODUTO}`,
    '',
    '1. Na plataforma de vendas, crie um webhook para os eventos de venda.',
    '2. Endereço para colar (método POST, corpo em JSON):',
    entrada.url,
    '3. Resposta esperada: 202. Se vier 401, o endereço foi copiado pela metade ou o segredo foi trocado: peça o endereço de novo.',
    '4. Depois de salvar, a próxima venda aprovada aparece em Eventos → Fila.',
    '',
    'Cuidado: o fim do endereço é o segredo. Quem tem o endereço consegue mandar vendas. Não publique em repositório, print ou grupo aberto.',
  ].join('\n');
}
