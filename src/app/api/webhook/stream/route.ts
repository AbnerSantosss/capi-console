import { assinar, listarEntradas } from '@/lib/inbox';

export const dynamic = 'force-dynamic';

/** SSE: a caixa de entrada se atualiza sem refresh. */
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let cancelarAssinatura: (() => void) | undefined;
  let bater: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let fechado = false;

      const envia = (evento: string, dados: unknown) => {
        if (fechado) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`)
          );
        } catch {
          fechado = true;
        }
      };

      envia('inicial', await listarEntradas(50));
      // 'entrada' = item novo; 'atualizado' = status/resultado do disparo mudou.
      cancelarAssinatura = assinar((item, tipo) => envia(tipo === 'novo' ? 'entrada' : 'atualizado', item));

      // heartbeat: mantem a conexao viva atras de proxy
      bater = setInterval(() => {
        if (fechado) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          fechado = true;
        }
      }, 20000);

      request.signal.addEventListener('abort', () => {
        fechado = true;
        if (bater) clearInterval(bater);
        cancelarAssinatura?.();
        try {
          controller.close();
        } catch {
          /* ja fechado */
        }
      });
    },
    cancel() {
      if (bater) clearInterval(bater);
      cancelarAssinatura?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
