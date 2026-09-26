import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';

// Escrita atômica com backup (B-1) e fila por arquivo (B-2). Mesma porta que
// `config-store.ts` usa: nenhum `fs.writeFile` direto pode aparecer aqui — o
// teste C15 (`scripts/persistencia-atomica.test.mjs`) reprova o build se voltar.
import { ErroConfiguracaoIndisponivel, gravarAtomico, naFila } from './arquivo-atomico';

// `normalizarRotulo`/`erroDoRotulo` são reaproveitados de propósito: o `slug` da
// empresa VIRA o rótulo padrão da URL de webhook dela (D-15). Se as duas regras
// de slug fossem escritas separadas, uma empresa poderia nascer com um apelido
// que o endpoint recusa — e o operador só descobriria quando a venda não
// entrasse. `listarMarcas`/`removerMarca` entram porque apagar uma empresa
// arrasta os Pixels dela (D-17), e o dono do arquivo `marcas.json` continua
// sendo o `config-store.ts`: aqui não se abre um segundo caminho de escrita.
import {
  EMPRESA_DEFAULT_ID,
  aposentarIntegracoesDaEmpresa,
  empresaDaMarca,
  erroDoRotulo,
  idDeEmpresaValido,
  lerComBackup,
  lerIntegracoes,
  listarMarcas,
  normalizarRotulo,
  removerMarca,
  segredoConfere,
  type Integracoes,
} from './config-store';

/**
 * Reexportados de propósito: para quem trabalha com empresas, o lugar natural
 * destes três é AQUI, e era daqui que vinham antes da FASE D.1.
 *
 * Eles moram em `config-store.ts` porque é aquele arquivo que filtra Pixel por
 * empresa (`listarMarcas(empresaId?)`) e ele já é importado por este — definir
 * lá e reexportar aqui mantém UMA definição sem fechar ciclo de import. A
 * justificativa completa de cada um está no JSDoc deles, no `config-store.ts`.
 */
export { EMPRESA_DEFAULT_ID, empresaDaMarca, idDeEmpresaValido };

/**
 * Registro das empresas rastreadas por este console (P8/P9 do plano
 * `wiki/plano-multi-empresa-instalacao.md`, FASE D).
 *
 * Por que um arquivo NOVO, e não mais um bloco dentro de `config-store.ts`:
 *
 *  - 🔴 E-4: `config/integracoes.json` é o arquivo que guarda o segredo que a
 *    plataforma de vendas usa HOJE para entregar venda. Toda linha que este
 *    módulo não precisa tocar nele é uma linha a menos de risco de regressão no
 *    único caminho que traz dinheiro.
 *  - D-2: a empresa padrão continua lendo `config/marcas.json` e
 *    `config/integracoes.json` exatamente como hoje. `config/empresas.json`
 *    pode nem existir — e a ausência dele NÃO é erro: significa "só existe a
 *    empresa padrão".
 *  - 🔴 D-19: **token de acesso da Meta nunca passa por aqui.** Ele continua em
 *    `marcas.json`, gravado só por `salvarMarca()`, pelo caminho que já existe e
 *    que o `check:segredos` vigia. `Empresa` não tem campo de credencial nenhum,
 *    e `salvarEmpresa()` monta o objeto campo a campo justamente para que uma
 *    chave a mais vinda da rede não consiga se hospedar neste arquivo.
 */

const DIR = path.join(process.cwd(), 'config');
const ARQ_EMPRESAS = path.join(DIR, 'empresas.json');

/* ------------------------------------------------------------------ */
/* A entidade                                                          */
/* ------------------------------------------------------------------ */

/** Uma empresa/cliente rastreado por este console. Dona de Pixels, webhook, tag, regras e caixa. */
export interface Empresa {
  /** 'default' é a primeira e nunca é apagada. Demais: `emp_<Date.now().toString(36)>`. */
  id: string;
  nome: string;
  /** Apelido em kebab-case, único; vira rótulo padrão da URL de webhook (D-15). */
  slug: string;
  /** Nome da plataforma de vendas desta empresa (ex.: "xWinner", "Hotmart"). Vai para os textos (D-16). */
  plataforma?: string;
  /** data URI (png/jpeg/svg/webp, ≤ 150 KB de imagem). Ausente = avatar com iniciais. */
  logoDataUrl?: string;
  /** Alternativa estática, sempre do próprio servidor (ex.: /brand/codigo-vencedor.svg). */
  logoUrl?: string;
  /** Cor de destaque (hex #rrggbb). Ausente = accent do tema. */
  cor?: string;
  criadoEm: string;
}

