import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  lerIntegracoes,
  salvarIntegracoes,
  novoSegredoEntrada,
  normalizarRotulo,
  erroDoRotulo,
  rotuloDaConfig,
  REGRAS_SEMENTE,
  novaChaveTag,
  type Integracoes,
} from '@/lib/config-store';
import { normalizarDominio, erroDoDominio, type DominioTag } from '@/lib/tag-dominios';
import { exigirSessao } from '@/lib/sessao';

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
 * Um dominio que passe torto daqui vai direto para a lista branca do coletor —
 * e a lista branca de Origin e a UNICA tranca do endpoint publico, porque a
 * chave da tag e legivel por qualquer visitante. Host mal formado abre o
 * coletor para site que nao e nosso, ou (o caso comum) nunca casa com Origin
 * nenhum e o cliente fica esperando dados de uma tag que o servidor recusa em
 * silencio. Por isso o host passa pelo MESMO par normalizar+validar que a tela
 * e o coletor usam, nunca por uma regex escrita de novo aqui.
 */
const dominioSchema = z
  .object({
    id: z.string().trim().min(1, 'id obrigatório'),
    host: z.string().trim().min(1, 'domínio obrigatório'),
    subdominio: z.string().trim().optional(),
    criadoEm: z.string().trim().min(1, 'data de cadastro obrigatória'),
    ultimoHit: z.string().trim().optional(),
    hits: z.number().int().min(0, 'contador de hits inválido'),
  })
  .transform((d) => ({
    ...d,
    host: normalizarDominio(d.host),
    // '' viraria um subdominio vazio e `hostDaTag` montaria '.loja.com.br'.
    subdominio: d.subdominio?.trim() ? d.subdominio.trim().toLowerCase() : undefined,
  }))
  .superRefine((d, ctx) => {
    const erro = erroDoDominio(d.host);
    if (erro) ctx.addIssue({ code: 'custom', message: erro, path: ['host'] });
  });

/** Teto de 50: config/integracoes.json e reescrito inteiro, sem banco e sem lock. */
const dominiosSchema = z
  .array(dominioSchema)
  .max(50, 'máximo de 50 domínios cadastrados')
  .refine((ds) => new Set(ds.map((d) => d.id)).size === ds.length, {
    message: 'há domínios com o mesmo id',
  })
  .refine((ds) => new Set(ds.map((d) => d.host)).size === ds.length, {
    // Host repetido nao quebra o CORS, mas duplica o contador de hits em telas
    // diferentes e faz o operador achar que apagou um dominio que continua ativo.
    message: 'há domínio repetido na lista',
  });

/** Corpo do POST. Sem corpo = gira o segredo de entrada, como era antes. */
const alvoSchema = z.object({
  alvo: z.enum(['entrada', 'tag']).default('entrada'),
});

/**
 * O segredo de entrada volta inteiro de proposito: o operador precisa copia-lo
 * para configurar o n8n, e este servidor roda em localhost, para ele mesmo.
 * O segredo nunca entra em log nem no payload de relay.
 */
export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    return NextResponse.json({ integracoes: await lerIntegracoes() });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    exigirSessao(request);
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

    // O rotulo e cosmetico, mas some do arquivo se nao for reescrito aqui — e
    // sem ele a URL divulgada ao xWinner deixa de bater com a configurada.
    let rotulo = rotuloDaConfig(atual);
    if (body.entrada?.rotulo !== undefined) {
      const limpo = normalizarRotulo(body.entrada.rotulo);
      const erro = erroDoRotulo(limpo);
      if (erro) {
        return NextResponse.json({ erro: `Apelido da URL inválido. ${erro}` }, { status: 400 });
      }
      rotulo = limpo;
    }

    // `tag` PRECISA ser reescrito aqui: este handler reconstroi o objeto campo
    // a campo, entao o que nao aparecer nesta lista some do disco em QUALQUER
    // save — inclusive num save disparado pela aba de Regras, que nem sabe que
    // a tag existe. Perder isto apaga a lista branca de dominios e derruba a
    // coleta de todos os clientes de uma vez.
    let tag = atual.tag;
    if (body.tag !== undefined) {
      const lista = body.tag?.dominios;
      if (!Array.isArray(lista)) {
        return NextResponse.json(
          { erro: 'Domínios inválidos.', erros: ['envie a lista de domínios da tag'] },
          { status: 400 }
        );
      }
      const d = dominiosSchema.safeParse(lista);
      if (!d.success) {
        const erros = d.error.issues.map((i) => `domínio ${i.path.join('.') || '?'}: ${i.message}`);
        return NextResponse.json({ erro: 'Domínios inválidos.', erros }, { status: 400 });
      }

      // `hits` e `ultimoHit` sao escritos SO pelo coletor, nunca pela tela.
      // Aceitar o que o corpo mandou zeraria o contador a cada save, e o
      // contador e a unica resposta honesta para "o cliente instalou a tag?".
      const anteriores = new Map(atual.tag.dominios.map((x) => [x.id, x]));
      const dominios: DominioTag[] = d.data.map((x) => {
        const antes = anteriores.get(x.id);
        return { ...x, hits: antes?.hits ?? 0, ultimoHit: antes?.ultimoHit };
      });

      // a chave so muda pela rota POST, igual ao segredo de entrada
      tag = { chave: atual.tag.chave, dominios };
    }

    const salva = await salvarIntegracoes({
      entrada: {
        // o segredo so muda pela rota POST
        segredo: atual.entrada.segredo,
        modo: body.entrada?.modo === 'auto' ? 'auto' : 'fila',
        rotulo,
      },
      regras,
      saida: Array.isArray(body.saida) ? body.saida : [],
      tag,
    });

    return NextResponse.json({ integracoes: salva });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}

/**
 * Gera uma credencial nova. Invalida a anterior imediatamente.
 *
 * `alvo: 'entrada'` (o padrao, para nao quebrar quem ja chamava esta rota sem
 * corpo) gira o segredo do xWinner — e ai a entrega de vendas para ate o
 * segredo novo ser colado la. `alvo: 'tag'` gira so a chave publica da tag, que
 * nao autentica venda nenhuma: o custo e o cliente recolar o codigo no site.
 * Confundir os dois e caro nos dois sentidos, por isso o discriminador e
 * explicito e um alvo desconhecido vira 400 em vez de cair no padrao.
 */
export async function POST(request: NextRequest) {
  try {
    exigirSessao(request);

    // Corpo vazio nao e erro: e exatamente a chamada antiga, de antes de a
    // chave da tag existir.
    const corpo = await request.json().catch(() => ({}));
    const a = alvoSchema.safeParse(corpo && typeof corpo === 'object' ? corpo : {});
    if (!a.success) {
      const erros = a.error.issues.map((i) => `${i.path.join('.') || 'alvo'}: ${i.message}`);
      return NextResponse.json({ erro: 'Alvo inválido.', erros }, { status: 400 });
    }

    if (a.data.alvo === 'tag') return NextResponse.json({ chave: await novaChaveTag() });
    return NextResponse.json({ segredo: await novoSegredoEntrada() });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  }
}
