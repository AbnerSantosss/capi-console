import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  lerIntegracoes,
  salvarIntegracoes,
  novoSegredoEntrada,
  REGRAS_SEMENTE,
  type Integracoes,
} from '@/lib/config-store';

export const dynamic = 'force-dynamic';

/**
 * Uma regra invalida que passe daqui vira evento errado na Meta — ou pior, um
 * disparo automatico sem pixel definido. Por isso o PUT valida antes de gravar
 * e devolve 400 com a lista de problemas, em vez de salvar pela metade.
 */
const regraSchema = z
  .object({
    id: z.string().trim().min(1, 'id obrigatório'),
    eventoOrigem: z.string().trim().min(1, 'evento de origem obrigatório'),
    eventoMeta: z.string().trim(),
    marcas: z.array(z.string().trim().min(1)),
    modo: z.enum(['auto', 'fila', 'ignorar']),
    ativo: z.boolean(),
  })
  .refine((r) => r.modo === 'ignorar' || r.eventoMeta.length > 0, {
    message: 'evento da Meta é obrigatório quando o modo não é "ignorar"',
    path: ['eventoMeta'],
  })
  .refine((r) => r.modo !== 'auto' || r.marcas.length > 0, {
    message: 'modo automático exige ao menos um pixel selecionado',
    path: ['marcas'],
  });

const regrasSchema = z
  .array(regraSchema)
  .refine((rs) => new Set(rs.map((r) => r.id)).size === rs.length, { message: 'há regras com o mesmo id' });

/**
 * O segredo de entrada volta inteiro de proposito: o operador precisa copia-lo
 * para configurar o n8n, e este servidor roda em localhost, para ele mesmo.
 * O segredo nunca entra em log nem no payload de relay.
 */
export async function GET() {
  return NextResponse.json({ integracoes: await lerIntegracoes() });
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as Integracoes;
    const atual = await lerIntegracoes();

    let regras = atual.regras ?? REGRAS_SEMENTE();
    if (body.regras !== undefined) {
      const r = regrasSchema.safeParse(body.regras);
      if (!r.success) {
        const erros = r.error.issues.map((i) => `regra ${i.path.join('.') || '?'}: ${i.message}`);
        return NextResponse.json({ erro: 'Regras inválidas.', erros }, { status: 400 });
      }
      regras = r.data;
    }

    const salva = await salvarIntegracoes({
      entrada: {
        // o segredo so muda pela rota POST
        segredo: atual.entrada.segredo,
        modo: body.entrada?.modo === 'auto' ? 'auto' : 'fila',
      },
      regras,
      saida: Array.isArray(body.saida) ? body.saida : [],
    });

    return NextResponse.json({ integracoes: salva });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}

/** Gera um segredo novo. Invalida o anterior imediatamente. */
export async function POST() {
  return NextResponse.json({ segredo: await novoSegredoEntrada() });
}
