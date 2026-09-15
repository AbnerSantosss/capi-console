'use client';

/**
 * Barra de filtros da caixa de entrada + gatilho do disparo em lote.
 *
 * Por que saiu do `InboxList.tsx`: aquele arquivo já passava de mil linhas e
 * carrega o SSE, a mesclagem e a linha da lista. Filtro é outra preocupação —
 * decide O QUE APARECE, nunca o que é enviado — e quis-se que isso ficasse
 * óbvio pela separação física dos arquivos.
 *
 * 🔴 Este módulo NÃO conhece elegibilidade de disparo. Quem decide se um item
 * pode entrar num lote é `src/lib/inbox-lote.ts`, e só ele. Aqui só existe
 * "passa no filtro da tela" — que é um recorte de EXIBIÇÃO. Misturar as duas
 * coisas foi exatamente o erro que o módulo dedicado existe para impedir: um
 * filtro mais frouxo nunca pode ampliar o que vai para a Meta.
 */

import React from 'react';
import { ListFilter, Send, Square, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

/* ------------------------------------------------------------------ */
/* O vocabulário do filtro                                             */
/* ------------------------------------------------------------------ */

/** `'todos'` é sentinela, nunca nome de evento: o Select do DS não lida bem com valor vazio. */
export const TODOS = 'todos';

export type FiltroAtribuicao =
  | 'todos'
  | 'fbc'
  | 'fbclid'
  | 'gclid'
  | 'ttclid'
  | 'msclkid'
  | 'sem';
export type FiltroOrigem = 'todos' | 'webhook' | 'tag';

/** Em que ponto do caminho o evento está. `'novo'` cobre também o já lido ('carregado'). */
export type FiltroStatus = 'todos' | 'novo' | 'disparado' | 'ignorado';

/** 'reais' esconde teste da equipe/plataforma; o padrão continua sendo mostrar tudo. */
export type FiltroEquipe = 'todos' | 'reais' | 'so-testes';

export interface FiltrosInboxValor {
  /** Nome do evento como a plataforma mandou, ou `TODOS`. */
  evento: string;
  atribuicao: FiltroAtribuicao;
  origem: FiltroOrigem;
  status: FiltroStatus;
  equipe: FiltroEquipe;
}

export const FILTROS_VAZIOS: FiltrosInboxValor = {
  evento: TODOS,
  atribuicao: 'todos',
  origem: 'todos',
  status: 'todos',
  equipe: 'todos',
};

/**
 * O mínimo que o filtro precisa enxergar de um item.
 *
 * Estrutural de propósito: assim este arquivo não importa `InboxList.tsx` só
 * para pegar um tipo, e um `ItemInbox` real satisfaz o formato sem conversão.
 */
export interface ItemFiltravel {
  evento?: string;
  eventoOrigem?: string;
  origem: string;
  /** 'novo' | 'carregado' | 'disparado' | 'ignorado' — string para não amarrar o tipo da lista. */
  status: string;
  temFbc: boolean;
  temFbclid?: boolean;
  temGclid?: boolean;
  temTtclid?: boolean;
  temMsclkid?: boolean;
  /** Acesso de teste da equipe (regra 4 do CLAUDE.md). */
  testeInterno?: boolean;
  /** Evento de teste marcado pela própria plataforma de pagamento. */
  testePlataforma?: boolean;
}

/** Nome do evento usado pelo filtro e pela lista de opções — sempre o mesmo. */
export function nomeDoEvento(item: ItemFiltravel): string {
  return item.eventoOrigem ?? item.evento ?? 'sem nome de evento';
}

/** `origem` guarda o rótulo de entrada; só a tag grava literalmente 'tag'. */
export function origemDoItem(item: ItemFiltravel): 'webhook' | 'tag' {
  return item.origem === 'tag' ? 'tag' : 'webhook';
}

export function haFiltroAtivo(f: FiltrosInboxValor): boolean {
  return (
    f.evento !== TODOS ||
    f.atribuicao !== 'todos' ||
    f.origem !== 'todos' ||
    f.status !== 'todos' ||
    f.equipe !== 'todos'
  );
}

/**
 * Recorte de exibição. Uma função pura para poder ser lida de cima a baixo
 * sem abrir o componente — é ela que decide o número que o operador vê no
 * botão do lote, e esse número precisa ser conferível a olho nu.
 */
export function passaFiltros(item: ItemFiltravel, f: FiltrosInboxValor): boolean {
  if (f.evento !== TODOS && nomeDoEvento(item) !== f.evento) return false;
  if (f.origem !== 'todos' && origemDoItem(item) !== f.origem) return false;

  // O `switch` nunca devolve `true` direto: as regras de situação e de teste
  // vêm DEPOIS dele e também precisam ser aplicadas.
  switch (f.atribuicao) {
    case 'fbc':
      if (item.temFbc !== true) return false;
      break;
    case 'fbclid':
      if (item.temFbclid !== true) return false;
      break;
    case 'gclid':
      if (item.temGclid !== true) return false;
      break;
    case 'ttclid':
      if (item.temTtclid !== true) return false;
      break;
    case 'msclkid':
      if (item.temMsclkid !== true) return false;
      break;
    // "Sem atribuição" é a ausência dos CINCO sinais. Não é o mesmo que "sem
    // fbc": um item pode ter chegado com fbclid na URL e nenhum cookie _fbc.
    case 'sem':
      if (
        item.temFbc === true ||
        item.temFbclid === true ||
        item.temGclid === true ||
        item.temTtclid === true ||
        item.temMsclkid === true
      ) {
        return false;
      }
      break;
    default:
      break;
  }

  // Situação: "na fila" junta o que ainda não foi lido ('novo') com o que já
  // foi aberto ('carregado') — para o operador os dois continuam esperando.
  if (f.status === 'novo' && !(item.status === 'novo' || item.status === 'carregado')) return false;
  if (f.status === 'disparado' && item.status !== 'disparado') return false;
  if (f.status === 'ignorado' && item.status !== 'ignorado') return false;

  // Regra 4 do CLAUDE.md: teste da equipe nunca se mistura com venda real.
  const ehTeste = item.testeInterno === true || item.testePlataforma === true;
  if (f.equipe === 'reais' && ehTeste) return false;
  if (f.equipe === 'so-testes' && !ehTeste) return false;

  return true;
}

const TEXTO_ATRIBUICAO: Record<FiltroAtribuicao, string> = {
  todos: 'qualquer atribuição',
  fbc: 'com fbc',
  fbclid: 'com fbclid',
  gclid: 'com gclid (Google)',
  ttclid: 'com ttclid (TikTok Ads)',
  msclkid: 'com msclkid (Microsoft Ads)',
  sem: 'sem atribuição nenhuma',
};

const TEXTO_ORIGEM: Record<FiltroOrigem, string> = {
  todos: 'qualquer origem',
  webhook: 'webhook',
  tag: 'tag do site',
};

const TEXTO_STATUS: Record<FiltroStatus, string> = {
  todos: 'qualquer situação',
  novo: 'na fila',
  disparado: 'enviados à Meta',
  ignorado: 'ignorados',
};

const TEXTO_EQUIPE: Record<FiltroEquipe, string> = {
  todos: 'reais e testes juntos',
  reais: 'só eventos reais',
  'so-testes': 'só testes da equipe',
};

/**
 * O filtro ativo EM PALAVRAS, para o diálogo de confirmação do lote.
 *
 * Existe porque "Disparar os 12 filtrados" não diz quais 12. Quem confirma um
 * disparo real precisa ler, em português, o recorte que produziu aquele número
 * — sem voltar para a tela de trás para conferir os cinco seletores.
 */
export function descreverFiltros(f: FiltrosInboxValor): string {
  if (!haFiltroAtivo(f)) return 'Sem filtro: todos os eventos da lista.';
  const partes: string[] = [];
  if (f.evento !== TODOS) partes.push(`Evento: ${f.evento}`);
  if (f.atribuicao !== 'todos') partes.push(`Atribuição: ${TEXTO_ATRIBUICAO[f.atribuicao]}`);
  if (f.origem !== 'todos') partes.push(`Origem: ${TEXTO_ORIGEM[f.origem]}`);
  if (f.status !== 'todos') partes.push(`Situação: ${TEXTO_STATUS[f.status]}`);
  if (f.equipe !== 'todos') partes.push(`Testes: ${TEXTO_EQUIPE[f.equipe]}`);
  return partes.join(' · ');
}

/* ------------------------------------------------------------------ */
/* Progresso do lote                                                   */
/* ------------------------------------------------------------------ */

/**
 * Contagem viva do lote em andamento. `pulados` é categoria própria e não erro:
 * é a resposta "já foi enviado" da rota, que significa que o console fez a
 * coisa certa ao não mandar de novo.
 */
export interface ProgressoLote {
  total: number;
  feitos: number;
  ok: number;
  pulados: number;
  erros: { id: string; evento: string; motivo: string }[];
}

/* ------------------------------------------------------------------ */
/* A barra                                                             */
/* ------------------------------------------------------------------ */

export function FiltrosInbox({
  valor,
  onValor,
  opcoesEvento,
  totalItens,
  totalVisiveis,
  totalElegiveis,
  lote,
  onAbrirLote,
  onPararLote,
}: {
  valor: FiltrosInboxValor;
  onValor: (v: FiltrosInboxValor) => void;
  /** Eventos presentes na lista, com quantos itens cada um tem. */
  opcoesEvento: { valor: string; total: number }[];
  totalItens: number;
  totalVisiveis: number;
  totalElegiveis: number;
  /** Não-nulo enquanto um lote roda: a barra troca o botão pelo progresso. */
  lote: ProgressoLote | null;
  onAbrirLote: () => void;
  onPararLote: () => void;
}) {
  const ativo = haFiltroAtivo(valor);
  const rodando = lote !== null;
  const pct = rodando && lote.total > 0 ? Math.round((lote.feitos / lote.total) * 100) : 0;

  return (
    // FASE 3a: a barra de filtros é renderizada pela `InboxList`, dentro do
    // cartão da caixa de entrada. Em `surface-2` ela fica 0.053 de L acima
    // dele — separa por luz, como manda o G3′, e a borda sai.
    <div className="flex flex-col gap-2 rounded-control bg-surface-2 p-3">
      {/* Abaixo de 48rem cada campo ocupa a linha inteira: cinco selects lado a
          lado em 360px davam 5 linhas de filtro antes da lista, e cada gatilho
          ficava estreito demais para ler o valor escolhido. */}
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-caption font-medium text-fg-muted md:h-control-md">
          <ListFilter className="size-3.5" aria-hidden />
          Filtrar
        </span>

        <CampoFiltro id="filtro-evento" rotulo="Evento">
          <Select
            value={valor.evento}
            onValueChange={(v) => v && onValor({ ...valor, evento: String(v) })}
          >
            <SelectTrigger id="filtro-evento" className="w-full min-w-0">
              <span className="truncate text-fg-strong">
                {valor.evento === TODOS ? 'Todos os eventos' : valor.evento}
              </span>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value={TODOS}>
                <span className="text-label text-fg-body">Todos os eventos ({totalItens})</span>
              </SelectItem>
              {opcoesEvento.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-mono text-label text-fg-body">{o.valor}</span>
                    <span className="text-caption text-fg-muted tabular">({o.total})</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFiltro>

        <CampoFiltro id="filtro-atribuicao" rotulo="Atribuição">
          <Select
            value={valor.atribuicao}
            onValueChange={(v) => v && onValor({ ...valor, atribuicao: v as FiltroAtribuicao })}
          >
            <SelectTrigger id="filtro-atribuicao" className="w-full min-w-0">
              <span className="truncate text-fg-strong">
                {valor.atribuicao === 'todos' ? 'Todas' : TEXTO_ATRIBUICAO[valor.atribuicao]}
              </span>
            </SelectTrigger>
            <SelectContent>
              <OpcaoSimples valor="todos" rotulo="Todas" ajuda="Não filtra por atribuição." />
              <OpcaoSimples
                valor="fbc"
                rotulo="Com fbc"
                ajuda="O cookie _fbc do clique no anúncio veio junto."
              />
              <OpcaoSimples
                valor="fbclid"
                rotulo="Com fbclid"
                ajuda="O parâmetro de clique da Meta apareceu no payload."
              />
              <OpcaoSimples
                valor="gclid"
                rotulo="Com gclid (Google)"
                ajuda="Atribuição do Google Ads no payload."
              />
              <OpcaoSimples
                valor="ttclid"
                rotulo="TikTok Ads (ttclid)"
                ajuda="O parâmetro de clique do TikTok apareceu no payload."
              />
              <OpcaoSimples
                valor="msclkid"
                rotulo="Microsoft Ads (msclkid)"
                ajuda="O parâmetro de clique do Bing/Microsoft apareceu no payload."
              />
              <OpcaoSimples
                valor="sem"
                rotulo="Sem atribuição"
                ajuda="Nenhum dos cinco sinais: fbc, fbclid, gclid, ttclid ou msclkid."
              />
            </SelectContent>
          </Select>
        </CampoFiltro>

        <CampoFiltro id="filtro-origem" rotulo="Origem">
          <Select
            value={valor.origem}
            onValueChange={(v) => v && onValor({ ...valor, origem: v as FiltroOrigem })}
          >
            <SelectTrigger id="filtro-origem" className="w-full min-w-0">
              <span className="truncate text-fg-strong">
                {valor.origem === 'todos' ? 'Todas' : TEXTO_ORIGEM[valor.origem]}
              </span>
            </SelectTrigger>
            <SelectContent>
              <OpcaoSimples valor="todos" rotulo="Todas" ajuda="Webhook e tag do site." />
              <OpcaoSimples
                valor="webhook"
                rotulo="Webhook"
                ajuda="Chegou pela URL que a plataforma chama."
              />
              <OpcaoSimples
                valor="tag"
                rotulo="Tag do site"
                ajuda="Chegou do navegador, pelo coletor da tag."
              />
            </SelectContent>
          </Select>
        </CampoFiltro>

        <CampoFiltro id="filtro-status" rotulo="Situação">
          <Select
            value={valor.status}
            onValueChange={(v) => v && onValor({ ...valor, status: v as FiltroStatus })}
          >
            <SelectTrigger id="filtro-status" className="w-full min-w-0">
              <span className="truncate text-fg-strong">
                {valor.status === 'todos' ? 'Todas' : TEXTO_STATUS[valor.status]}
              </span>
            </SelectTrigger>
            <SelectContent>
              <OpcaoSimples valor="todos" rotulo="Todas" ajuda="Não filtra por situação." />
              <OpcaoSimples
                valor="novo"
                rotulo="Na fila"
                ajuda="Ainda não foi para a Meta — inclui os já abertos."
              />
              <OpcaoSimples
                valor="disparado"
                rotulo="Enviados à Meta"
                ajuda="A API de Conversões já aceitou este evento."
              />
              <OpcaoSimples
                valor="ignorado"
                rotulo="Ignorados"
                ajuda="Uma regra ou um motivo mandou não enviar."
              />
            </SelectContent>
          </Select>
        </CampoFiltro>

        <CampoFiltro id="filtro-equipe" rotulo="Testes">
          <Select
            value={valor.equipe}
            onValueChange={(v) => v && onValor({ ...valor, equipe: v as FiltroEquipe })}
          >
            <SelectTrigger id="filtro-equipe" className="w-full min-w-0">
              <span className="truncate text-fg-strong">
                {valor.equipe === 'todos' ? 'Tudo junto' : TEXTO_EQUIPE[valor.equipe]}
              </span>
            </SelectTrigger>
            <SelectContent>
              <OpcaoSimples
                valor="todos"
                rotulo="Tudo junto"
                ajuda="Eventos reais e testes na mesma lista."
              />
              <OpcaoSimples
                valor="reais"
                rotulo="Só eventos reais"
                ajuda="Esconde teste da equipe e teste da plataforma."
              />
              <OpcaoSimples
                valor="so-testes"
                rotulo="Só testes da equipe"
                ajuda="Mostra apenas o que foi marcado como teste."
              />
            </SelectContent>
          </Select>
        </CampoFiltro>

        {ativo && (
          <Button
            size="sm"
            variant="ghost"
            className="min-h-control-md w-full md:w-auto md:min-h-control-sm"
            onClick={() => onValor(FILTROS_VAZIOS)}
          >
            <X className="size-3.5" aria-hidden />
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2 border-t border-line pt-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <p className="text-caption text-fg-muted">
          <span className="tabular text-fg-body">{totalVisiveis}</span> de{' '}
          <span className="tabular">{totalItens}</span> evento
          {totalItens === 1 ? '' : 's'}
          {ativo ? ' com este filtro' : ' na lista'}
          {' · '}
          {totalElegiveis === 0
            ? 'nenhum pode ser disparado em lote'
            : `${totalElegiveis} pode${totalElegiveis === 1 ? '' : 'm'} ir para a Meta`}
        </p>

        {rodando ? (
          <div className="flex w-full min-w-0 flex-col gap-1 md:w-auto md:min-w-56">
            <div className="flex items-center justify-between gap-3">
              <span className="text-caption text-fg-body tabular">
                Enviando {Math.min(lote.feitos + 1, lote.total)} de {lote.total} · {lote.ok} ok
                {lote.pulados > 0 ? ` · ${lote.pulados} pulado${lote.pulados === 1 ? '' : 's'}` : ''}
                {lote.erros.length > 0
                  ? ` · ${lote.erros.length} erro${lote.erros.length === 1 ? '' : 's'}`
                  : ''}
              </span>
              {/* "Parar" interrompe um disparo real: 40px no mínimo, sempre. */}
              <Button
                size="sm"
                variant="outline"
                className="min-h-control-md shrink-0 md:min-h-control-sm"
                onClick={onPararLote}
              >
                <Square className="size-3.5" aria-hidden />
                Parar
              </Button>
            </div>
            {/* Barra simples: o DS não tem componente de progresso, e inventar
                um aqui daria uma cor nova para o `check:contrast` conferir. */}
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={lote.total}
              aria-valuenow={lote.feitos}
              aria-label="Progresso do disparo em lote"
            >
              <div
                className="h-full bg-tinta transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex w-full min-w-0 flex-col gap-1 md:w-auto md:items-end">
            <Button
              size="sm"
              className="min-h-control-md w-full md:w-auto md:min-h-control-sm"
              onClick={onAbrirLote}
              disabled={totalElegiveis === 0}
            >
              <Send className="size-3.5" aria-hidden />
              Disparar {totalElegiveis > 0 ? `os ${totalElegiveis} ` : ''}filtrados
            </Button>
            {totalElegiveis === 0 && totalVisiveis > 0 && (
              <span className="text-caption text-fg-muted">
                Nenhum evento elegível neste recorte.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CampoFiltro({
  id,
  rotulo,
  children,
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
}) {
  // Largura total até 48rem (uma coluna, nada de campo espremido); a partir daí
  // `min-w-40 flex-1` deixa a barra se acomodar sozinha em duas ou três linhas
  // no tablet e numa só no desktop — sem grade de breakpoint.
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 md:w-auto md:min-w-40 md:flex-1">
      <label htmlFor={id} className="text-caption font-medium text-fg-muted">
        {rotulo}
      </label>
      {children}
    </div>
  );
}

function OpcaoSimples({
  valor,
  rotulo,
  ajuda,
}: {
  valor: string;
  rotulo: string;
  ajuda: string;
}) {
  return (
    <SelectItem value={valor}>
      <span className="flex min-w-0 flex-col">
        <span className="text-label font-medium text-fg-body">{rotulo}</span>
        <span className="text-caption text-fg-muted">{ajuda}</span>
      </span>
    </SelectItem>
  );
}
