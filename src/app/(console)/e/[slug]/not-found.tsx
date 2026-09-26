import Link from 'next/link';

import { EstadoVazio } from '@/components/common/EstadoVazio';
import consoleStyles from '@/components/layout/console.module.css';
import { buttonVariants } from '@/components/ui/button';

/**
 * "Empresa não encontrada" (V2 do v7): o slug de `/e/<slug>` não é de
 * nenhuma empresa cadastrada — link antigo de uma empresa apagada, slug
 * trocado, erro de digitação.
 *
 * O próximo passo é um só: a lista de empresas, onde está o endereço certo.
 *
 * Também é a tela do `notFound()` lançado pelo layout de `[slug]`: o
 * `not-found` de um segmento fica DENTRO do layout dele, então quem pega o
 * erro do layout é `e/not-found.tsx`, que reexporta este.
 *
 * Sem `icone`: `EstadoVazio` é componente de cliente, e um componente de
 * ícone não atravessa a fronteira servidor → cliente como prop. O ícone do
 * cenário "erro" já é o do produto.
 */
export default function EmpresaNaoEncontrada() {
  return (
    <main className={consoleStyles.page}>
      <EstadoVazio
        cenario="erro"
        titulo="Empresa não encontrada"
        motivo="Este endereço não é de nenhuma empresa cadastrada. A empresa pode ter sido apagada ou o link pode estar errado."
        acao={
          <Link href="/empresas" className={buttonVariants({ variant: 'default' })}>
            Ver as empresas
          </Link>
        }
      />
    </main>
  );
}