/**
 * A forma que o cliente pode ver.
 *
 * É igual a `Empresa` porque **não há nada secreto numa empresa** — e isso é
 * uma decisão, não um acaso: no dia em que alguém quiser guardar uma credencial
 * aqui, este alias deixa de poder ser identidade e a fronteira aparece no
 * `tsc`. Existe pela simetria com `MarcaPublica`, que existe porque `Marca`
 * carrega o token.
 */
export type EmpresaPublica = Empresa;

/**
 * Teto de empresas.
 *
 * Não é limite de licença: `empresas.json` é reescrito INTEIRO a cada gravação
 * (sem banco, sem lock entre processos) e a resposta do `GET /api/empresas`
 * carrega o logo de todas elas. 20 × 150 KB já é ~3 MB por leitura de tela.
 */
export const MAX_EMPRESAS = 20;

/** Teto do logo, em bytes de IMAGEM (antes do base64). D-13. */
export const LOGO_MAX_BYTES = 150 * 1024;

/**
 * Teto do TEXTO do data URI.
 *
 * base64 cresce 4/3 sobre os bytes da imagem, e ainda vem o prefixo
 * `data:image/svg+xml;base64,`. O teto que vale para o operador é o de imagem
 * (150 KB, e é dele que a mensagem fala); este aqui é o que o código consegue
 * medir sem decodificar 200 KB de string a cada validação.
 *
 * Por que existe teto: `empresas.json` é gravado inteiro, com cópia para `.bak`
 * e `fsync`, a cada edição de empresa — e a lista inteira viaja para a tela no
 * `GET /api/empresas`. Sem teto, um PNG de 4 MB arrastado para o diálogo vira
 * 4 MB de reescrita em disco por clique e 4 MB por abertura do console.
 */
export const LOGO_MAX_CARACTERES = Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 64;

const RE_LOGO_DATA_URI = /^data:image\/(?:png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=\s]+$/;
const RE_COR = /^#[0-9a-fA-F]{6}$/;

/** Id novo. Mesmo molde de `marca_<ts36>` do `useBrandStore`. */
export function novoIdEmpresa(): string {
  return `emp_${Date.now().toString(36)}`;
}

/**
 * O que existe hoje, sem arquivo nenhum. **NUNCA gravado pela leitura.**
 *
 * Mesmo princípio de `resolverIntegracoes`: leitura não grava. Um redeploy com
 * o volume atual sobe funcionando e `config/empresas.json` só nasce no primeiro
 * clique que cria ou edita uma empresa.
 *
 * `BRAND_NAME` é lido do `.env` pelo mesmo motivo que `marcaDoEnv()` lê: a
 * instalação que já roda chama a empresa padrão pelo nome que está lá.
 */
export function empresaDefault(): Empresa {
  return {
    id: EMPRESA_DEFAULT_ID,
    nome: process.env.BRAND_NAME?.trim() || 'Código Vencedor',
    slug: 'codigo-vencedor',
    plataforma: 'xWinner',
    criadoEm: '2026-09-01T00:00:00.000Z',
  };
}

/**
 * `publicarEmpresa` existe para ocupar o mesmo lugar que `publicarMarca`: a
 * borda. Hoje é cópia rasa (ver `EmpresaPublica`); a chamada fica escrita nas
 * rotas para que, se um campo interno aparecer um dia, haja UM ponto para
 * removê-lo, em vez de uma caçada por `NextResponse.json`.
 */
export function publicarEmpresa(e: Empresa): EmpresaPublica {
  return { ...e };
}

/* ------------------------------------------------------------------ */
/* Erros que o operador PODE ler                                       */
/* ------------------------------------------------------------------ */

