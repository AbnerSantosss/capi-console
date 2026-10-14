/**
 * Os textos da aba Domínio (V8 do plano v7) — módulo puro.
 *
 * Nenhum React, nenhum `window`, nenhuma rede: roda no navegador (os
 * componentes desta pasta) e no teste (`scripts/dominio-tela.test.mjs`) do
 * mesmo jeito.
 *
 * A REGRA: a tela diz só o que existe. Hoje existem três situações de um site
 * cadastrado, e só três:
 *
 *  1. sem subdomínio próprio: a tag usa o nosso endereço;
 *  2. com subdomínio, e o endereço dele ainda não responde por este console:
 *     o apontamento foi pedido ao cliente e o certificado aguarda a
 *     configuração do nosso lado. A tag continua no nosso endereço;
 *  3. com subdomínio, e o endereço dele JÁ respondeu por este console, com
 *     certificado válido (medido pela rota `api/tag/gerar`): pronto.
 *
 * Nada de "Ativo", "Encontrado" ou "Emitindo": o console não consulta DNS nem
 * fala com o provedor do certificado, então não tem como saber essas coisas.
 */
import { textoDnsParaCliente, type DominioTag } from '@/lib/tag-dominios';

/** O mínimo de um domínio que os textos precisam. */
export type DominioDoCartao = Pick<DominioTag, 'host' | 'subdominio'>;

/** Em que pé está o domínio próprio de um site. */
export type EstadoDoDominio = 'sem-subdominio' | 'aguardando' | 'pronto';

export interface TextoDoCartao {
  estado: EstadoDoDominio;
  /** Primeira linha (vai para o `aria-label` do miniestado; no pronto, é a frase visível). */
  apontamento: string;
  /** Segunda linha (no `aria-label`; no pronto, é o que fazer agora, visível). */
  certificado: string;
  /** Frase que explica o que a tag faz enquanto isso (no `aria-label` do miniestado). */
  detalhe: string;
}

/**
 * O que o cartão MOSTRA de cada estado (E2 do plano HyperFrames): o título da
 * pílula e uma frase curta. As linhas de `textoDoCartao` continuam existindo
 * e vão para o `aria-label` do miniestado.
 */
export const ROTULO_DO_ESTADO: Record<EstadoDoDominio, string> = {
  'sem-subdominio': 'Usando o nosso endereço',
  aguardando: 'Aguardando ativação',
  pronto: 'Pronto',
};

/** A frase visível do estado aguardando (o atraso pode ser do cliente OU do certificado). */
export const FRASE_AGUARDANDO =
  'Falta o registro do cliente e o certificado. Enquanto isso a tag continua coletando.';

/**
 * A frase visível do estado pronto, embaixo de `apontamento`. A linha
 * `certificado` ("…copie de novo.") fica no `aria-label`.
 */
export const FRASE_PRONTO = 'Copie a tag de novo em Instalação.';

