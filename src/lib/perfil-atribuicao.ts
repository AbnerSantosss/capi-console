import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Perfis de atribuicao por comprador.
 *
 * O purchase_approved pode chegar sem fbc/fbp (formato antigo) ou so com IP
 * interno do pod. O precheckout_opened, que chega minutos antes, traz tudo.
 * Guardamos por e-mail e por telefone e completamos o que faltar na hora do
 * disparo — sem isso o fbc se perde, e o fbc e o unico campo que liga a venda
 * a campanha / conjunto / anuncio no Gerenciador.
 *
 * Desde a tag de navegador existe um segundo tipo de origem: o hit da pagina
 * de vendas, que e ANONIMO (nao tem e-mail nem telefone — esses so nascem
 * depois, no backoffice). Esse hit se junta a venda pelo identificador de
 * visita, e por isso chaves() gera tambem 'visita:' e 'fbp:'.
 *
 * Persistencia: logs/perfis-atribuicao.jsonl (append-only; ultimo registro vence).
 */
const DIR = path.join(process.cwd(), 'logs');
const ARQ = path.join(DIR, 'perfis-atribuicao.jsonl');
const VALIDADE_MS = 30 * 24 * 3600 * 1000;
/**
 * Chave anonima ('visita:', 'fbp:') vale bem menos que chave de pessoa.
 *
 * 'email:'/'phone:' precisam dos 30 dias porque o precheckout de um comprador
 * pode preceder a compra em semanas. Ja o hit da tag existe para se juntar a
 * uma venda que vem minutos ou horas depois — passados 7 dias, a janela de
 * event_time da propria Meta ja se fechou e a atribuicao guardada nao tem mais
 * a quem servir. Como a tag e o unico produtor de volume alto aqui, e esta
 * validade curta que decide o tamanho do arquivo em regime.
 */
const VALIDADE_ANONIMA_MS = 7 * 24 * 3600 * 1000;
/**
 * Intervalo minimo entre duas gravacoes da MESMA chave com os MESMOS dados.
 *
 * Sem isto, cada PageView reescrevia o perfil inteiro: um visitante que abre 20
 * paginas gerava 40 linhas identicas. Reescrever so serve para renovar o `em`
 * (e adiar o vencimento), e uma vez por dia ja basta para isso.
 */
const REFRESCO_MS = 24 * 3600 * 1000;
/**
 * Campos guardados no perfil.
 *
 * Os 10 primeiros sao os originais do webhook. Os 6 ultimos sao de atribuicao
 * e so a tag de navegador consegue captura-los.
 *
 * ATENCAO: destes, sourceUrl continua sendo o UNICO que chega ate a Meta — e
 * ele que carrega as UTMs embutidas na propria string da URL. visitId, gclid,
 * ttclid, msclkid, referrer e fbclid nao viram campo de EventInput: servem ao
 * log de atribuicao e ao diagnostico do console (saber de que anuncio, de que
 * rede e de que pagina veio a visita quando o Gerenciador diz "direto").
 * Mandar qualquer um deles para a Meta como user_data faria o evento ser
 * recusado por campo desconhecido.
 */
const CAMPOS = [
  'fbc',
  'fbp',
  'ip',
  'userAgent',
  'sourceUrl',
  'firstName',
  'lastName',
  'externalId',
  'phone',
  'email',
  'visitId',
  'gclid',
  'ttclid',
  'msclkid',
  'referrer',
  'fbclid',
] as const;

type Campo = (typeof CAMPOS)[number];

interface Perfil {
  chave: string;
  em: string;
  dados: Partial<Record<Campo, string>>;
}

/**
 * Carga em voo. Garante que a leitura — e a compactacao que vem junto — rode
 * UMA vez: guardarPerfil sempre faz `await carregar()` antes de dar append,
 * entao, com a carga em voo compartilhada, nenhum append acontece durante a
 * troca do arquivo, que e o unico jeito de a compactacao perder uma linha.
 */