/**
 * Erro de validação cuja mensagem é segura de mostrar na tela.
 *
 * `erroDeRota` (B-10) não repassa a mensagem técnica de um `Error` qualquer, e
 * está certíssimo: ela pode carregar caminho, corpo de requisição ou trecho de
 * credencial (B10-d). Só que "já existe uma empresa com esse apelido" precisa
 * chegar ao operador, senão ele tenta o mesmo apelido para sempre.
 *
 * A classe é o contrato: o que sai daqui foi escrito para ser lido por humano e
 * **nunca contém segredo** — o que é fácil de garantir porque `empresas.json`
 * não tem nenhum (D-19). A rota converte em 400 com a frase inteira; qualquer
 * outro erro continua caindo na frase genérica de `erroDeRota`.
 */
export class ErroDeEmpresa extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeEmpresa';
  }
}

/** Erro legível do logo em data URI, ou null se serve. */
export function erroDoLogoDataUrl(v: string): string | null {
  if (!v) return null;
  if (!RE_LOGO_DATA_URI.test(v)) {
    return 'Envie uma imagem PNG, JPEG, SVG ou WebP.';
  }
  if (v.length > LOGO_MAX_CARACTERES) {
    return `A imagem precisa ter no máximo ${Math.round(LOGO_MAX_BYTES / 1024)} KB.`;
  }
  return null;
}

/**
 * Erro legível de `logoUrl`, ou null se serve.
 *
 * Só caminho do próprio servidor (`/brand/x.svg`). URL externa num `<img>` do
 * cabeçalho contaria ao dono do outro domínio cada abertura do console, e um
 * esquema exótico (`javascript:`, `data:text/html`) num atributo `src` é
 * superfície que não precisa existir num campo cujo propósito é apontar um
 * arquivo de `public/`.
 */
