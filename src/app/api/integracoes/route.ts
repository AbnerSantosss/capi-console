import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  lerIntegracoes,
  atualizarIntegracoes,
  novoSegredoEntrada,
  normalizarRotulo,
  erroDoRotulo,
  rotuloDaConfig,
  REGRAS_SEMENTE,
  novaChaveTag,
  type Integracoes,
  type RegraRoteamento,
  type DestinoRelay,
} from '@/lib/config-store';
import { normalizarDominio, erroDoDominio, type DominioTag } from '@/lib/tag-dominios';
import { exigirSessao } from '@/lib/sessao';
import { erroDeRota, respostaErro } from '@/lib/erro-api';

export const dynamic = 'force-dynamic';

/**
 * Uma regra invalida que passe daqui vira evento errado na Meta — ou pior, um
 * disparo automatico sem pixel definido. Por isso o PUT valida antes de gravar
 * e devolve 400 com a lista de problemas, em vez de salvar pela metade.
 *
 * B12-b — `.passthrough()` vem ANTES dos `.refine()` (depois de um refine o
 * esquema deixa de ser um ZodObject e o metodo some).
 *
 * Sem ele, o Zod 4 poda em silencio qualquer chave que este esquema nao
 * conheca, e `regras = r.data` grava o objeto ja podado: um campo novo de regra
 * seria apagado no PRIMEIRO save — inclusive pela propria versao que acabou de
 * escreve-lo. O bug aparece como "o valor nao salva" e leva horas para achar.
 *
 * B12-e — `.passthrough()` NAO e licenca para campo livre: ele preserva o que
 * uma versao futura escrever, e nao relaxa nenhuma validacao. O que e validado
 * continua validado, exatamente como antes.
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
  .passthrough()
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
 * B12-d — `saida` nao tinha esquema NENHUM: o array ia cru do corpo para o
 * disco. Hoje ha 0 destinos cadastrados, entao ninguem sentiu; no dia em que
 * houver um, um destino mal formado vira uma requisicao de saida para uma URL
 * qualquer, com os headers que vierem.
 *
 * `.passthrough()` pelo mesmo motivo de B12-b.
 */
const destinoSchema = z
  .object({
    id: z.string().trim().min(1, 'id obrigatório'),
    nome: z.string().trim(),
    url: z
      .string()
      .trim()
      .min(1, 'URL obrigatória')
      .refine((u) => /^https?:\/\//i.test(u), 'a URL precisa começar com http:// ou https://'),
    headers: z.record(z.string(), z.string()),
    eventos: z.array(z.enum(['dispatch.success', 'dispatch.error', 'inbox.received'])),
    ativo: z.boolean(),
  })
  .passthrough();

const saidaSchema = z
  .array(destinoSchema)
  .max(20, 'máximo de 20 destinos de saída')
  .refine((ds) => new Set(ds.map((d) => d.id)).size === ds.length, {
    message: 'há destinos com o mesmo id',
  });

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

/** Chaves que nunca entram num objeto vindo da rede. */
const PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

/** Corpo como objeto simples, sem as chaves que envenenariam o prototipo. */
function corpoSeguro(bruto: unknown): Partial<Integracoes> & Record<string, unknown> {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bruto)) {
    if (!PROIBIDAS.has(k)) limpo[k] = v;
  }
  return limpo as Partial<Integracoes> & Record<string, unknown>;
}

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
    // Antes: qualquer falha virava 401. Configuracao ilegivel precisa chegar na
    // tela como 503 com o caminho do arquivo — 401 manda o operador refazer o
    // login e esconder a causa real (portao D33).
    return erroDeRota(e, 'Não foi possível ler as integrações.');
  }
}

/**
 * B12-a — este handler RECONSTRUIA o objeto campo a campo. Toda chave de topo,
 * e toda chave dentro de `entrada`, que nao estivesse escrita aqui sumia do
 * disco em QUALQUER save — inclusive num save disparado pela aba de Regras, que
 * nem sabe que a tag existe.
 *
 * Agora ele faz o mesmo que `salvarMarca` sempre fez (`config-store.ts:143-153`):
 * mescla o corpo recebido SOBRE o objeto lido do disco. O que ele nao conhece
 * atravessa o round-trip inteiro.
 *
 * B2-b — leitura e gravacao acontecem dentro da MESMA fila
 * (`atualizarIntegracoes`). Antes eram duas operacoes separadas, e entre elas
 * cabia o contador de hits da Tag apagando o save do operador.
 */