/** Subdomínio limpo, ou '' quando não há. */
function subDe(d: DominioDoCartao): string {
  return String(d?.subdominio ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');
}

/** Host limpo do site. */
function hostDe(d: DominioDoCartao): string {
  return String(d?.host ?? '').trim().toLowerCase();
}

/**
 * O endereço próprio completo (`m.exemplo.com.br`), ou '' sem subdomínio.
 */
export function enderecoProprioDe(d: DominioDoCartao): string {
  const sub = subDe(d);
  const host = hostDe(d);
  return sub && host ? `${sub}.${host}` : '';
}

/**
 * As duas linhas do cartão e a frase de explicação.
 *
 * `enderecoPronto` vem de `GET /api/tag/gerar` (campo `enderecoProprioPronto`).
 * Enquanto a resposta não chega, ou quando ela falha, quem chama passa `false`
 * — o padrão — e o cartão diz "aguardando", nunca "Pronto".
 */
export function textoDoCartao(dominio: DominioDoCartao, enderecoPronto = false): TextoDoCartao {
  const proprio = enderecoProprioDe(dominio);

  if (!proprio) {
    return {
      estado: 'sem-subdominio',
      apontamento: 'Não cadastrado: este site ainda não tem subdomínio próprio.',
      certificado: 'Certificado: vem depois do subdomínio.',
      detalhe:
        'A tag usa o nosso endereço e continua coletando. Para ela usar um endereço dentro do site do cliente, escolha um subdomínio.',
    };
  }

  if (enderecoPronto === true) {
    return {
      estado: 'pronto',
      apontamento: `Pronto: a tag usa ${proprio}.`,
      certificado: 'Se a tag foi instalada antes, copie de novo.',
      detalhe: `O endereço ${proprio} respondeu por este console, com certificado válido. Copie a tag em Instalação e troque a que está no site do cliente.`,
    };
  }

  return {
    estado: 'aguardando',
    apontamento: 'Apontamento: pedido ao cliente.',
    certificado: 'Certificado: aguardando configuração da Cloudflare.',
    detalhe:
      'Enquanto isso, a tag usa o nosso endereço e continua coletando. Quando o certificado ficar pronto, copie a tag de novo.',
  };
}

/* ------------------------------------------------------------------ */
/* Mensagem para o cliente                                             */
/* ------------------------------------------------------------------ */

export interface MensagemParaCliente {
  /** O texto que "Copiar mensagem para o cliente" copia: o de `textoDnsParaCliente`, sem edição. */
  texto: string;
  /** Link que abre o WhatsApp com o texto pronto (a pessoa escolhe o contato lá). */
  whatsapp: string;
  /** Link `mailto:` com assunto e corpo prontos. */
  email: string;
}

/**
 * A mensagem que o dono manda ao cliente, e os dois atalhos para mandar.
 *
 * O texto é o de `textoDnsParaCliente` (`tag-dominios.ts`), inteiro: escrito
 * para o dono do site, não para quem cuida de DNS. Esta função não reescreve
 * nada; só monta os links.
 */
export function mensagemParaCliente(dominio: DominioTag, base: string): MensagemParaCliente {
  const texto = textoDnsParaCliente(dominio, base);
  const assunto = `Configuração de DNS — ${hostDe(dominio) || 'seu domínio'}`;
  return {
    texto,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(texto)}`,
    email: `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`,
  };
}

/* ------------------------------------------------------------------ */
/* Subdomínio: sugestão, dica e validação                              */
/* ------------------------------------------------------------------ */

/** Sugestão do modal: curta e sem cara de rastreamento. */
export const SUBDOMINIO_SUGERIDO = 'm';

/**
 * Dica, não trava. Nome com cara de rastreamento entra em lista de bloqueador
 * de anúncio e a tag deixa de ser chamada no navegador de quem usa um. A
 * validação que vale é a do servidor (`api/integracoes`).
 */
export const DICA_DO_SUBDOMINIO =
  'Curto e neutro. Evite ad, gtm, sgtm, tracking, analytics, metrics, stape, gtag.';

/**
 * Erro legível do rótulo de subdomínio, ou null quando serve (vazio serve: o
 * subdomínio é opcional).
 *
 * Um rótulo torto vira um CNAME que o cliente cria no painel dele e que nunca
 * resolve. O prejuízo não aparece aqui: aparece como uma semana de campanha
 * esperando um endereço que não existe.
 */
export function erroDoSubdominio(v: string): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.length > 63) return 'Máximo de 63 caracteres.';
  if (s.includes('.')) return 'Escreva só a primeira parte, sem ponto. Ex.: m.';
  if (!/^[a-z0-9-]+$/.test(s)) return 'Só letras minúsculas, números e hífen.';
  if (s.startsWith('-') || s.endsWith('-')) {
    return 'Não pode começar nem terminar com hífen.';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* "Não ficou ativo?"                                                  */
/* ------------------------------------------------------------------ */

/**
 * O que costuma impedir o endereço próprio de ficar pronto. Só texto: o
 * console não mede nenhuma destas coisas. Uma frase de até 10 palavras por
 * causa (E2 do plano HyperFrames); a 2ª e a 4ª são as frases exatas do plano.
 */
export const SINTOMAS_NAO_FICOU_ATIVO: ReadonlyArray<string> = [
  'Registro faltando ou Nome errado. Peça um print do DNS.',
  'Criado como A ou TXT. Tem de ser CNAME.',
  'Outro registro com o mesmo nome. O antigo tem de sair.',
  'Nuvem laranja. Deixe cinza (DNS only).',
  'DNS ainda se espalhando. Pode levar algumas horas.',
  'Certo há um dia? Confira o certificado na nossa Cloudflare.',
];