let carga: Promise<Map<string, Perfil>> | null = null;

/** Identificador de visita aceitavel: longo o bastante e sem lixo/espaco. */
const RE_VISIT_ID = /^[\w.:-]{8,128}$/;
/** Formato oficial do _fbp do Pixel: fb.1.<timestamp>.<aleatorio>. */
const RE_FBP = /^fb\.1\.\d{10,}\.\d+$/;

/**
 * Chaves sob as quais o perfil e gravado e procurado.
 *
 * Cada valor so vira chave depois de passar por uma validacao de formato.
 * Chave lixo (string vazia, 'null', 'undefined', um fbp truncado, um visitId
 * de 2 caracteres) colide: dois compradores diferentes cairiam no MESMO perfil
 * e um herdaria o fbc do outro — a venda seria creditada a campanha errada, e
 * o algoritmo aprenderia com um publico que nunca comprou. Por isso, na duvida,
 * nao se gera chave nenhuma: perder a heranca custa uma atribuicao; trocar de
 * comprador custa a atribuicao E envenena a otimizacao.
 *
 * A ordem da lista nao muda o resultado do merge (enriquecer() nunca
 * sobrescreve valor que ja existe, entao o primeiro perfil que preenche um
 * campo vence), mas fica registrada por confianca: email e phone identificam a
 * PESSOA; 'visita:' identifica a VISITA anonima e e a chave de juncao entre a
 * tag e a venda; 'fbp:' identifica so o NAVEGADOR e e rede de seguranca para
 * quando o visitId se perde (visitante limpou o storage, trocou de aba).
 */
function chaves(f: Record<string, unknown>): string[] {
  const out: string[] = [];
  const email = String(f.email || '').trim().toLowerCase();
  if (email.includes('@')) out.push(`email:${email}`);
  const tel = String(f.phone || '').replace(/\D+/g, '');
  if (tel.length >= 10) out.push(`phone:${tel.replace(/^55/, '')}`);
  const visita = String(f.visitId || '').trim();
  if (RE_VISIT_ID.test(visita)) out.push(`visita:${visita}`);
  const fbp = String(f.fbp || '').trim();
  if (RE_FBP.test(fbp)) out.push(`fbp:${fbp}`);
  return out;
}

/** Quanto tempo o perfil desta chave continua valendo. */
function validadeDe(chave: string): number {
  return chave.startsWith('visita:') || chave.startsWith('fbp:')
    ? VALIDADE_ANONIMA_MS
    : VALIDADE_MS;
}

function vencido(p: Perfil, agora: number): boolean {
  return agora - new Date(p.em).getTime() > validadeDe(p.chave);
}

/**
 * Reescreve o jsonl com uma linha por perfil vivo.
 *
 * O inbox.jsonl evita reescrita de proposito (ver o comentario de ARQ_EVENTOS
 * la): reescrever no lugar deixa o arquivo pela metade se o processo morrer no
 * meio, e la isso custaria o historico de disparo. Aqui esse risco nao existe
 * porque a troca e atomica — escreve num temporario e da rename, entao ou o
 * arquivo e o antigo inteiro ou o novo inteiro. E aqui a reescrita e
 * necessaria: sem ela o append-only cresce para sempre no ritmo do PageView, e
 * `carregar()` le esse arquivo inteiro para a memoria.
 */