export async function PUT(request: NextRequest) {
  try {
    exigirSessao(request);
    const body = corpoSeguro(await request.json());

    const salva = await atualizarIntegracoes((atual) => {
      let regras: RegraRoteamento[] = atual.regras ?? REGRAS_SEMENTE();
      if (body.regras !== undefined) {
        const r = regrasSchema.safeParse(body.regras);
        if (!r.success) {
          const erros = r.error.issues.map((i) => `regra ${i.path.join('.') || '?'}: ${i.message}`);
          throw respostaErro('Não foi possível salvar as regras — nada foi alterado.', 400, erros);
        }
        regras = r.data as RegraRoteamento[];
      }

      // B12-c — `saida` ausente significa "nao mexi nisso", nao "apague". Antes
      // um save de regra que nao reenviasse `saida` zerava a lista de destinos.
      // So um `saida: []` EXPLICITO no corpo esvazia.
      let saida: DestinoRelay[] = Array.isArray(atual.saida) ? atual.saida : [];
      if (body.saida !== undefined) {
        const s = saidaSchema.safeParse(body.saida);
        if (!s.success) {
          const erros = s.error.issues.map((i) => `destino ${i.path.join('.') || '?'}: ${i.message}`);
          throw respostaErro('Não foi possível salvar os destinos — nada foi alterado.', 400, erros);
        }
        saida = s.data as DestinoRelay[];
      }

      // O rotulo e cosmetico, mas some do arquivo se nao for reescrito aqui — e
      // sem ele a URL divulgada ao xWinner deixa de bater com a configurada.
      let rotulo = rotuloDaConfig(atual);
      if (body.entrada?.rotulo !== undefined) {
        const limpo = normalizarRotulo(body.entrada.rotulo);
        const erro = erroDoRotulo(limpo);
        if (erro) throw respostaErro(`Apelido da URL inválido. ${erro}`, 400);
        rotulo = limpo;
      }

      let tag = atual.tag;
      if (body.tag !== undefined) {
        const lista = body.tag?.dominios;
        if (!Array.isArray(lista)) {
          throw respostaErro('Não foi possível salvar os domínios — nada foi alterado.', 400, [
            'envie a lista de domínios da tag',
          ]);
        }
        const d = dominiosSchema.safeParse(lista);
        if (!d.success) {
          const erros = d.error.issues.map((i) => `domínio ${i.path.join('.') || '?'}: ${i.message}`);
          throw respostaErro('Não foi possível salvar os domínios — nada foi alterado.', 400, erros);
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
        tag = { ...atual.tag, chave: atual.tag.chave, dominios };
      }

      return {
        // 1) tudo o que ja estava no disco, na ordem em que estava;
        ...atual,
        // 2) o que o corpo mandou por cima — inclusive chave que este handler
        //    nao conhece, que e o ponto inteiro de B12-a;
        ...body,
        // 3) e os blocos validados, que tem a ultima palavra.
        entrada: {
          ...atual.entrada,
          ...(body.entrada ?? {}),
          // o segredo so muda pela rota POST, por clique humano (B1-g)
          segredo: atual.entrada.segredo,
          // campo legado e nao lido; `undefined` no corpo significa "nao mexi"
          modo:
            body.entrada?.modo !== undefined
              ? body.entrada.modo === 'auto'
                ? 'auto'
                : 'fila'
              : (atual.entrada.modo ?? 'fila'),
          rotulo,
        },
        regras,
        saida,
        tag,
      } satisfies Integracoes;
    });

    return NextResponse.json({ integracoes: salva });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível salvar as integrações — nada foi alterado.', 400);
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
 *
 * 🔴 Este handler e o UNICO caminho que troca o segredo de entrada (B1-g).
 * Nenhuma falha de leitura, nenhuma restauracao e nenhum boot chega aqui.
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
      return respostaErro('Alvo inválido.', 400, erros);
    }

    if (a.data.alvo === 'tag') return NextResponse.json({ chave: await novaChaveTag() });
    return NextResponse.json({ segredo: await novoSegredoEntrada() });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível gerar a credencial — nada foi alterado.');
  }
}
