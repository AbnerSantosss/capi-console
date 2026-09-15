/**
 * Quem é lead de teste, e o que fazer com ele.
 *
 * Módulo NEUTRO de propósito — sem `import 'server-only'` — pelo mesmo motivo
 * de `inbox-sinais.ts` e `inbox-lote.ts`: a tela precisa explicar ao operador
 * exatamente a decisão que o servidor tomou, e duas cópias da regra viram duas
 * respostas diferentes no dia em que uma delas mudar.
 *
 * 🔴 Regra de ouro, herdada de `inbox-sinais.ts`: **nunca lança e nunca
 * registra nada**. Este código roda no caminho de recebimento do webhook, onde
 * uma exceção custa uma venda PIX real e um `console.log` de payload despejaria
 * e-mail de comprador no log do container.
 *
 * ────────────────────────────────────────────────────────────────────────
 * DOIS NÍVEIS, e a diferença entre eles é o ponto inteiro deste arquivo
 * ────────────────────────────────────────────────────────────────────────
 *
 * **É teste** (`ehTeste`) — alguém DECIDIU que aquilo é teste: o padrão
 * conhecido da plataforma (`@example.com`, `evt_preview…`, cupom de R$ 0,01) ou
 * a lista que o operador cadastrou. Nunca chega à Meta, fica fora de toda
 * porcentagem (regras 1 e 4 do CLAUDE.md). É o comportamento que
 * `ehTesteInterno` já tinha, agora com a lista do operador junto.
 *
 * **É suspeito** (`bloqueiaAutomatico`) — ninguém decidiu nada; o console
 * REPAROU num padrão. O caso real: o mesmo e-mail aparecendo em três, quatro,
 * cinco compras. Comprador de infoproduto compra uma vez — quem "compra"
 * cinco vezes está testando o checkout.
 *
 * 🔴 Suspeito NÃO vira ignorado, e isso é deliberado. Descartar sozinho uma
 * venda que o console só ACHA que é teste é o erro caro do outro lado: o
 * produto inteiro existe para não perder venda PIX. Suspeito para de sair
 * sozinho e espera um clique humano, com o motivo escrito na tela.
 */

/** Por que este evento foi marcado. Vocabulário fechado: é texto de tela e chave de agrupamento. */
export type MotivoDeTeste =
  /** O e-mail está na lista de testes cadastrada pelo operador. */
  | 'email-cadastrado'
  /** O nome está na lista de testes cadastrada pelo operador. */
  | 'nome-cadastrado'
  /** Padrão conhecido: @example.com, evt_preview…, cupom de centavos. */
  | 'padrao-conhecido'
  /** O mesmo e-mail em várias compras — ninguém compra o mesmo curso 4 vezes. */
  | 'email-repetido';

export interface VeredictoDeTeste {
  /**
   * `true` = tratar como teste: nunca vai à Meta, fica fora das porcentagens.
   * Só o que foi DECIDIDO (lista do operador ou padrão conhecido) chega aqui.
   */
  ehTeste: boolean;
  /**
   * `true` = não pode sair sozinho. Todo `ehTeste` também bloqueia, mas a
   * recíproca não vale: a suspeita por repetição bloqueia sem virar teste.
   */
  bloqueiaAutomatico: boolean;
  motivo?: MotivoDeTeste;
  /** Frase pronta, em português, para a tela e para o log de decisão. */
  explicacao?: string;
}

export const SEM_SUSPEITA: VeredictoDeTeste = { ehTeste: false, bloqueiaAutomatico: false };

/**
 * A lista que o operador cadastra. Tudo opcional: instalação que nunca abriu a
 * tela não tem o bloco, e ausência significa "lista vazia", nunca erro.
 */
export interface ListaDeTeste {
  /** E-mails inteiros. Comparados em minúsculas, sem espaços. */
  emails?: string[];
  /** Nomes (ou pedaços de nome) do testador. Comparação por conter, sem acento. */
  nomes?: string[];
  /**
   * A partir de quantas COMPRAS do mesmo e-mail o console suspeita.
   * Padrão 3: duas compras ainda podem ser upsell ou recompra legítima; a
   * terceira já não é um comprador, é alguém batendo no checkout.
   */
  comprasParaSuspeitar?: number;
}

export const COMPRAS_PARA_SUSPEITAR = 3;

/** Piso de 2: `1` transformaria toda primeira compra em suspeita e travaria o produto. */
export function limiteDeCompras(lista?: ListaDeTeste): number {
  const n = Number(lista?.comprasParaSuspeitar);
  if (!Number.isFinite(n) || n < 2) return COMPRAS_PARA_SUSPEITAR;
  return Math.floor(n);
}

