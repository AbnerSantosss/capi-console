/**
 * Elegibilidade de um item da caixa de entrada para DISPARO EM LOTE.
 *
 * Por que existe como módulo próprio e neutro: a decisão precisa ser a mesma na
 * tela (que pinta a caixa de seleção e explica por que um item está fora) e no
 * servidor (que confere de novo antes de mandar qualquer coisa para a Meta).
 * Duas cópias da regra viram duas respostas diferentes no dia em que uma delas
 * mudar — e a resposta errada aqui custa dinheiro. Por isso também não há
 * `server-only`: `inbox.ts` é server-only e não pode ser importado do navegador,
 * então `ItemElegivel` descreve o item POR ESTRUTURA, com todos os campos
 * opcionais. Um `ItemInbox` real satisfaz esse formato sem conversão nenhuma.
 *
 * A ELEGIBILIDADE É DELIBERADAMENTE CONSERVADORA: na dúvida, o item fica FORA
 * do lote. O lote é a única operação deste console que dispara muitos eventos
 * com um clique, e o clique não tem volta — evento enviado à Meta não se apaga.
 * Um lote errado manda conversão DUPLICADA (a mesma venda contada duas vezes,
 * ROAS inflado, o algoritmo aprendendo com um número que não existiu) ou manda
 * evento de TESTE da equipe para o dataset de produção. É exatamente o que as
 * regras 1 e 4 do CLAUDE.md do projeto proíbem: somente eventos reais, e acesso
 * de teste interno sempre segregado. Falso negativo custa um clique manual no
 * item; falso positivo custa o aprendizado da campanha.
 *
 * NADA aqui decide PARA ONDE o evento vai: a trava do Pixel continua sendo de
 * `modo-por-marca.ts` e a conferência final, de `auto-dispatch.ts`. Este arquivo
 * só responde "este item pode entrar na seleção?".
 */

/**
 * O mínimo que a decisão precisa saber de um item.
 *
 * Os nomes são os REAIS de `ItemInbox` (`src/lib/inbox.ts`) — não há `enviado`,
 * `ignorado` nem `lido` no arquivo: o que existe é `status`, `resultados`,
 * `modo`, `motivoIgnorar`, `testeInterno` e `testePlataforma`. Todos opcionais
 * aqui porque este tipo também descreve linha antiga de `logs/inbox.jsonl`,
 * gravada antes de metade desses campos existir — e porque a tela pode montar
 * um objeto parcial só para perguntar.
 */
export interface ItemElegivel {
  id: string;
  /** Nome do evento já resolvido pelo parser/regra. */
  evento?: string;
  /** Evento da Meta que a regra escolheu. */
  eventoMeta?: string;
  /**
   * Ciclo de vida do item: 'novo' | 'carregado' | 'disparado' | 'ignorado'.
   * Tipado como `string` de propósito, para casar com qualquer valor gravado
   * em disco por uma versão anterior sem travar a compilação da tela.
   */
  status?: string;
  /** Um resultado por pixel, gravado DEPOIS do disparo. Não-vazio = já foi. */
  resultados?: unknown[];
  /** Modo que a regra pediu. 'ignorar' nunca entra em lote. */
  modo?: 'auto' | 'fila' | 'ignorar';
  /** Por que nada foi enviado (regra, sem equivalente, não lido, teste...). */
  motivoIgnorar?: string;
  /** Payload de teste da equipe (cupom de R$ 0,01, @example.com). */
  testeInterno?: boolean;
  /** Botão "Testar" da plataforma (ping): entrega OK, nada a enviar. */
  testePlataforma?: boolean;
}

/**
 * Por que o item ficou de fora. Vocabulário fechado: é texto de tela e chave de
 * agrupamento, nunca entrada de decisão.
 */
export type MotivoInelegivel = 'ja-enviado' | 'ignorado' | 'teste-interno';

/**
 * O primeiro motivo que couber, ou `null` quando o item pode entrar no lote.
 *
 * A ordem é a da união acima e vale como precedência de EXIBIÇÃO — um item pode
 * casar com mais de um motivo (um teste interno já disparado, por exemplo) e
 * ficar fora pelo primeiro. Para a decisão tanto faz: qualquer motivo exclui.
 */
