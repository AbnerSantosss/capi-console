import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  ErroDeEmpresa,
  LOGO_MAX_CARACTERES,
  acharEmpresa,
  idDeEmpresaValido,
  listarEmpresas,
  novoIdEmpresa,
  publicarEmpresa,
  removerEmpresa,
  salvarEmpresa,
} from '@/lib/empresas';
import { criarIntegracoesDaEmpresa } from '@/lib/config-store';
import { empresaDaRequisicao } from '@/lib/empresa-ativa';
import { exigirSessao } from '@/lib/sessao';
import { erroDeRota, respostaErro } from '@/lib/erro-api';

export const dynamic = 'force-dynamic';

/**
 * Registro de empresas do console (FASE D do plano multi-empresa).
 *
 * 🔴 D-19 — **esta rota não aceita credencial nenhuma.** Pixel ID, token de
 * acesso e código de teste vão por `PUT /api/marcas`, que já existe, já valida
 * e já guarda o token fora do que volta para a tela (`MarcaPublica` só tem
 * `temToken: boolean`). Criar empresa com o primeiro Pixel são DUAS chamadas de
 * propósito: não há transação entre dois arquivos JSON, e é melhor uma empresa
 * sem Pixel — visível e corrigível em `/pixels` — do que uma rota que grava em
 * dois arquivos e pode deixar meio-estado invisível.
 *
 * Por isso o corpo com `accessToken` é **recusado com 400 e mensagem
 * explícita**, em vez de ignorado em silêncio: um cliente que mandasse o token
 * para cá e recebesse 200 acharia que salvou o Pixel, e o token ficaria
 * viajando por um caminho que não foi feito para ele.
 */

/** Chaves que nunca entram num objeto vindo da rede. */
const PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Campos de credencial que NÃO moram numa empresa (D-19).
 *
 * A lista é de nomes, não de tipos: o que interessa é a INTENÇÃO de quem
 * chamou. Qualquer um deles no corpo derruba o pedido inteiro, e nada é gravado.
 */
const CREDENCIAIS = ['accessToken', 'pixelId', 'testCode', 'token', 'segredo'] as const;

/** Corpo como objeto simples, sem as chaves que envenenariam o protótipo. */
function corpoSeguro(bruto: unknown): Record<string, unknown> {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bruto)) {
    if (!PROIBIDAS.has(k)) limpo[k] = v;
  }
  return limpo;
}

/**
 * O esquema do corpo do PUT.
 *
 * Não usa `.passthrough()` — ao contrário do `PUT /api/integracoes`, e o motivo
 * é o oposto do de lá. Lá o corpo é MESCLADO sobre o objeto lido do disco, e
 * podar uma chave desconhecida apagaria em silêncio um campo novo (B12-b). Aqui
 * `salvarEmpresa()` monta a empresa campo a campo, então o que este esquema não
 * conhece nunca chega ao disco — e é assim que se garante, com uma linha em vez
 * de uma auditoria, que credencial nenhuma se hospeda em `empresas.json`.
 *
 * Os limites de tamanho repetem os de `empresas.ts` de propósito: aqui eles
 * viram 400 com a lista de campos, lá eles são a última trava antes do `fsync`.
 */
