/**
 * Por que este evento está parado na Fila, numa frase, e o que resolve.
 *
 * Módulo NEUTRO de propósito, sem `import 'server-only'`, como
 * `inbox-sinais.ts`: a linha da Fila precisa explicar exatamente a decisão que
 * o servidor tomou, e o teste chama esta mesma função.
 *
 * O modelo que a tela ensina cabe em três saídas, e só três:
 *   1. enviar agora (o botão da linha);
 *   2. deixar na fila (não fazer nada);
 *   3. fazer os PRÓXIMOS saírem sozinhos: a chave que faltou.
 *
 * Um evento só sai sozinho com DUAS chaves ligadas: a regra do evento em
 * Automático e o envio automático do Pixel (`modo-por-marca.ts`). A frase diz
 * qual das duas faltou, na ordem em que o servidor perguntou, e a ação aponta
 * para a aba onde ela se liga. Nada aqui decide envio: só explica.
 *
 * O motivo é o que valia QUANDO o evento chegou. A chave pode ter mudado
 * depois, e por isso a frase fala no passado ("estava"), nunca no presente.
 */

/** Vocabulário de `MotivoFila` (`modo-por-marca.ts`), repetido: aquele arquivo é `server-only`. */
export type MotivoDaFila = 'regra-em-fila' | 'auto-do-pixel-desligado' | 'sem-token';

/** Para onde a ação leva. A tela monta o endereço com a empresa do endereço. */
export type AbaDaAcao = 'regras' | 'pixels';

export interface ExplicacaoDaFila {
  /** O porquê, em uma frase curta. */
  frase: string;
  /** A chave que faltou. Ausente quando não há chave a ligar (suspeita de teste). */
  acao?: { rotulo: string; aba: AbaDaAcao };
  /** Pixels deste evento em modo teste: o envio cai só no Testar eventos. */
  avisoTeste?: string;
}

/** O mínimo do item que a explicação lê. Estrutural, para servir à tela e ao teste. */
export interface ItemParaExplicar {
  status: 'novo' | 'carregado' | 'disparado' | 'ignorado';
  modo?: 'auto' | 'fila' | 'ignorar';
  modoPorMarca?: Record<string, 'auto' | 'fila'>;
  motivoFila?: Record<string, MotivoDaFila>;
  resultados?: Array<{ marcaId: string; status: string }>;
  explicacaoDeTeste?: string;
}

/** O mínimo do Pixel. `MarcaPublica` cabe aqui. */
export interface PixelParaExplicar {
  id: string;
  nome: string;
  testCode?: string;
}

/** "A", "A e B", "A, B e C". */
function juntar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

function nomesDos(ids: string[], pixels: PixelParaExplicar[]): string {
  // Pixel apagado depois que o evento chegou: some da frase em vez de virar id cru.
  const nomes = ids
    .map((id) => pixels.find((p) => p.id === id)?.nome)
    .filter((n): n is string => Boolean(n));
  return juntar(nomes);
}

function comPixel(prefixoUm: string, prefixoVarios: string, ids: string[], pixels: PixelParaExplicar[]) {
  const nomes = nomesDos(ids, pixels);
  if (!nomes) return prefixoUm.replace(/ \{nome\}/, '');
  return (ids.length > 1 ? prefixoVarios : prefixoUm).replace('{nome}', nomes);
}

/**
 * Os Pixels de destino deste evento: os que o servidor decidiu, ou os que já
 * receberam alguma tentativa. Vazio em item antigo, gravado antes da FASE 6.
 */
function destinos(item: ItemParaExplicar): string[] {
  const ids = new Set<string>([
    ...Object.keys(item.modoPorMarca ?? {}),
    ...Object.keys(item.motivoFila ?? {}),
    ...(item.resultados ?? []).map((r) => r.marcaId),
  ]);
  return [...ids];
}

/**
 * O aviso de modo teste vale para qualquer evento que ainda vai sair: é o que
 * fazia "enviar" parecer quebrado, com tudo indo para o Testar eventos.
 */
function avisoDeTeste(item: ItemParaExplicar, pixels: PixelParaExplicar[]): string | undefined {
  const emTeste = destinos(item).filter((id) =>
    Boolean(pixels.find((p) => p.id === id)?.testCode?.trim())
  );
  if (emTeste.length === 0) return undefined;
  const nomes = nomesDos(emTeste, pixels);
  return emTeste.length > 1
    ? `Os Pixels ${nomes} estão em modo teste: o que sair para eles vai só para o Testar eventos da Meta e não conta na campanha.`
    : `O Pixel ${nomes} está em modo teste: o que sair para ele vai só para o Testar eventos da Meta e não conta na campanha.`;
}

