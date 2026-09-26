/**
 * O checklist de configuração de uma empresa (V5 do plano v7; os 6 passos da
 * T12 do v6): Empresa criada · Pixel cadastrado · Domínio apontado · Tag do
 * site instalada · Webhook de vendas conectado · Primeiro evento aceito pela
 * Meta. Cada passo diz o estado, uma frase com a prova, o verbo que resolve e
 * a aba onde se resolve.
 *
 * 🔴 PURO. Sem I/O, sem React, sem store: quem lê o disco é a página do
 * servidor (`e/[slug]/page.tsx`, `empresas/page.tsx`), que entrega aqui só o
 * que já é seguro — o booleano `temToken` (nunca o token), o domínio e a hora
 * do último hit, o modo das regras, e de cada entrada só a origem, a hora, o
 * status e o que a Meta respondeu. Nada de e-mail, telefone, hash ou payload.
 *
 * Regras que valem para todo passo:
 *  - "feito" só com prova medida. Sem prova, o passo fica pendente e diz o que
 *    falta; nunca um verde que ninguém conferiu.
 *  - O passo Domínio NÃO tem prova nesta rodada: não existe verificação do
 *    apontamento (`DominioTag` não tem estado, `tag-dominios.ts`). Com
 *    subdomínio cadastrado ele fica `andamento`; sem, `pendente`. Logo o
 *    máximo hoje é "5 de 6".
 *  - Teste da equipe e da plataforma nunca contam como "primeiro evento aceito".
 */

import type { ItemResumivel, ResumoInbox } from '@/lib/inbox-resumo';
import { aceitoDeVerdade, dataHoraDeBrasilia, ehTesteInterno, recusadoDeVerdade } from '@/lib/visao-geral-calculos';

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

/** Um Pixel, do jeito que o cliente pode ver (`MarcaPublica`, sem o token). */
export interface PixelDoChecklist {
  id: string;
  pixelId: string;
  temToken: boolean;
  /** Já normalizado na borda (`publicarMarca`: `=== true`). */
  autoDisparo: boolean;
}

/** Um domínio da tag (`DominioTag`), só com o que o checklist lê. */
export interface DominioDoChecklist {
  host: string;
  subdominio?: string;
  /** ISO do último hit deste Origin. Vazio = a tag nunca chamou. */
  ultimoHit?: string;
}

/** Uma regra de roteamento, só com o que decide o envio automático. */
export interface RegraDoChecklist {
  modo: 'auto' | 'fila' | 'ignorar';
  ativo: boolean;
  /** Vazio ou ausente = Pixel `default` (a mesma leitura do servidor). */
  marcas?: readonly string[];
}

/**
 * Uma entrada da caixa, só com o que o checklist lê. `origem: 'tag'` é a tag
 * do site (`tag-handler.ts`); qualquer outra origem é o webhook de vendas
 * (`webhook-handler.ts`), os dois únicos lugares que registram entrada.
 */
export interface EntradaDoChecklist
  extends Pick<ItemResumivel, 'recebidoEm' | 'status' | 'testeInterno' | 'testePlataforma' | 'resultados'> {
  origem: string;
}

export interface DadosDoChecklist {
  empresa: { slug: string };
  /** `null` quando os Pixels da empresa não puderam ser lidos (nunca vira "nenhum Pixel"). */
  pixels: readonly PixelDoChecklist[] | null;
  /** `null` quando a configuração da empresa não pôde ser lida. */
  integracoes: { dominios: readonly DominioDoChecklist[]; regras: readonly RegraDoChecklist[] } | null;
  /** As entradas recentes da empresa (a memória do console). */
  entradas?: readonly EntradaDoChecklist[];
  /** O resumo do período, quando já veio: soma prova ao passo 6. */
  resumo?: Pick<ResumoInbox, 'qualidade'> | null;
}

/* ------------------------------------------------------------------ */
/* Saída                                                               */
/* ------------------------------------------------------------------ */

export type EstadoDoPasso = 'feito' | 'pendente' | 'andamento' | 'erro';

export type ChaveDoPasso = 'empresa' | 'pixel' | 'dominio' | 'tag' | 'webhook' | 'aceito';

