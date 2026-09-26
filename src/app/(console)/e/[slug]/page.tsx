import { VisaoGeral } from '@/components/visao-geral/VisaoGeral';
import { lerChecklistDaEmpresa } from '@/components/visao-geral/checklist-do-servidor';

import { empresaDosParams } from './empresa-do-slug';

export const dynamic = 'force-dynamic';

/**
 * Visão geral da empresa (`/e/<slug>`, V2 e V5 do v7). É a tela de chegada: o
 * login e a rota `/` levam para cá (o proxy responde 307 para a empresa ativa).
 *
 * O servidor lê os Pixels, a configuração e as entradas recentes DESTA
 * empresa e entrega à tela só o derivado: os 6 passos do checklist, os sinais
 * do fluxo Site → Pixel → CAPI → Meta e o envio automático em palavra. Nenhum
 * token, segredo de webhook ou dado de comprador desce para o navegador
 * (`checklist-do-servidor.ts`). Os números do período a tela busca sozinha,
 * porque mudam com o seletor.
 *
 * `key={empresaId}`: a mesma regra das outras abas (contrato de C2). Trocar de
 * empresa monta a tela do zero, sem número da empresa anterior.
 */
export default async function VisaoGeralDaEmpresa({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const empresa = await empresaDosParams(params);
  const empresaId = empresa.id;
  const { checklist, estado, envio } = await lerChecklistDaEmpresa(empresa);

  return (
    <VisaoGeral
      key={empresaId}
      empresaId={empresaId}
      slug={empresa.slug}
      nome={empresa.nome}
      checklist={checklist}
      estado={estado}
      envio={envio}
    />
  );
}