/** Minúsculas, sem acento, sem espaço sobrando. Comparar nome sem isto erra em "Jairo" vs "JAIRO". */
function achatar(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .normalize('NFD')
    // `\p{Diacritic}` em vez da faixa literal de marcas combinantes: caractere
    // combinante cru dentro de um `[]` e invisivel no editor e nao sobrevive a
    // um copiar-e-colar distraido.
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function listaAchatada(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const saida: string[] = [];
  // Teto defensivo: uma lista gigante vinda de arquivo editado à mão não pode
  // custar tempo no caminho do webhook.
  for (const item of v.slice(0, 200)) {
    const t = achatar(item);
    if (t) saida.push(t);
  }
  return saida;
}

/**
 * O que o veredicto precisa saber do evento.
 *
 * Estrutural de propósito, como em `inbox-lote.ts`: os `campos` do parser
 * satisfazem o formato sem conversão, e a tela pode montar um objeto parcial só
 * para perguntar.
 */
export interface EventoSuspeitavel {
  email?: string;
  /** Nome completo, ou os pedaços que o parser achou. */
  nome?: string;
  firstName?: string;
  lastName?: string;
  valor?: number;
  eventId?: string;
  /** É uma compra? Só compra entra na contagem de repetição. */
  ehCompra?: boolean;
  /**
   * Quantas COMPRAS deste mesmo e-mail já existem na caixa, contando esta.
   * Quem sabe contar é quem tem a caixa em mãos (`inbox.ts`); este módulo só
   * aplica a régua. `undefined` = ninguém contou, e aí não há suspeita.
   */
  comprasDoMesmoEmail?: number;
}

const DOMINIOS_DE_TESTE = /@(example\.com|exemplo\.com\.br|example\.org|test\.com)$/;

/**
 * O padrão conhecido da plataforma e da equipe — a régua que `ehTesteInterno`
 * de `parser.ts` sempre aplicou, isolada aqui para ter um lugar só.
 *
 * 🔴 `parser.ts` continua sendo o dono da função `ehTesteInterno` e nada foi
 * removido de lá: o webhook ainda a chama, e ela é o piso desta decisão.
 */
export function padraoConhecido(ev: EventoSuspeitavel): boolean {
  const email = achatar(ev.email);
  const nome = achatar(ev.nome || `${ev.firstName ?? ''} ${ev.lastName ?? ''}`);
  const valor = Number(ev.valor ?? 0);
  if (typeof ev.eventId === 'string' && /^evt_preview/i.test(ev.eventId)) return true;
  if (DOMINIOS_DE_TESTE.test(email)) return true;
  if (email.startsWith('teste@') || email.startsWith('testador@') || email.includes('jairo')) return true;
  if (nome.includes('jairo') || nome === 'lead convidado' || nome.includes('simulacao teste')) return true;
  if (Number.isFinite(valor) && valor > 0 && valor <= 0.1) return true;
  return false;
}

/**
 * O veredicto. Ordem de precedência deliberada, do mais explícito ao mais
 * inferido — o motivo que a tela mostra é o primeiro que couber, e o mais
 * explícito é sempre o que melhor explica a decisão a quem está olhando.
 */
export function avaliarTeste(ev: EventoSuspeitavel, lista?: ListaDeTeste): VeredictoDeTeste {
  const email = achatar(ev.email);
  const nome = achatar(ev.nome || `${ev.firstName ?? ''} ${ev.lastName ?? ''}`);

  // 1. Lista do operador — decisão humana, vale mais que qualquer heurística.
  if (email && listaAchatada(lista?.emails).includes(email)) {
    return {
      ehTeste: true,
      bloqueiaAutomatico: true,
      motivo: 'email-cadastrado',
      explicacao: 'O e-mail deste evento está na lista de testes. Nada é enviado à Meta.',
    };
  }

  // Nome casa por CONTER: o operador cadastra "Jairo" e pega "Jairo Silva",
  // "jairo silva teste" e o que mais a plataforma inventar de sufixo.
  const nomes = listaAchatada(lista?.nomes);
  if (nome && nomes.some((n) => nome.includes(n))) {
    return {
      ehTeste: true,
      bloqueiaAutomatico: true,
      motivo: 'nome-cadastrado',
      explicacao: 'O nome deste evento está na lista de testes. Nada é enviado à Meta.',
    };
  }

  // 2. Padrão conhecido — o piso de sempre.
  if (padraoConhecido(ev)) {
    return {
      ehTeste: true,
      bloqueiaAutomatico: true,
      motivo: 'padrao-conhecido',
      explicacao:
        'Padrão de teste conhecido (domínio de exemplo, evt_preview ou cupom de centavos). Nada é enviado à Meta.',
    };
  }

  // 3. Suspeita por repetição — NÃO é teste, só para de sair sozinho.
  //
  // Só vale para COMPRA: o mesmo e-mail em vários Lead ou ViewContent é
  // normal (a pessoa voltou ao site), e barrar isso seria inventar suspeita
  // onde só há um visitante interessado.
  const limite = limiteDeCompras(lista);
  const compras = Number(ev.comprasDoMesmoEmail);
  if (ev.ehCompra === true && email && Number.isFinite(compras) && compras >= limite) {
    return {
      ehTeste: false,
      bloqueiaAutomatico: true,
      motivo: 'email-repetido',
      explicacao:
        `Este e-mail já aparece em ${compras} compras — comprador real compra uma vez. ` +
        'O evento fica na fila esperando você conferir; nada saiu sozinho.',
    };
  }

  return SEM_SUSPEITA;
}
