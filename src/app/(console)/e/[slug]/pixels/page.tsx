import { Target } from '@/components/ui/icones';

import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import consoleStyles from '@/components/layout/console.module.css';
import { PixelsPanel } from '@/components/pixels/PixelsPanel';

import { empresaDosParams } from '../empresa-do-slug';

export const dynamic = 'force-dynamic';

/**
 * Pixels da empresa (`/e/<slug>/pixels`, V2 do v7): a antiga `/pixels`, agora
 * dentro da empresa do endereço.
 *
 * A lista carrega no cliente, pelo `useBrandStore`, que lê os Pixels da empresa
 * ativa do store — e o `EmpresaDoEndereco` do layout já alinhou o store à
 * empresa deste endereço antes de o painel montar. `key={empresaId}`: o painel
 * remonta por empresa (contrato de C2).
 */
export default async function PixelsDaEmpresa({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const empresa = await empresaDosParams(params);
  const empresaId = empresa.id;

  return (
    <main className={consoleStyles.page} data-area="pixels">
      <ConsolePageHeader
        title="Pixels"
        description="Cada Pixel guarda o número, o token da API de Conversões e o código de teste — é ele que separa teste de venda real."
        icon={Target}
      />
      <PixelsPanel key={empresaId} />
    </main>
  );
}