async function compactar(m: Map<string, Perfil>) {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${ARQ}.${process.pid}.tmp`;
  const corpo = [...m.values()].map((p) => JSON.stringify(p) + '\n').join('');
  await fs.writeFile(tmp, corpo, 'utf8');
  await fs.rename(tmp, ARQ);
}

async function ler(): Promise<Map<string, Perfil>> {
  const m = new Map<string, Perfil>();
  let linhas = 0;
  try {
    const txt = await fs.readFile(ARQ, 'utf8');
    const agora = Date.now();
    for (const l of txt.split('\n')) {
      if (!l) continue;
      linhas++;
      try {
        const p = JSON.parse(l) as Perfil;
        // Ultimo registro vence, inclusive para vencer: se a linha mais nova
        // desta chave ja passou da validade, o perfil inteiro sai do mapa.
        if (vencido(p, agora)) m.delete(p.chave);
        else m.set(p.chave, p);
      } catch {
        /* linha corrompida: o append-only tolera e segue */
      }
    }
  } catch {
    /* arquivo ainda nao existe */
  }
  // So compacta quando sobrou lixo de verdade, para um restart sobre arquivo
  // ja limpo nao pagar uma reescrita a toa.
  if (linhas > m.size * 2 + 500) await compactar(m).catch(() => {});
  return m;
}

function carregar(): Promise<Map<string, Perfil>> {
  return (carga ??= ler());
}

/**
 * Guarda o que o evento trouxe de atribuicao. So grava se houver algum sinal.
 *
 * O porteiro aceita visitId porque o hit da tag e anonimo: ele chega sem
 * e-mail, e as vezes sem fbc/fbp (visitante com bloqueador), mas sempre com
 * visitId e userAgent. Sem esse aceite o perfil da pagina de vendas nunca
 * seria gravado e a venda que chegasse depois pelo webhook nao teria de onde
 * herdar o fbc. Evento sem nenhum desses sinais continua descartado — gravaria
 * um perfil vazio que so ocuparia chave.
 */
function mesmosDados(a: Perfil['dados'], b: Perfil['dados']): boolean {
  for (const c of CAMPOS) if (a[c] !== b[c]) return false;
  return true;
}

export async function guardarPerfil(f: Record<string, string | boolean>) {
  if (!f.fbc && !f.fbp && !f.ip && !f.userAgent && !f.visitId) return;
  const m = await carregar();
  const dados: Perfil['dados'] = {};
  for (const c of CAMPOS) if (typeof f[c] === 'string' && f[c]) dados[c] = f[c] as string;

  const agora = Date.now();
  const novos: Perfil[] = [];
  for (const chave of chaves(f)) {
    const anterior = m.get(chave);
    const juncao = { ...(anterior?.dados ?? {}), ...dados };
    // Nada de novo e o registro ainda esta fresco: escrever de novo so gastaria
    // disco. Ver REFRESCO_MS — e este atalho que segura o volume do PageView,
    // onde o mesmo visitante repete o mesmo perfil pagina apos pagina.
    if (
      anterior &&
      mesmosDados(anterior.dados, juncao) &&
      agora - new Date(anterior.em).getTime() < REFRESCO_MS
    ) {
      continue;
    }
    const p: Perfil = { chave, em: new Date(agora).toISOString(), dados: juncao };
    m.set(chave, p);
    novos.push(p);
  }

  if (!novos.length) return;
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(ARQ, novos.map((p) => JSON.stringify(p) + '\n').join(''), 'utf8');
}

/**
 * Completa os campos ausentes com o perfil. Nunca sobrescreve o que o evento
 * ja trouxe.
 *
 * Percorre TODAS as chaves do evento na ordem de chaves() (email, phone,
 * visita, fbp) e, como so preenche campo ausente, quem preenche primeiro
 * vence. Nao ha risco de uma chave fraca atropelar uma forte: a chave fraca so
 * consegue preencher o que ninguem antes preencheu.
 */
export async function enriquecer(
  f: Record<string, string | boolean>
): Promise<{ campos: Record<string, string | boolean>; herdados: string[] }> {
  const m = await carregar();
  const saida = { ...f };
  const herdados: string[] = [];
  for (const chave of chaves(f)) {
    const p = m.get(chave);
    if (!p) continue;
    if (vencido(p, Date.now())) continue;
    for (const c of CAMPOS) {
      const valor = p.dados[c];
      if (!saida[c] && valor) {
        saida[c] = valor;
        herdados.push(c);
      }
    }
  }
  return { campos: saida, herdados };
}

/** So para teste: descarta o cache em memoria e rele o jsonl. */
export function _limparCache() {
  carga = null;
}
