import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Escrita atômica com backup (B-1) e fila de escrita em processo (B-2).
 *
 * Existe porque `gravarJson` era `fs.writeFile` direto: sem tmp+rename, sem
 * backup e sem lock. Um processo morto no meio da escrita deixava
 * `config/integracoes.json` pela metade; na leitura seguinte o arquivo
 * ilegível caía no ramo que gera `INTEGRACOES_PADRAO()` — SEGREDO DE ENTRADA
 * NOVO — e o xWinner passava a receber 401. As vendas paravam de entrar em
 * silêncio (defeito B1, PARTE 14 §14.0.1).
 *
 * A técnica já existia no projeto (`perfil-atribuicao.ts:150-156`); só não
 * estava aplicada no arquivo mais crítico.
 */

/** `.bak` do estado ANTERIOR. Um só, sobrescrito a cada gravação (B1-a, B1-b). */
export function caminhoBak(arquivo: string): string {
  return arquivo + '.bak';
}

/** Efêmero: apagado pelo `rename`. Se sobrar, é diagnóstico de crash. */
export function caminhoTmp(arquivo: string): string {
  return arquivo + '.tmp';
}

/**
 * O arquivo de configuração existe mas NÃO pôde ser lido, e o `.bak` também
 * não serviu. Quem recebe isto entra em modo degradado (B1-e):
 *
 *  - webhooks respondem **503** ("tente de novo mais tarde"), NUNCA 401
 *    ("segredo errado", que faz o xWinner desistir da entrega);
 *  - nada é regenerado: o segredo de entrada só muda por clique humano (B1-g).
 *
 * A mensagem carrega o caminho RELATIVO do arquivo, para o operador saber onde
 * olhar. Nunca carrega conteúdo do arquivo — lá dentro moram o segredo do
 * webhook e o token da Meta (regra 2 do CLAUDE.md).
 */
export class ErroConfiguracaoIndisponivel extends Error {
  /** Caminho relativo ao `cwd` — nunca o caminho absoluto do container. */
  readonly arquivo: string;

  constructor(arquivo: string, motivo: string) {
    const relativo = caminhoLegivel(arquivo);
    super(`Configuração indisponível: ${relativo} não pôde ser lido (${motivo}).`);
    this.name = 'ErroConfiguracaoIndisponivel';
    this.arquivo = relativo;
  }
}

/** `C:\...\app\config\integracoes.json` → `config/integracoes.json`. */
export function caminhoLegivel(arquivo: string): string {
  const rel = path.relative(process.cwd(), arquivo);
  return (rel && !rel.startsWith('..') ? rel : path.basename(arquivo)).split(path.sep).join('/');
}

export interface OpcoesGravacao {
  /**
   * `false` pula a cópia para `.bak`. Usado SÓ na restauração: se o arquivo em
   * disco está corrompido e o conteúdo bom veio do `.bak`, copiar o corrompido
   * por cima do `.bak` destruiria a única cópia boa que sobrou.
   */
  backup?: boolean;
}

/**
 * Grava `conteudo` em `arquivo` sem nunca deixá-lo pela metade.
 *
 * A sequência em disco, e o que acontece se o processo morrer em cada passo:
 *
 *  1. `mkdir -p` da pasta          → nada escrito ainda; nada se perde.
 *  2. `copyFile(arquivo, .bak)`    → `.bak` pode ficar parcial, mas o ORIGINAL
 *                                    está intacto. A leitura seguinte lê o
 *                                    original e ignora o `.bak`.
 *  3. `write(.tmp)` + `fsync`      → o original continua intacto (B1-c) e o
 *                                    `.bak` continua sendo o estado anterior.
 *                                    Sobra um `.tmp` parcial, que ninguém lê.
 *  4. `rename(.tmp, arquivo)`      → atômico no mesmo volume (B1-d): ou o
 *                                    conteúdo velho, ou o novo. Nunca metade.
 *
 * Efeito colateral bom: como a troca é por `rename`, quem estiver LENDO durante
 * a gravação enxerga o arquivo velho inteiro, nunca um pedaço do novo.
 */
export async function gravarAtomico(
  arquivo: string,
  conteudo: string,
  opcoes: OpcoesGravacao = {}
): Promise<void> {
  const { backup = true } = opcoes;

  await fs.mkdir(path.dirname(arquivo), { recursive: true });

  if (backup) {
    // Primeira gravação: não há original para copiar (ENOENT). Qualquer outra
    // falha de backup também não pode impedir a gravação — ficar sem `.bak` é
    // ruim; não gravar é pior. Nada é logado: o conteúdo tem segredo e token.
    await fs.copyFile(arquivo, caminhoBak(arquivo)).catch(() => {});
  }

  const tmp = caminhoTmp(arquivo);
  try {
    const fh = await fs.open(tmp, 'w');
    try {
      await fh.writeFile(conteudo, 'utf8');
      // Sem o fsync, o `rename` pode chegar ao disco antes dos bytes e uma queda
      // de energia deixaria um arquivo novo, vazio e válido para o `JSON.parse`.
      await fh.sync();
    } finally {
      await fh.close();
    }
  } catch (e) {
    // B1-c: falhou escrevendo o `.tmp` → o original NÃO foi tocado.
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }

  await fs.rename(tmp, arquivo);
}

/* ------------------------------------------------------------------ */
/* B-2 — fila de escrita em processo                                    */
/* ------------------------------------------------------------------ */

const filas = new Map<string, Promise<unknown>>();

/**
 * Serializa operações sobre a mesma chave (um arquivo) numa cadeia de Promises.
 *
 * B2-a: uma fila POR ARQUIVO. B2-b: quem usa isto precisa LER DENTRO da fila —
 * ler fora e escrever dentro reintroduz exatamente o bug que isto conserta.
 *
 * ⚠️ Limites, ditos em voz alta:
 *  - É fila EM PROCESSO. Protege contra duas requisições do MESMO container
 *    (o caso real: a Tag contando hits enquanto o operador salva uma regra).
 *  - NÃO protege contra dois containers, nem contra `docker exec` editando o
 *    arquivo à mão, nem contra outro processo Node no mesmo volume. Para isso
 *    seria preciso lock de arquivo (B2-d) — e hoje o `docker-compose.yml` sobe
 *    um container só.
 *  - É reentrante-hostil: uma tarefa que chame `naFila` com a MESMA chave
 *    trava para sempre. Por isso `config-store.ts` tem um núcleo sem fila
 *    (`resolverIntegracoes`) usado por dentro.
 */
export function naFila<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior = filas.get(chave) ?? Promise.resolve();
  // `then(tarefa, tarefa)`: a próxima da fila roda mesmo que a anterior falhe.
  const resultado = anterior.then(tarefa, tarefa);
  filas.set(
    chave,
    resultado.then(
      () => undefined,
      () => undefined
    )
  );
  return resultado;
}

/** Só para teste: espera a fila de uma chave esvaziar. */
export async function filaVazia(chave: string): Promise<void> {
  await (filas.get(chave) ?? Promise.resolve());
}