export interface PassoDoChecklist {
  chave: ChaveDoPasso;
  /** "Pixel cadastrado", "Webhook de vendas conectado"... */
  titulo: string;
  estado: EstadoDoPasso;
  /** A prova, ou o que falta, em uma frase. */
  frase: string;
  /** O verbo que resolve ("Cadastrar um Pixel"). */
  verbo: string;
  /** A aba onde se resolve (`/e/<slug>/pixels`). */
  href: string;
  /** Ação no lugar de navegar: o cabeçalho copia a tag em vez de abrir a aba. */
  acao?: 'copiar-tag';
  /** Com `estado: 'erro'`, a causa em palavra (vira o selo da empresa). */
  causa?: string;
}

/** Os sinais medidos que a faixa Site → Pixel → CAPI → Meta mostra. */
export interface SinaisDaEmpresa {
  pixelsCadastrados: number;
  pixelsComToken: number;
  /** ISO do último hit da tag, ou `null` (nunca chamou). */
  ultimoHitDaTag: string | null;
  /** ISO da última entrega do webhook entre as entradas lidas, ou `null`. */
  ultimaEntregaDoWebhook: string | null;
  /** ISO do evento real mais recente aceito pela Meta, ou `null`. */
  ultimoAceito: string | null;
  /** Eventos reais recusados pela Meta, sem nenhum aceite real. */
  recusados: number;
}

export interface ChecklistDaEmpresa {
  passos: PassoDoChecklist[];
  feitos: number;
  total: number;
  /** "1 de 6". */
  contagem: string;
  /** O primeiro passo por fazer (o Domínio fica por último: não tem prova hoje). */
  proximo: PassoDoChecklist | null;
  sinais: SinaisDaEmpresa;
}

/* ------------------------------------------------------------------ */
/* Leituras                                                            */
/* ------------------------------------------------------------------ */

function iso(v: unknown): string | null {
  return typeof v === 'string' && v !== '' && Number.isFinite(Date.parse(v)) ? v : null;
}

function maisRecente(lista: ReadonlyArray<string | null | undefined>): string | null {
  let melhor: string | null = null;
  for (const v of lista) {
    const valido = iso(v);
    if (valido && (melhor === null || Date.parse(valido) > Date.parse(melhor))) melhor = valido;
  }
  return melhor;
}

/**
 * A regra manda para este Pixel? Regra sem destino vale para o `default`.
 *
 * 🟠 ESPELHO de `regraApontaPara` (`components/pixels/estado-pixel.ts`), que é
 * a leitura de `auto-dispatch.ts` e `webhook-handler.ts`. Não importado porque
 * um arquivo de `lib/` não depende de `components/`.
 */
function regraApontaPara(regra: RegraDoChecklist, pixelId: string): boolean {
  const alvos = regra.marcas && regra.marcas.length > 0 ? regra.marcas : ['default'];
  return alvos.includes(pixelId);
}

function regrasAutoDoPixel(regras: readonly RegraDoChecklist[], pixelId: string): number {
  return regras.filter((r) => r.ativo === true && r.modo === 'auto' && regraApontaPara(r, pixelId)).length;
}

const cadastrado = (p: PixelDoChecklist) => typeof p.pixelId === 'string' && p.pixelId.trim() !== '';
const comToken = (p: PixelDoChecklist) => cadastrado(p) && p.temToken === true;

/* ------------------------------------------------------------------ */
/* Envio automático (as duas travas)                                   */
/* ------------------------------------------------------------------ */

export interface EnvioAutomatico {
  /** Só com as duas travas: a chave do Pixel ligada E uma regra automática para ele. */
  ligado: boolean;
  /** O que falta, em palavra, quando está desligado. */
  falta: string[];
  /** "Envio automático: ligado" / "Envio automático: desligado (falta: …)". */
  frase: string;
}

/**
 * O envio automático está ligado de verdade? As duas travas do servidor
 * (`modo-por-marca.ts`): um Pixel com token e a chave `autoDisparo === true`,
 * e pelo menos uma regra ativa em `auto` que manda para ESSE Pixel.
 */