const empresaSchema = z.object({
  id: z.string().trim().optional(),
  nome: z.string().trim().min(2, 'o nome precisa ter ao menos 2 caracteres').max(60, 'no máximo 60 caracteres'),
  slug: z.string().trim().max(40, 'no máximo 40 caracteres').optional(),
  plataforma: z.string().trim().max(40, 'no máximo 40 caracteres').optional(),
  logoDataUrl: z
    .string()
    .trim()
    .max(LOGO_MAX_CARACTERES, 'a imagem precisa ter no máximo 150 KB')
    .refine((v) => v === '' || /^data:image\/(?:png|jpeg|svg\+xml|webp);base64,/.test(v), {
      message: 'envie uma imagem PNG, JPEG, SVG ou WebP',
    })
    .optional(),
  logoUrl: z.string().trim().max(300, 'no máximo 300 caracteres').optional(),
  cor: z
    .string()
    .trim()
    .refine((v) => v === '' || /^#[0-9a-fA-F]{6}$/.test(v), { message: 'use o formato #rrggbb' })
    .optional(),
});

/**
 * Lista as empresas.
 *
 * Nada aqui é segredo (D-19), então a resposta é a entidade inteira — inclusive
 * `logoDataUrl`, que é o que o seletor do cabeçalho desenha. `publicarEmpresa`
 * atravessa a borda mesmo sendo cópia rasa hoje: é o ponto único onde um campo
 * interno seria removido, se um dia existir.
 *
 * `ativa` vem junto porque o servidor JÁ resolveu a empresa da requisição para
 * poder responder — e a tela precisa exatamente desse valor. Sem ele, o store
 * teria que adivinhar a mesma regra de header→cookie→default no navegador, e
 * duas cópias da mesma regra é uma cópia errada.
 */
export async function GET(request: NextRequest) {
  try {
    exigirSessao(request);
    const empresas = await listarEmpresas();
    return NextResponse.json({
      empresas: empresas.map(publicarEmpresa),
      ativa: await empresaDaRequisicao(request),
    });
  } catch (e) {
    return erroDeRota(e, 'Não foi possível listar as empresas.');
  }
}

/**
 * Cria ou atualiza uma empresa.
 *
 * Sem `id` no corpo = criação, com id novo gerado aqui. Com `id` = edição da
 * empresa daquele id — inclusive a `default`, que pode ter nome, logo e cor
 * trocados (é assim que o dono sobe a logo do Código Vencedor) mas nunca pode
 * ser apagada.
 */
export async function PUT(request: NextRequest) {
  try {
    exigirSessao(request);
    const body = corpoSeguro(await request.json());

    // 🔴 D-19 — ver o bloco no topo do arquivo. Recusa explícita, não silêncio.
    const credenciais = CREDENCIAIS.filter((c) => body[c] !== undefined);
    if (credenciais.length) {
      return respostaErro(
        'Esta rota não guarda Pixel nem token — nada foi alterado. Salve a empresa aqui e o Pixel em Pixels.',
        400,
        credenciais.map((c) => `o campo "${c}" não pertence a uma empresa; use PUT /api/marcas`)
      );
    }

    const r = empresaSchema.safeParse(body);
    if (!r.success) {
      const erros = r.error.issues.map((i) => `${i.path.join('.') || 'corpo'}: ${i.message}`);
      return respostaErro('Não foi possível salvar a empresa — nada foi alterado.', 400, erros);
    }

    const dados = r.data;
    const id = dados.id?.trim() || novoIdEmpresa();
    if (!idDeEmpresaValido(id)) {
      // O id vira nome de arquivo na FASE E (`integracoes.<id>.json`). A cerca
      // está em `empresas.ts`; aqui ela só vira uma frase legível.
      return respostaErro('Id de empresa inválido — nada foi alterado.', 400);
    }

    const existia = Boolean(await acharEmpresa(id));

    const empresa = await salvarEmpresa({
      id,
      nome: dados.nome,
      ...(dados.slug !== undefined ? { slug: dados.slug } : {}),
      ...(dados.plataforma !== undefined ? { plataforma: dados.plataforma } : {}),
      ...(dados.logoDataUrl !== undefined ? { logoDataUrl: dados.logoDataUrl } : {}),
      ...(dados.logoUrl !== undefined ? { logoUrl: dados.logoUrl } : {}),
      ...(dados.cor !== undefined ? { cor: dados.cor } : {}),
    });

    /**
     * FASE E — a empresa nova nasce com webhook e tag próprios:
     * `config/integracoes.<id>.json`, com segredo de entrada e chave de tag
     * gerados ali e só as sementes da tag (nunca as 41 regras do xWinner, que
     * são do Código Vencedor e não do produto).
     *
     * Só na CRIAÇÃO. Num save de edição a função devolveria `null` porque o
     * arquivo já existe — e 🔴 é essa recusa que impede que salvar o nome de uma
     * empresa gire o segredo de webhook dela, que já está cadastrado na
     * plataforma do cliente. `config/integracoes.json`, da `default`, está fora
     * de alcance por construção: a função recusa `id === 'default'` (E-4).
     */
    let integracoesPendentes = false;
    if (!existia) {
      try {
        await criarIntegracoesDaEmpresa({ id: empresa.id, slug: empresa.slug });
      } catch (falha) {
        /**
         * 🔴 A empresa JÁ está gravada, e falhar aqui NÃO a desfaz.
         *
         * Apagá-la de volta descartaria um cadastro válido por causa de um disco
         * cheio; e um 500 mudo faria a tela achar que nada foi salvo, levando o
         * operador a criar a mesma empresa de novo e esbarrar num apelido
         * repetido. Então a resposta continua 200 e `integracoesPendentes` diz o
         * que falta — o mesmo contrato de "empresa criada, resto pendente" que o
         * diálogo já sabe tratar na etapa do Pixel.
         *
         * Conserto: abrir Instalação com a empresa nova ativa. A primeira leitura
         * cria o arquivo que faltou (`resolverIntegracoes`, estado 'ausente'),
         * com apelido de URL igual ao id em vez do slug — cosmético e editável
         * na própria tela.
         */
        console.error(
          '  empresa criada, mas as integracoes dela nao:',
          falha instanceof Error ? falha.message : falha
        );
        integracoesPendentes = true;
      }
    }

    return NextResponse.json({
      empresa: publicarEmpresa(empresa),
      criada: !existia,
      integracoesPendentes,
    });
  } catch (e) {
    // `ErroDeEmpresa` carrega uma frase escrita para o operador (apelido
    // repetido, teto de empresas, logo grande demais) e nunca carrega segredo —
    // `empresas.json` não tem nenhum. Por isso ela atravessa; qualquer outro
    // erro continua caindo na frase genérica, como manda B10-d.
    if (e instanceof ErroDeEmpresa) return respostaErro(e.message, 400);
    return erroDeRota(e, 'Não foi possível salvar a empresa — nada foi alterado.', 400);
  }
}

/**
 * Apaga uma empresa (D-17).
 *
 * Confirmação NO SERVIDOR, como o `DELETE /api/inbox` (B11-b): apagar arrasta
 * os Pixels da empresa junto, e isso não pode ser acionável por um clique
 * perdido, por uma aba velha repetindo a requisição nem por um `curl` de teste.
 *
 * As três travas (padrão intocável, automático ligado, remoção dos Pixels antes
 * da empresa) moram em `removerEmpresa()`, não aqui: quem chamar aquela função
 * de um script de manutenção recebe as mesmas recusas.
 */
export async function DELETE(request: NextRequest) {
  try {
    exigirSessao(request);

    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!id) return respostaErro('Informe o id da empresa a apagar.', 400);

    // Corpo ausente ou ilegível NÃO é erro de JSON aqui: é falta de confirmação.
    const corpo: unknown = await request.json().catch(() => null);
    const confirmado =
      typeof corpo === 'object' && corpo !== null && (corpo as { confirmar?: unknown }).confirmar === true;

    if (!confirmado) {
      return respostaErro(
        'Apagar a empresa remove também os Pixels dela. Reenvie com {"confirmar": true} — nada foi alterado.',
        400
      );
    }

    await removerEmpresa(id);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof ErroDeEmpresa) return respostaErro(e.message, 400);
    return erroDeRota(e, 'Não foi possível apagar a empresa — nada foi alterado.', 400);
  }
}
