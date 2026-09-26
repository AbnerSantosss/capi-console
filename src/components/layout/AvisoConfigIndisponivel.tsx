import { AlertTriangle } from '@/components/ui/icones';

/**
 * Modo degradado de B1-e: o arquivo de configuração existe mas nem ele nem o
 * `.bak` puderam ser lidos.
 *
 * A tela precisa dizer três coisas, nessa ordem, porque é nessa ordem que o
 * operador decide o que fazer:
 *
 *  1. **nada foi alterado** — o medo legítimo de quem vê um erro vermelho num
 *     painel de configuração é que o erro tenha apagado algo. Não apagou: o
 *     segredo do webhook só muda por clique humano (B1-g);
 *  2. **onde olhar** — o caminho RELATIVO do arquivo, que é o que aparece
 *     dentro do container e no volume `capi_config`;
 *  3. **o que já está acontecendo sozinho** — os webhooks respondem 503, e a
 *     plataforma reentrega. Ninguém precisa correr.
 *
 * O conteúdo do arquivo NUNCA entra aqui: lá moram o segredo do webhook e o
 * token da Meta (regra 2 do CLAUDE.md).
 */
export function AvisoConfigIndisponivel({ arquivo }: { arquivo: string }) {
  return (
    <section
      role="alert"
      className="flex items-start gap-3 rounded-panel border border-danger bg-surface-1 p-4"
    >
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0 space-y-1">
        <h2 className="text-title font-semibold text-fg-strong">
          Configuração indisponível — nada foi alterado
        </h2>
        <p className="text-body text-fg-body">
          O arquivo <code className="font-mono text-fg-strong">{arquivo}</code> não pôde ser lido, e
          a cópia de segurança também não serviu. Nenhuma regra, Pixel ou segredo foi apagado ou
          regerado: o segredo de entrada do webhook só muda quando alguém clica para trocá-lo.
        </p>
        <p className="text-caption text-fg-muted">
          Enquanto isso, os webhooks respondem &ldquo;tente de novo mais tarde&rdquo; (503) em vez de
          recusar a entrega, então a plataforma continua reenviando os eventos. Restaure o arquivo no
          volume <code className="font-mono">capi_config</code> e recarregue esta página.
        </p>
      </div>
    </section>
  );
}