export function envioAutomaticoDaEmpresa(
  pixels: readonly PixelDoChecklist[],
  regras: readonly RegraDoChecklist[] | null
): EnvioAutomatico {
  const validos = pixels.filter(comToken);
  const chaveLigada = validos.filter((p) => p.autoDisparo === true);
  const disparando = regras ? chaveLigada.filter((p) => regrasAutoDoPixel(regras, p.id) > 0) : [];
  if (disparando.length > 0) {
    return { ligado: true, falta: [], frase: 'Envio automático: ligado' };
  }
  const falta: string[] = [];
  if (validos.length === 0) falta.push('um Pixel com token');
  else if (chaveLigada.length === 0) falta.push('a chave do Pixel ligada');
  if (regras === null) {
    falta.push('ler as regras desta empresa');
  } else {
    // Com a chave ligada em algum Pixel, é a regra DELE que falta; senão,
    // basta uma regra automática para qualquer Pixel com token.
    const alvo = chaveLigada.length > 0 ? chaveLigada : validos;
    if (!alvo.some((p) => regrasAutoDoPixel(regras, p.id) > 0)) falta.push('uma regra automática para o Pixel');
  }
  return { ligado: false, falta, frase: `Envio automático: desligado (falta: ${falta.join(' e ')})` };
}

/* ------------------------------------------------------------------ */
/* Os 6 passos                                                         */
/* ------------------------------------------------------------------ */

export const TOTAL_DE_PASSOS = 6;

/** A chave do Pixel em palavra, como a aba Pixels (revisão B3 do v6). */
function chaveEmPalavra(pixels: readonly PixelDoChecklist[], regras: readonly RegraDoChecklist[] | null): string {
  const ligados = pixels.filter((p) => p.autoDisparo === true);
  if (ligados.length === 0) return 'Desligado: não sai sozinho';
  const comRegra = regras ? ligados.filter((p) => regrasAutoDoPixel(regras, p.id) > 0) : [];
  if (comRegra.length === 0) return 'Ligado, sem regra automática: não sai sozinho';
  return pixels.length === 1 ? 'Ligado' : `Ligado em ${comRegra.length} de ${pixels.length}`;
}

