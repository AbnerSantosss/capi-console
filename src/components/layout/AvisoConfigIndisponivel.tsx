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
 *
 * Redesenho de 18/11/2026: o desenho do aviso compacto (o mesmo do `Callout`
 * de tom `danger`): ícone de 16px, título em `text-label`, texto em
 * `text-caption`. Não tem ação: o conserto é no volume, fora do console.
 */
export function AvisoConfigIndisponivel({ arquivo }: { arquivo: string }) {
  return (
    <section
      role="alert"
      className="flex min-w-0 items-start gap-2 rounded-control border border-danger/40 bg-danger/10 px-3 py-2"
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-label font-semibold text-fg-strong">
          Configuração indisponível — nada foi alterado
        </h2>
        <p className="text-caption text-fg-body">
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