export function motivoInelegivel(item: ItemElegivel): MotivoInelegivel | null {
  // 1. JÁ ENVIADO — a trava mais cara de todas. Duas provas independentes,
  // porque nenhuma das duas sozinha cobre o histórico inteiro: `status` é
  // reaplicado de `inbox-resultados.jsonl` no boot e pode faltar em linha
  // antiga, e `resultados` só aparece depois que o disparo respondeu. Item com
  // qualquer sinal de que já foi para a Meta não volta ao lote nunca.
  if (item.status === 'disparado') return 'ja-enviado';
  if (Array.isArray(item.resultados) && item.resultados.length > 0) return 'ja-enviado';

  // 2. IGNORADO — o item já foi julgado "não é conversão" pela regra, pelo
  // parser (abandono, evento sem equivalente na Meta) ou por um corpo que nem
  // deu para ler. `registrarNaoLido()` grava justamente assim, e é por isto que
  // um item sem evento disparável não precisa de motivo próprio: ele já chega
  // como 'ignorado'. Ainda assim conferimos as três marcas, porque o operador
  // pode ter mudado o status na tela sem que `modo` fosse reescrito.
  if (item.status === 'ignorado') return 'ignorado';
  if (item.modo === 'ignorar') return 'ignorado';
  if (item.motivoIgnorar) return 'ignorado';

  // 3. TESTE — regra 4 do CLAUDE.md. `testeInterno` é o acesso da equipe
  // (cupom de R$ 0,01, @example.com); `testePlataforma` é o `ping` do botão
  // "Testar" do backoffice. Nenhum dos dois é venda, e nenhum dos dois pode
  // entrar num lote: o disparo da sonda tem caminho próprio, com
  // `test_event_code`, e é só por lá que ele tem o direito de existir.
  if (item.testeInterno === true) return 'teste-interno';
  if (item.testePlataforma === true) return 'teste-interno';

  return null;
}

/** Açúcar sobre `motivoInelegivel`, para o `filter` da tela ficar legível. */
export function elegivelParaLote(item: ItemElegivel): boolean {
  return motivoInelegivel(item) === null;
}

/**
 * Parte a lista em duas, preservando a ordem e o TIPO original dos itens.
 *
 * Genérico em `T` para a tela receber de volta os mesmos `ItemInbox` que passou
 * — sem isso, cada chamador teria que cruzar ids para reencontrar o objeto
 * inteiro, e cruzar id é onde se erra de item.
 *
 * Os excluídos voltam COM o motivo em vez de sumirem: uma seleção que
 * simplesmente encolhe sem explicação é a receita para o operador achar que o
 * console perdeu a venda dele e tentar de novo pela mão.
 */
export function separarParaLote<T extends ItemElegivel>(
  itens: T[]
): { elegiveis: T[]; excluidos: Array<{ item: T; motivo: MotivoInelegivel }> } {
  const elegiveis: T[] = [];
  const excluidos: Array<{ item: T; motivo: MotivoInelegivel }> = [];

  // Lista vazia (ou não-array vindo de JSON velho) devolve as duas listas
  // vazias: "nada a disparar" é resposta válida, não erro.
  if (!Array.isArray(itens)) return { elegiveis, excluidos };

  for (const item of itens) {
    const motivo = motivoInelegivel(item);
    if (motivo === null) elegiveis.push(item);
    else excluidos.push({ item, motivo });
  }

  return { elegiveis, excluidos };
}

// ---------------------------------------------------------------------------
// Reenvio das recusadas (T-M10)
//
// Lista SEPARADA do lote normal: `motivoInelegivel` continua tirando do lote
// todo item que já tem resultado. Aqui entra só o que a Meta respondeu e não
// aceitou, e só para o Pixel que recusou. O que já chegou nunca vai de novo.
// ---------------------------------------------------------------------------