export function montarChecklist(dados: DadosDoChecklist): ChecklistDaEmpresa {
  const base = `/e/${encodeURIComponent(dados.empresa.slug)}`;
  const integracoes = dados.integracoes;
  const regras = integracoes?.regras ?? null;
  const dominios = integracoes?.dominios ?? [];
  const entradas = dados.entradas ?? [];

  const pixels = dados.pixels ?? [];
  const pixelsCadastrados = pixels.filter(cadastrado);
  const pixelsComToken = pixels.filter(comToken);

  const reais = entradas.filter((e) => !ehTesteInterno(e));
  const ultimoHitDaTag = maisRecente([
    ...dominios.map((d) => d.ultimoHit),
    ...entradas.filter((e) => e.origem === 'tag').map((e) => e.recebidoEm),
  ]);
  const ultimaEntregaDoWebhook = maisRecente(
    entradas.filter((e) => typeof e.origem === 'string' && e.origem !== 'tag').map((e) => e.recebidoEm)
  );
  const aceitosReais = reais.filter((e) => aceitoDeVerdade(e));
  const ultimoAceito = maisRecente(aceitosReais.map((e) => e.recebidoEm));
  const aceitosNoResumo = dados.resumo?.qualidade.aceitos ?? 0;
  const recusadosNaMemoria = reais.filter((e) => recusadoDeVerdade(e)).length;
  const recusados = Math.max(recusadosNaMemoria, dados.resumo?.qualidade.recusados ?? 0);

  const passos: PassoDoChecklist[] = [];

  // 1 · Empresa criada: existe o endereço, logo existe a empresa.
  passos.push({
    chave: 'empresa',
    titulo: 'Empresa criada',
    estado: 'feito',
    frase: `Endereço ${base}.`,
    verbo: 'Ver as configurações',
    href: `${base}/configuracoes`,
  });

  // 2 · Pixel cadastrado: pelo menos um com ID e token (nunca "Pixel ligado":
  // "Ligado"/"Desligado" é a palavra da chave, uma das duas travas). Leitura
  // que falhou é erro, e não "nenhum Pixel": o cadastro pode estar lá.
  if (dados.pixels === null) {
    passos.push({
      chave: 'pixel',
      titulo: 'Pixel cadastrado',
      estado: 'erro',
      frase: 'Os Pixels desta empresa não puderam ser lidos.',
      verbo: 'Abrir os Pixels',
      href: `${base}/pixels`,
      causa: 'Pixels ilegíveis',
    });
  } else if (pixelsComToken.length > 0) {
    const quem =
      pixelsComToken.length === 1
        ? `Pixel ${pixelsComToken[0].pixelId.trim()} com token`
        : `${pixelsComToken.length} Pixels com token`;
    passos.push({
      chave: 'pixel',
      titulo: 'Pixel cadastrado',
      estado: 'feito',
      frase: `${quem} · ${chaveEmPalavra(pixelsComToken, regras)}`,
      verbo: 'Ver os Pixels',
      href: `${base}/pixels`,
    });
  } else if (pixelsCadastrados.length > 0) {
    passos.push({
      chave: 'pixel',
      titulo: 'Pixel cadastrado',
      estado: 'pendente',
      frase: `Pixel ${pixelsCadastrados[0].pixelId.trim()} sem token de acesso: nada pode ser enviado.`,
      verbo: 'Cadastrar o token do Pixel',
      href: `${base}/pixels`,
    });
  } else {
    passos.push({
      chave: 'pixel',
      titulo: 'Pixel cadastrado',
      estado: 'pendente',
      frase: 'Nenhum Pixel cadastrado nesta empresa.',
      verbo: 'Cadastrar um Pixel',
      href: `${base}/pixels`,
    });
  }

  // 3 · Domínio apontado: sem prova nesta rodada (ver o topo do arquivo).
  if (integracoes === null) {
    passos.push({
      chave: 'dominio',
      titulo: 'Domínio apontado',
      estado: 'erro',
      frase: 'A configuração desta empresa não pôde ser lida.',
      verbo: 'Abrir o domínio',
      href: `${base}/dominio`,
      causa: 'configuração ilegível',
    });
  } else {
    const proprios = dominios.filter(
      (d) => String(d.subdominio ?? '').trim() !== '' && String(d.host ?? '').trim() !== ''
    );
    passos.push(
      proprios.length > 0
        ? {
            chave: 'dominio',
            titulo: 'Domínio apontado',
            estado: 'andamento',
            frase: `${String(proprios[0].subdominio).trim()}.${String(proprios[0].host).trim()}: apontamento pedido ao cliente; certificado em preparação.`,
            verbo: 'Conferir o domínio',
            href: `${base}/dominio`,
          }
        : {
            chave: 'dominio',
            titulo: 'Domínio apontado',
            estado: 'pendente',
            frase: 'Nenhum domínio próprio: a tag chama o endereço do console.',
            verbo: 'Apontar o domínio',
            href: `${base}/dominio`,
          }
    );
  }

  // 4 · Tag do site instalada: chegou pelo menos um hit.
  // Todo link deste passo vai para Fontes (R1 da V8): a tag e o campo do
  // domínio do site moram lá desde a V8; a aba Domínio ficou com o subdomínio.
  if (ultimoHitDaTag) {
    passos.push({
      chave: 'tag',
      titulo: 'Tag do site instalada',
      estado: 'feito',
      frase: `Último evento da tag em ${dataHoraDeBrasilia(ultimoHitDaTag)}.`,
      verbo: 'Copiar tag do site',
      href: `${base}/fontes`,
      acao: 'copiar-tag',
    });
  } else if (integracoes === null) {
    passos.push({
      chave: 'tag',
      titulo: 'Tag do site instalada',
      estado: 'erro',
      frase: 'A configuração desta empresa não pôde ser lida.',
      verbo: 'Abrir as fontes',
      href: `${base}/fontes`,
      causa: 'configuração ilegível',
    });
  } else if (dominios.length === 0) {
    passos.push({
      chave: 'tag',
      titulo: 'Tag do site instalada',
      estado: 'pendente',
      frase: 'Sem domínio cadastrado, o console recusa os eventos do site.',
      verbo: 'Cadastrar o domínio do site',
      href: `${base}/fontes`,
    });
  } else {
    passos.push({
      chave: 'tag',
      titulo: 'Tag do site instalada',
      estado: 'pendente',
      frase: 'Nenhum evento da tag chegou ainda.',
      verbo: 'Copiar tag do site',
      href: `${base}/fontes`,
      acao: 'copiar-tag',
    });
  }

  // 5 · Webhook de vendas conectado: chegou pelo menos uma entrega. Hit da tag
  // não fecha este passo: a compra nunca vem pela tag (revisão B4 do v6).
  passos.push(
    ultimaEntregaDoWebhook
      ? {
          chave: 'webhook',
          titulo: 'Webhook de vendas conectado',
          estado: 'feito',
          frase: `Última entrega em ${dataHoraDeBrasilia(ultimaEntregaDoWebhook)}.`,
          verbo: 'Copiar o webhook',
          href: `${base}/fontes`,
        }
      : {
          chave: 'webhook',
          titulo: 'Webhook de vendas conectado',
          estado: 'pendente',
          frase: 'Nenhuma entrega do webhook entre os eventos recentes.',
          verbo: 'Conectar o webhook de vendas',
          href: `${base}/fontes`,
        }
  );

  // 6 · Primeiro evento aceito pela Meta, num Pixel real. Teste não conta.
  if (ultimoAceito || aceitosNoResumo > 0) {
    passos.push({
      chave: 'aceito',
      titulo: 'Primeiro evento aceito pela Meta',
      estado: 'feito',
      frase: ultimoAceito
        ? `Último evento real aceito, recebido em ${dataHoraDeBrasilia(ultimoAceito)}.`
        : 'A Meta aceitou evento real no período.',
      verbo: 'Ver os eventos',
      href: `${base}/eventos`,
    });
  } else if (recusados > 0) {
    const causa = `a Meta recusou ${recusados} ${recusados === 1 ? 'evento' : 'eventos'}`;
    passos.push({
      chave: 'aceito',
      titulo: 'Primeiro evento aceito pela Meta',
      estado: 'erro',
      frase: `${causa[0].toUpperCase()}${causa.slice(1)} e ainda não aceitou nenhum.`,
      verbo: 'Ver os recusados',
      href: `${base}/eventos?vista=fila`,
      causa,
    });
  } else {
    passos.push({
      chave: 'aceito',
      titulo: 'Primeiro evento aceito pela Meta',
      estado: 'pendente',
      frase: 'Nenhum evento real aceito ainda. Teste interno não conta.',
      verbo: 'Enviar o primeiro evento',
      href: `${base}/eventos?vista=fila`,
    });
  }

  const feitos = passos.filter((p) => p.estado === 'feito').length;
  const abertos = passos.filter((p) => p.estado !== 'feito');
  const proximo = abertos.find((p) => p.chave !== 'dominio') ?? abertos[0] ?? null;

  return {
    passos,
    feitos,
    total: TOTAL_DE_PASSOS,
    contagem: `${feitos} de ${TOTAL_DE_PASSOS}`,
    proximo,
    sinais: {
      pixelsCadastrados: pixelsCadastrados.length,
      pixelsComToken: pixelsComToken.length,
      ultimoHitDaTag,
      ultimaEntregaDoWebhook,
      ultimoAceito,
      recusados,
    },
  };
}