/**
 * A explicação da linha, ou `null` quando não há o que explicar: evento já
 * enviado, marcado para não enviar, ou que saiu sozinho.
 */
export function explicarFila(
  item: ItemParaExplicar,
  pixels: PixelParaExplicar[]
): ExplicacaoDaFila | null {
  if (item.status === 'disparado' || item.status === 'ignorado') return null;
  if (item.modo === 'ignorar') return null;

  const avisoTeste = avisoDeTeste(item, pixels);
  const resultados = item.resultados ?? [];
  const motivos = item.motivoFila ?? {};
  const idsPor = (m: MotivoDaFila) => Object.keys(motivos).filter((id) => motivos[id] === m);

  // 1 — A regra pediu fila. Vale para todos os Pixels, então vem primeiro,
  // na mesma ordem em que o servidor pergunta (`resolverModoPorMarca`).
  // Item antigo, sem `motivoFila`, mas com a regra em Fila: mesma resposta.
  if (idsPor('regra-em-fila').length > 0 || (!item.motivoFila && item.modo === 'fila')) {
    return {
      frase: 'Ficou na fila porque a regra deste evento estava em Fila.',
      acao: { rotulo: 'Pôr a regra em Automático', aba: 'regras' },
      avisoTeste,
    };
  }

  // 2 — A regra pediu automático, e a chave do Pixel estava desligada.
  const desligados = [
    ...idsPor('auto-do-pixel-desligado'),
    ...resultados.filter((r) => r.status === 'pixel-desligado').map((r) => r.marcaId),
  ];
  if (desligados.length > 0) {
    const ids = [...new Set(desligados)];
    return {
      frase: comPixel(
        'Ficou na fila porque o envio automático do Pixel {nome} estava desligado.',
        'Ficou na fila porque o envio automático dos Pixels {nome} estava desligado.',
        ids,
        pixels
      ),
      acao: { rotulo: 'Ligar o automático do Pixel', aba: 'pixels' },
      avisoTeste,
    };
  }

  // 3 — As duas chaves ligadas, mas o Pixel não tinha com o que enviar.
  const semToken = [
    ...idsPor('sem-token'),
    ...resultados.filter((r) => r.status === 'sem-token').map((r) => r.marcaId),
  ];
  if (semToken.length > 0) {
    const ids = [...new Set(semToken)];
    return {
      frase: comPixel(
        'Ficou na fila porque o Pixel {nome} estava sem token de acesso.',
        'Ficou na fila porque os Pixels {nome} estavam sem token de acesso.',
        ids,
        pixels
      ),
      acao: { rotulo: 'Salvar o token do Pixel', aba: 'pixels' },
      avisoTeste,
    };
  }

  // 4 — As duas chaves ligadas, e o console desconfiou de teste. Não há chave
  // a ligar: quem decide se é venda real é quem olha (`deteccao-de-teste.ts`).
  if (resultados.some((r) => r.status === 'suspeita-de-teste')) {
    const porque = item.explicacaoDeTeste?.trim();
    return {
      frase: porque
        ? `Não saiu sozinho porque parece teste: ${porque.replace(/\.$/, '')}. Se for venda real, envie agora.`
        : 'Não saiu sozinho porque parece teste. Se for venda real, envie agora.',
      avisoTeste,
    };
  }

  // Saiu sozinho, ou tentou e a Meta recusou: o selo "falhou em N Pixels"
  // e o menu já contam essa história. Fica só o aviso de teste, se houver.
  return avisoTeste ? { frase: '', avisoTeste } : null;
}

/**
 * O selo de modo que a linha mostra. A regra pode dizer `auto` e o evento ter
 * ficado na fila porque a chave do Pixel estava desligada: o selo segue o que
 * ACONTECEU, não o que a regra pediu.
 */
export function modoEfetivoDoItem(
  item: Pick<ItemParaExplicar, 'modo' | 'modoPorMarca'>
): 'auto' | 'fila' | 'ignorar' | undefined {
  if (item.modo !== 'auto' || !item.modoPorMarca) return item.modo;
  const valores = Object.values(item.modoPorMarca);
  if (valores.length === 0) return item.modo;
  return valores.includes('auto') ? 'auto' : 'fila';
}