export function erroDoLogoUrl(v: string): string | null {
  if (!v) return null;
  if (!v.startsWith('/') || v.startsWith('//')) {
    return 'Use um caminho do próprio servidor, começando com "/" (ex.: /brand/logo.svg).';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Leitura do arquivo                                                  */
/* ------------------------------------------------------------------ */

interface ArquivoEmpresas {
  empresas: Empresa[];
}

/**
 * O validador exige APENAS que `empresas` seja um array.
 *
 * Divergência consciente do rascunho do plano, que também exigia um item com id
 * 'default' dentro do arquivo: a empresa padrão é derivada do CÓDIGO
 * (`empresaDefault()`), não do disco. Recusar um arquivo só porque a linha dela
 * não está lá levaria o console inteiro a 503 por um campo que sabemos
 * reconstruir — e `normalizar()` reconstrói, logo abaixo.
 */
function arquivoDeEmpresasValido(d: ArquivoEmpresas): boolean {
  return !!d && typeof d === 'object' && Array.isArray(d.empresas);
}

/**
 * Lê o registro, tentando o `.bak` antes de desistir.
 *
 * Desde a FASE D.1 quem tenta arquivo e `.bak` é o `lerComBackup` de
 * `config-store.ts` — antes havia aqui uma cópia privada dele, e duas cópias da
 * regra "ausente ≠ ilegível" é a forma mais fácil de uma delas, um dia, voltar
 * a tratar arquivo quebrado como arquivo novo. Que é o defeito B1 inteiro.
 *
 * As quatro situações, e por que cada uma responde o que responde:
 *
 * | situação                            | resposta                              |
 * |-------------------------------------|---------------------------------------|
 * | arquivo íntegro                     | a lista gravada                       |
 * | arquivo quebrado, `.bak` bom        | a lista do `.bak` (nada é regravado)  |
 * | arquivo E `.bak` inexistentes       | `[empresaDefault()]` — D-2/D-3        |
 * | arquivo quebrado e `.bak` quebrado  | LANÇA → 503 no modo degradado         |
 *
 * 🔴 A última linha é uma divergência consciente do rascunho do plano, que
 * dizia "ausente/inválido → `[empresaDefault()]` sem gravar". Devolver só a
 * padrão para um arquivo ILEGÍVEL seria destrutivo: o próximo `salvarEmpresa()`
 * gravaria "padrão + a nova" por cima de um arquivo que tinha outras cinco
 * empresas, e elas sumiriam sem aviso. É a mesma família do defeito B1 (leitura
 * que falha virando gravação silenciosa), e essa lição já custou caro neste
 * repositório. Ausente continua sendo o caso feliz; ilegível vira 503.
 *
 * `restaurado` devolve a lista do `.bak` sem regravar nada: quem regrava é o
 * próximo `salvarEmpresa()`, pelo caminho atômico de sempre.
 */
async function lerRegistro(): Promise<Empresa[]> {
  const leitura = await lerComBackup<ArquivoEmpresas>(ARQ_EMPRESAS, arquivoDeEmpresasValido);

  if (leitura.estado === 'ok' || leitura.estado === 'restaurado') {
    return normalizar(leitura.dados.empresas);
  }
  if (leitura.estado === 'ausente') return [empresaDefault()];

  throw new ErroConfiguracaoIndisponivel(ARQ_EMPRESAS, leitura.motivo);
}

/**
 * Deixa a lista utilizável, venha ela do disco ou do `.bak`:
 *
 *  1. joga fora entrada que não é objeto ou tem id fora do formato (a cerca de
 *     travessia de caminho de `RE_ID_EMPRESA`);
 *  2. remove id repetido, mantendo a PRIMEIRA aparição (o arquivo é a fonte);
 *  3. garante a empresa padrão SEMPRE presente e SEMPRE em primeiro lugar,
 *     mesclada sobre `empresaDefault()` — o que o dono editou (nome, logo, cor)
 *     vence, e o que faltar cai no valor derivado do código.
 */
function normalizar(bruta: unknown[]): Empresa[] {
  const vistos = new Set<string>();
  const lista: Empresa[] = [];

  for (const item of bruta) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Partial<Empresa>;
    if (!idDeEmpresaValido(e.id) || vistos.has(e.id)) continue;
    vistos.add(e.id);
    lista.push(saneada(e, e.id));
  }

  const salvaDefault = lista.find((e) => e.id === EMPRESA_DEFAULT_ID);
  const padrao: Empresa = salvaDefault
    ? { ...empresaDefault(), ...salvaDefault, id: EMPRESA_DEFAULT_ID }
    : empresaDefault();

  return [padrao, ...lista.filter((e) => e.id !== EMPRESA_DEFAULT_ID)];
}

/**
 * Uma `Empresa` com os campos no tipo certo, campo a campo.
 *
 * 🔴 Nunca por spread do que veio de fora. Um `{...entrada}` cego gravaria em
 * `empresas.json` qualquer chave que uma rota futura deixasse passar — e este é
 * o arquivo que, por D-19, não pode receber token nem segredo NUNCA. Campo a
 * campo, uma chave desconhecida simplesmente não tem por onde entrar.
 */
function saneada(e: Partial<Empresa>, id: string): Empresa {
  const nome = String(e.nome ?? '').trim();
  const slug = normalizarRotulo(String(e.slug ?? '') || nome);
  const plataforma = String(e.plataforma ?? '').trim();
  const logoDataUrl = String(e.logoDataUrl ?? '').trim();
  const logoUrl = String(e.logoUrl ?? '').trim();
  const cor = String(e.cor ?? '').trim();
  const criadoEm = String(e.criadoEm ?? '').trim();

  return {
    id,
    nome: nome || id,
    slug: slug || id.toLowerCase(),
    ...(plataforma ? { plataforma } : {}),
    // Leitura tolerante: um logo gravado fora do formato some da tela em vez de
    // quebrar o `<img>` — mas a GRAVAÇÃO recusa antes, em `salvarEmpresa`.
    ...(logoDataUrl && !erroDoLogoDataUrl(logoDataUrl) ? { logoDataUrl } : {}),
    ...(logoUrl && !erroDoLogoUrl(logoUrl) ? { logoUrl } : {}),
    ...(RE_COR.test(cor) ? { cor: cor.toLowerCase() } : {}),
    criadoEm: criadoEm || new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* API do módulo                                                       */
/* ------------------------------------------------------------------ */

/**
 * Todas as empresas, com a padrão sempre em primeiro lugar.
 *
 * Sem `config/empresas.json` em disco devolve `[empresaDefault()]` e **não cria
 * o arquivo** (D-2/D-3). Lança `ErroConfiguracaoIndisponivel` quando o arquivo
 * existe e nem ele nem o `.bak` puderam ser lidos — a rota devolve 503.
 */
export async function listarEmpresas(): Promise<Empresa[]> {
  return lerRegistro();
}

/**
 * Uma empresa pelo id, ou `undefined`.
 *
 * Diferente de `acharMarca`, que cai na primeira marca quando o id não existe:
 * aqui quem decide o que fazer com o desconhecido é `empresa-ativa.ts`, e a
 * decisão dele (D-4) é cair na PADRÃO, não na primeira da lista. Devolver
 * `undefined` mantém as duas coisas distintas.
 */
export async function acharEmpresa(id: string): Promise<Empresa | undefined> {
  const todas = await lerRegistro();
  return todas.find((e) => e.id === id);
}

/**
 * Uma empresa pelo slug do endereço (`/e/<slug>`), ou `undefined` (V2 do v7).
 *
 * Comparação EXATA: `/e/Gtech` não acha `gtech`. O slug gravado já passou por
 * `erroDoRotulo` (minúsculas, dígitos e hífen), então um endereço com
 * maiúscula é outro endereço — e responde 404, não a empresa "parecida".
 * Mesma regra de `acharEmpresa`: quem decide o que fazer com o desconhecido é
 * quem chama (o layout de `/e/[slug]` responde `notFound()`).
 */
export async function acharEmpresaPorSlug(slug: string): Promise<Empresa | undefined> {
  const procurado = typeof slug === 'string' ? slug : '';
  if (!procurado) return undefined;
  const todas = await lerRegistro();
  return todas.find((e) => e.slug === procurado);
}

/**
 * Cria ou atualiza uma empresa.
 *
 * B2-a/B2-b: a LEITURA acontece DENTRO da fila. Ler fora e gravar dentro
 * deixaria a janela aberta para dois saves simultâneos, e o segundo apagaria o
 * primeiro. `naFila` é por arquivo, então isto não disputa fila com
 * `marcas.json` nem com `integracoes.json` — cada arquivo tem a sua.
 *
 * Mescla como `salvarMarca`: campo ausente em `entrada` preserva o que estava
 * gravado; campo presente sobrescreve; string vazia limpa o campo opcional — é
 * o que o diálogo manda quando o operador remove o logo.
 *
 * 🔴 O que NÃO existe aqui: qualquer campo de credencial. Ver D-19 no topo.
 */
export async function salvarEmpresa(entrada: Partial<Empresa> & { id: string }): Promise<Empresa> {
  if (!idDeEmpresaValido(entrada.id)) {
    throw new ErroDeEmpresa('Id de empresa inválido.');
  }

  return naFila(ARQ_EMPRESAS, async () => {
    const atuais = await lerRegistro();
    const i = atuais.findIndex((e) => e.id === entrada.id);
    const criando = i < 0;

    // O teto vale só para empresa NOVA: editar a 21ª (se um dia existir uma,
    // gravada por uma versão sem teto) não pode ficar impossível.
    if (criando && atuais.length >= MAX_EMPRESAS) {
      throw new ErroDeEmpresa(
        `Este console guarda no máximo ${MAX_EMPRESAS} empresas. Apague uma antes de criar outra.`
      );
    }

    const base: Empresa =
      i >= 0
        ? atuais[i]
        : {
            id: entrada.id,
            nome: '',
            slug: '',
            criadoEm: new Date().toISOString(),
          };

    const nome = entrada.nome !== undefined ? String(entrada.nome).trim() : base.nome;
    if (nome.length < 2) throw new ErroDeEmpresa('O nome da empresa precisa ter ao menos 2 caracteres.');
    if (nome.length > 60) throw new ErroDeEmpresa('O nome da empresa pode ter no máximo 60 caracteres.');

    // Slug vazio vira o slug do nome: o operador que não abriu o campo ainda
    // assim recebe um apelido de URL previsível (D-15).
    const slugBruto = entrada.slug !== undefined ? String(entrada.slug) : base.slug;
    const slug = normalizarRotulo(slugBruto || nome);
    const erroSlug = erroDoRotulo(slug);
    if (erroSlug) throw new ErroDeEmpresa(`Apelido da URL inválido. ${erroSlug}`);
    if (atuais.some((e) => e.id !== entrada.id && e.slug === slug)) {
      throw new ErroDeEmpresa(`Já existe uma empresa com o apelido "${slug}". Escolha outro.`);
    }

    const plataforma =
      entrada.plataforma !== undefined ? String(entrada.plataforma ?? '').trim() : base.plataforma;
    if (plataforma && plataforma.length > 40) {
      throw new ErroDeEmpresa('O nome da plataforma pode ter no máximo 40 caracteres.');
    }

    const logoDataUrl =
      entrada.logoDataUrl !== undefined ? String(entrada.logoDataUrl ?? '').trim() : base.logoDataUrl;
    const erroLogo = logoDataUrl ? erroDoLogoDataUrl(logoDataUrl) : null;
    if (erroLogo) throw new ErroDeEmpresa(erroLogo);

    const logoUrl = entrada.logoUrl !== undefined ? String(entrada.logoUrl ?? '').trim() : base.logoUrl;
    const erroUrl = logoUrl ? erroDoLogoUrl(logoUrl) : null;
    if (erroUrl) throw new ErroDeEmpresa(erroUrl);

    const cor = entrada.cor !== undefined ? String(entrada.cor ?? '').trim() : base.cor;
    if (cor && !RE_COR.test(cor)) throw new ErroDeEmpresa('A cor precisa estar no formato #rrggbb.');

    const atualizada: Empresa = {
      id: entrada.id,
      nome,
      slug,
      ...(plataforma ? { plataforma } : {}),
      ...(logoDataUrl ? { logoDataUrl } : {}),
      ...(logoUrl ? { logoUrl } : {}),
      ...(cor ? { cor: cor.toLowerCase() } : {}),
      // `criadoEm` nunca é reescrito por edição: é a data da criação, não do save.
      criadoEm: base.criadoEm,
    };

    const lista = criando ? [...atuais, atualizada] : atuais.map((e, n) => (n === i ? atualizada : e));

    // `normalizar` garante a empresa padrão na lista gravada (D.1.1): mesmo que
    // o arquivo tenha nascido de uma instalação sem ela, quem ler depois — este
    // módulo ou um `jq` no volume — enxerga o registro completo.
    await gravarRegistro(normalizar(lista));
    return atualizada;
  });
}

/**
 * Apaga uma empresa (D-17), com as três travas.
 *
 * 1. A padrão nunca é apagada: ela é a instalação que existe hoje, dona do
 *    `integracoes.json` de E-4.
 * 2. Empresa com Pixel em disparo automático LIGADO é recusada. Apagar por
 *    baixo de um automático ligado é a forma mais fácil de este plano encostar
 *    na regra 1 do CLAUDE.md; desligar o Switch é um clique consciente, e ele
 *    tem que ser dado antes, na tela de Pixels.
 * 3. Os Pixels da empresa saem de `marcas.json` — por `removerMarca()`, o
 *    caminho que já existe, na fila daquele arquivo.
 *
 * ORDEM IMPORTA: os Pixels saem ANTES da empresa. Se a segunda parte falhar, a
 * empresa continua na lista e o operador consegue tentar de novo; o contrário
 * deixaria Pixels órfãos, invisíveis e sem tela para removê-los.
 *
 * O que este passo NÃO faz: mexer em `config/integracoes.<id>.json` (arquivo
 * que só nasce na FASE E) nem nos itens já recebidos da caixa de entrada, que
 * ficam com `empresaId` órfão e invisíveis, como D-17 manda.
 */
export async function removerEmpresa(id: string): Promise<void> {
  if (id === EMPRESA_DEFAULT_ID) {
    throw new ErroDeEmpresa('A empresa padrão não pode ser removida.');
  }
  if (!idDeEmpresaValido(id)) throw new ErroDeEmpresa('Id de empresa inválido.');

  const existe = await acharEmpresa(id);
  if (!existe) throw new ErroDeEmpresa('Empresa não encontrada.');

  const marcas = await listarMarcas();
  const dela = marcas.filter((m) => empresaDaMarca(m) === id);

  // `=== true` é o ponto inteiro — ver o JSDoc de `Marca.autoDisparo`.
  const ligados = dela.filter((m) => m.autoDisparo === true);
  if (ligados.length) {
    throw new ErroDeEmpresa(
      `Esta empresa tem ${ligados.length} Pixel(s) com disparo automático ligado. ` +
        'Desligue o automático em Pixels antes de apagar a empresa.'
    );
  }

  for (const m of dela) {
    await removerMarca(m.id);
  }

  await naFila(ARQ_EMPRESAS, async () => {
    const atuais = await lerRegistro();
    await gravarRegistro(normalizar(atuais.filter((e) => e.id !== id)));
  });

  /**
   * O webhook e a tag da empresa saem POR ÚLTIMO, e por renomeação.
   *
   * Por último porque enquanto a empresa existe no registro o arquivo dela
   * ainda faz sentido; renomeado (`.removido-<ts>`) porque ali dentro está o
   * segredo de entrada de um cliente, e um clique errado no botão de apagar não
   * deve ser irreversível. A partir daqui a URL antiga responde 401, que é
   * exatamente o que se espera de um endpoint aposentado.
   *
   * Falha não é propagada: a empresa JÁ saiu do registro, e transformar isso em
   * erro faria a tela dizer que nada foi apagado quando tudo foi.
   */
  await aposentarIntegracoesDaEmpresa(id);
}

/* ------------------------------------------------------------------ */
/* Da credencial para a empresa (FASE E)                               */
/* ------------------------------------------------------------------ */

/**
 * 🔴 A empresa de um evento que CHEGA sai da credencial, nunca da empresa ativa.
 *
 * Esta é a regra que separa o console de um bug que custa venda. A empresa
 * ativa é o que o operador está olhando no navegador; o webhook chega de um
 * servidor da plataforma de vendas, a qualquer hora, sem navegador nenhum do
 * outro lado. Resolver pelo que está aberto na aba mandaria a compra de um
 * cliente para o Pixel de outro.
 *
 * **Percorre a lista inteira, sempre.** Não há `break` no primeiro acerto — o
 * `for` continua até o fim mesmo depois de achar. O motivo é `segredoConfere`,
 * que compara em tempo constante justamente para não vazar o segredo pelo
 * relógio: parar cedo devolveria esse vazamento pela porta dos fundos, com o
 * tempo de resposta contando quantas empresas foram testadas antes do acerto.
 * O custo é uma leitura de arquivo por empresa, com teto de 20 empresas.
 *
 * Uma empresa cujo arquivo está ilegível é PULADA, não derruba a busca: o
 * cliente A não pode perder a venda porque o arquivo do cliente B corrompeu.
 */
export async function acharEmpresaPorSegredo(
  segredo: string
): Promise<{ empresaId: string; cfg: Integracoes } | undefined> {
  let achado: { empresaId: string; cfg: Integracoes } | undefined;

  for (const e of await listarEmpresas()) {
    let cfg: Integracoes;
    try {
      cfg = await lerIntegracoes(e.id);
    } catch {
      continue;
    }
    if (segredoConfere(segredo, cfg.entrada?.segredo ?? '')) {
      achado ??= { empresaId: e.id, cfg };
    }
  }

  return achado;
}

/**
 * Quem é dono desta chave de tag.
 *
 * A chave da tag é PÚBLICA (ela está no HTML do site do cliente), então aqui
 * não há segredo a proteger por tempo — mas a varredura é a mesma de
 * `acharEmpresaPorSegredo` de propósito: uma só forma de "credencial → empresa"
 * é uma só forma de errar, e essa a gente conhece.
 */
export async function acharEmpresaPorChaveTag(
  chave: string
): Promise<{ empresaId: string; cfg: Integracoes } | undefined> {
  const procurada = String(chave ?? '').trim();
  if (!procurada) return undefined;

  let achado: { empresaId: string; cfg: Integracoes } | undefined;

  for (const e of await listarEmpresas()) {
    let cfg: Integracoes;
    try {
      cfg = await lerIntegracoes(e.id);
    } catch {
      continue;
    }
    if (cfg.tag?.chave?.trim() === procurada) {
      achado ??= { empresaId: e.id, cfg };
    }
  }

  return achado;
}

/**
 * ÚNICA porta de escrita de `config/empresas.json`.
 *
 * `gravarAtomico` faz `.bak` do estado ANTERIOR, escreve `.tmp` com `fsync` e
 * troca por `rename`. Quem estiver lendo durante a gravação enxerga o arquivo
 * velho inteiro, nunca metade do novo.
 */
async function gravarRegistro(empresas: Empresa[]): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await gravarAtomico(ARQ_EMPRESAS, JSON.stringify({ empresas }, null, 2));
}

/** Só para teste e diagnóstico: onde o registro mora. Nunca vai para o cliente. */
export function caminhoDoRegistro(): string {
  return ARQ_EMPRESAS;
}