/* ------------------------------------------------------------------ */
/* O estado da empresa (o selo)                                        */
/* ------------------------------------------------------------------ */

export type TomDaEmpresa = 'erro' | 'pendente' | 'andamento' | 'ok';

export interface EstadoDaEmpresa {
  tom: TomDaEmpresa;
  /** O selo curto: "Com erro", "Falta configurar", "Em andamento". */
  rotulo: string;
  /** Com a causa em palavra: "Falta configurar: cadastrar um Pixel". */
  frase: string;
}

const minuscula = (s: string) => (s ? `${s[0].toLowerCase()}${s.slice(1)}` : s);

/**
 * O pior estado do checklist, com a causa em palavra. A ordem é erro →
 * pendente → andamento; entre os pendentes, o Domínio só aparece quando é o
 * único (ele não tem prova hoje, e não pode esconder um Pixel que falta).
 */
export function estadoDaEmpresa(checklist: Pick<ChecklistDaEmpresa, 'passos'>): EstadoDaEmpresa {
  const { passos } = checklist;
  const comErro = passos.find((p) => p.estado === 'erro');
  if (comErro) {
    return { tom: 'erro', rotulo: 'Com erro', frase: `Com erro: ${comErro.causa ?? minuscula(comErro.frase)}` };
  }
  const pendente =
    passos.find((p) => p.estado === 'pendente' && p.chave !== 'dominio') ??
    passos.find((p) => p.estado === 'pendente');
  if (pendente) {
    return { tom: 'pendente', rotulo: 'Falta configurar', frase: `Falta configurar: ${minuscula(pendente.verbo)}` };
  }
  if (passos.some((p) => p.estado === 'andamento')) {
    return { tom: 'andamento', rotulo: 'Em andamento', frase: 'Em andamento: apontamento do domínio' };
  }
  return { tom: 'ok', rotulo: 'Configurada', frase: 'Configuração completa' };
}
