import { assinar, listarEntradas, type ItemInbox } from '@/lib/inbox';
import { EMPRESA_DEFAULT_ID } from '@/lib/config-store';
import { empresaDaRequisicao } from '@/lib/empresa-ativa';
import { exigirSessao } from '@/lib/sessao';
import { erroDeRota } from '@/lib/erro-api';

export const dynamic = 'force-dynamic';
/** Resposta longa e viva: nada aqui pode ser guardado nem reaproveitado. */
export const fetchCache = 'force-no-store';

/**
 * Preambulo de 2 KB em comentario SSE (linha iniciada por ':' e ignorada pelo
 * EventSource). Buffer de proxy costuma segurar a resposta ate encher alguns
 * KB; com o preambulo, o primeiro byte util chega na hora e a tela deixa de
 * parecer morta na abertura. E cinto e suspensorio junto com o
 * X-Accel-Buffering: no — o caminho ate aqui passa por tunel e proxy que este
 * arquivo nao controla.
 */
const PREAMBULO = `:${' '.repeat(2048)}\n\n`;

/**
 * SSE: a caixa de entrada se atualiza sem refresh.
 *
 * B-11 — o stream carrega TODO item da caixa de entrada, `payload` cru
 * incluido: e a mesma PII do `GET /api/inbox`, so que ao vivo. Dependia do
 * matcher do proxy e mais nada.
 *
 * A guarda fica ANTES de montar o ReadableStream: uma conexao sem sessao tem de
 * morrer no 401, nunca ficar aberta batendo pulso a cada 20 s.
 */
export async function GET(request: Request) {
  let empresaId: string;
  try {
    exigirSessao(request);
    // A empresa e resolvida ANTES de o stream abrir: uma vez dentro do
    // ReadableStream nao ha mais para onde devolver 401 ou 503 — os headers da
    // resposta ja foram enviados.
    empresaId = await empresaDaRequisicao(request);
  } catch (e) {
    return erroDeRota(e, 'Não foi possível abrir o canal de eventos ao vivo.', 401);
  }

  const encoder = new TextEncoder();
  let encerrar = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      let fechado = false;
      // Inicializados aqui e reatribuidos abaixo: encerrar() precisa ve-los.
      let bater: ReturnType<typeof setInterval> | undefined = undefined;
      let cancelarAssinatura: (() => void) | undefined = undefined;

      // Uma so porta de saida, chamada pelo abort, pelo cancel e por falha de
      // escrita. Antes o intervalo podia continuar batendo numa conexao morta.
      encerrar = () => {
        if (fechado) return;
        fechado = true;
        if (bater) clearInterval(bater);
        cancelarAssinatura?.();
        try {
          controller.close();
        } catch {
          /* ja fechado do outro lado */
        }
      };

      const envia = (evento: string, dados: unknown) => {
        if (fechado) return;
        try {
          controller.enqueue(encoder.encode(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`));
        } catch {
          encerrar();
        }
      };

      try {
        controller.enqueue(encoder.encode(PREAMBULO));
      } catch {
        encerrar();
        return;
      }

      // Assina ANTES de ler a lista: item que chega no meio da leitura do disco
      // cai na fila `pendentes` em vez de sumir — janela curta, mas quem se
      // perdia nela era justamente a entrega recem-chegada.
      const pendentes: Array<{ item: ItemInbox; tipo: 'novo' | 'atualizado' }> = [];
      let inicialEnviada = false;
      cancelarAssinatura = assinar((item, tipo) => {
        // O ouvinte e global: recebe o que chega de QUALQUER empresa. Sem este
        // filtro a venda de um cliente apareceria, ao vivo, na tela de outro.
        if ((item.empresaId ?? EMPRESA_DEFAULT_ID) !== empresaId) return;
        if (!inicialEnviada) {
          pendentes.push({ item, tipo });
          return;
        }
        envia(tipo === 'novo' ? 'entrada' : 'atualizado', item);
      });

      let inicial: ItemInbox[] = [];
      try {
        inicial = await listarEntradas(50, empresaId);
      } catch {
        /* sem historico legivel: a conexao continua valendo para o que vier */
      }
      envia('inicial', inicial);
      inicialEnviada = true;

      // TODO item sobe para a tela, inclusive ignorado, teste da plataforma e
      // nome desconhecido: filtrar exibicao e trabalho da interface, nao daqui.
      const jaNaInicial = new Set(inicial.map((i) => i.id));
      for (const p of pendentes) {
        if (p.tipo === 'novo' && jaNaInicial.has(p.item.id)) continue;
        envia(p.tipo === 'novo' ? 'entrada' : 'atualizado', p.item);
      }
      pendentes.length = 0;

      // Pulso nomeado, e nao comentario: o cliente consegue ouvir 'pulso' e
      // saber que o canal esta vivo, em vez de so supor.
      bater = setInterval(() => envia('pulso', { em: new Date().toISOString() }), 20_000);

      request.signal.addEventListener('abort', () => encerrar());
    },
    cancel() {
      encerrar();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform faz o Next pular a compressao (o gzip junta bytes e segura
      // o evento); X-Accel-Buffering desliga o buffer do nginx/tunel na frente.
      // 'Connection: keep-alive' saiu: e header hop-by-hop, ignorado em HTTP/2
      // e que a aplicacao nao deve definir.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