/** O que o reenvio lê de um resultado gravado. Tudo opcional: o dado vem de `unknown`. */
interface ResultadoLido {
  marcaId?: string;
  pixelId?: string;
  status?: string;
  httpStatus?: number;
  eventsReceived?: number;
}

/** Lê campo a campo. Lixo (null, texto, número, lista) vira `null` e é pulado. */
function lerResultado(bruto: unknown): ResultadoLido | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const r = bruto as Record<string, unknown>;
  return {
    marcaId: typeof r.marcaId === 'string' && r.marcaId ? r.marcaId : undefined,
    pixelId: typeof r.pixelId === 'string' && r.pixelId ? r.pixelId : undefined,
    status: typeof r.status === 'string' ? r.status : undefined,
    httpStatus: typeof r.httpStatus === 'number' ? r.httpStatus : undefined,
    eventsReceived: typeof r.eventsReceived === 'number' ? r.eventsReceived : undefined,
  };
}

/**
 * O evento já chegou à Meta por este resultado. `duplicado` conta: é o servidor
 * dizendo que aquele Pixel já tinha recebido a mesma venda.
 */
function jaChegouNaMeta(r: ResultadoLido): boolean {
  return (
    r.status === 'enviado' ||
    r.status === 'duplicado' ||
    (r.httpStatus === 200 && (r.eventsReceived ?? 0) > 0)
  );
}

/**
 * A Meta RESPONDEU e não aceitou. Sem `httpStatus` não houve resposta (rede
 * fora, tempo esgotado, Pixel sem token): isso não é recusa e fica de fora.
 * Mesma régua de `recusadoDeVerdade` em inbox-resumo.ts.
 */
function recusadoPelaMeta(r: ResultadoLido): boolean {
  return !jaChegouNaMeta(r) && typeof r.httpStatus === 'number';
}

/**
 * Ids dos Pixels cadastrados (`marcaId`) que recusaram este item e que NÃO têm
 * nenhum resultado de "já chegou", nem pelo `marcaId` nem pelo `pixelId`.
 *
 * Devolve lista vazia para item ignorado, teste interno ou ping da plataforma,
 * e para item sem resultado. Sem repetição, na ordem em que os resultados estão.
 */
export function pixelsRecusados(item: ItemElegivel): string[] {
  if (!item || typeof item !== 'object') return [];
  if (item.status === 'ignorado' || item.modo === 'ignorar' || item.motivoIgnorar) return [];
  if (item.testeInterno === true || item.testePlataforma === true) return [];
  if (!Array.isArray(item.resultados)) return [];

  const lidos: ResultadoLido[] = [];
  for (const bruto of item.resultados) {
    const r = lerResultado(bruto);
    if (r) lidos.push(r);
  }

  // Primeiro tudo o que já chegou. Um aceite em QUALQUER linha trava o Pixel.
  const chegaram = new Set<string>();
  for (const r of lidos) {
    if (!jaChegouNaMeta(r)) continue;
    if (r.marcaId) chegaram.add('m:' + r.marcaId);
    if (r.pixelId) chegaram.add('p:' + r.pixelId);
  }

  const saida: string[] = [];
  for (const r of lidos) {
    if (!r.marcaId || !recusadoPelaMeta(r)) continue;
    if (chegaram.has('m:' + r.marcaId)) continue;
    if (r.pixelId && chegaram.has('p:' + r.pixelId)) continue;
    if (!saida.includes(r.marcaId)) saida.push(r.marcaId);
  }
  return saida;
}

/**
 * Os itens que têm pelo menos um Pixel a reenviar, cada um com os seus Pixels.
 * Preserva a ordem e devolve os MESMOS objetos, como `separarParaLote`.
 */
export function separarRecusadas<T extends ItemElegivel>(
  itens: T[]
): Array<{ item: T; marcas: string[] }> {
  const saida: Array<{ item: T; marcas: string[] }> = [];
  if (!Array.isArray(itens)) return saida;

  for (const item of itens) {
    const marcas = pixelsRecusados(item);
    if (marcas.length > 0) saida.push({ item, marcas });
  }
  return saida;
}
