'use client';

import {
  ArrowUpRight,
  History,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from '@/components/ui/icones';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import { Field, Section, Callout, StatusDot } from '@/components/common/primitives';
import { cn } from '@/lib/utils';
import type { Destino, Entrega, EventoRelay } from './tipos';

/**
 * O Repasse (aba `retornos` de Regras): os endereços que recebem, depois de
 * cada envio, o que a Meta respondeu — e o histórico dessas entregas.
 *
 * V7 do v7: o painel saiu inteiro de `IntegrationsPage.tsx`, SEM mudar
 * comportamento. Este arquivo só desenha; toda gravação continua na página,
 * pelo `salvar()` de lá (o mesmo PUT de `/api/integracoes`, com `empresaId`,
 * que já tira as regras do corpo — C5/C6), e o "Testar" continua sendo o POST
 * de `/api/relay` da página, com o header `X-Empresa-Id`. Aqui não há
 * `fetch`/`pedir` nenhum: um segundo caminho de gravação dentro do painel era
 * exatamente o que C5 fechou.
 *
 * Os dois ritmos de gravação de antes ficam como estavam:
 *  - Ativo, "Enviar quando" e remover gravam na hora (`onGravar`/`onRemover`);
 *  - Nome e URL mudam na tela enquanto se digita (`onEditar`) e gravam ao sair
 *    do campo (`onGravarCampos`).
 */

const ROTULO_EVENTO: Record<EventoRelay, string> = {
  'dispatch.success': 'Envio aceito pela Meta',
  'dispatch.error': 'Envio recusado',
  'inbox.received': 'Webhook recebido',
};

export interface RepasseProps {
  /** Âncora da seção (`#repasse`, V2 do v7). */
  id?: string;
  destinos: Destino[];
  entregas: Entrega[];
  salvando: boolean;
  /** Id da seção do histórico — a página rola até ela quando o endereço traz `#historico`. */
  ancoraHistorico: string;
  onNovo: () => void;
  onTestar: (id: string) => void;
  /** Muda na tela, sem gravar (Nome e URL enquanto se digita). */
  onEditar: (id: string, mudanca: Partial<Destino>) => void;
  /** Muda e grava na hora (Ativo, "Enviar quando"). */
  onGravar: (id: string, mudanca: Partial<Destino>) => void;
  onRemover: (id: string) => void;
  /** Grava o que está na tela (ao sair de Nome ou URL). */
  onGravarCampos: () => void;
  onAtualizar: () => void;
}

export function Repasse({
  id,
  destinos,
  entregas,
  salvando,
  ancoraHistorico,
  onNovo,
  onTestar,
  onEditar,
  onGravar,
  onRemover,
  onGravarCampos,
  onAtualizar,
}: RepasseProps) {
  return (
    // "Historico" deixou de ser aba e virou secao daqui (§7.3.3): o log de
    // entregas e o resultado DESTE assunto, nao um assunto proprio. Nada foi
    // escondido — as duas secoes dividem o painel e o contador de entregas
    // continua a vista no cabecalho do Historico.
    <div id={id} className="flex min-w-0 scroll-mt-32 flex-col gap-5">
      <Section
        icon={ArrowUpRight}
        variant="card"
        title="Repasse para outros sistemas"
        description="Depois de cada envio, devolva ao n8n ou ao CRM o que a Meta respondeu."
        action={
          <Button size="sm" variant="outline" onClick={onNovo}>
            <Plus className="size-4" aria-hidden />
            Novo endereço
          </Button>
        }
      >
        {destinos.length === 0 ? (
          <EstadoVazio
            icone={ArrowUpRight}
            titulo="Nenhum endereço de repasse"
            motivo={
              <>
                Sem endereço, o resultado do envio fica só no arquivo{' '}
                <code className="font-mono">logs/disparos.md</code> — o n8n e o
                CRM nunca ficam sabendo se a Meta aceitou.
              </>
            }
            acao={
              <Button variant="outline" onClick={onNovo}>
                <Plus className="size-4" aria-hidden />
                Novo endereço
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {destinos.map((d) => (
              <li
                key={d.id}
                // FASE 3a: a lista vive dentro de uma `Section` variante
                // cartão (`surface-1`). Sobe para `surface-2` para ter o
                // degrau de 0.04 que o G3′ cobra, e larga a borda.
                className="rounded-panel bg-surface-2 p-4"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <Checkbox
                        checked={d.ativo}
                        onCheckedChange={(v) => onGravar(d.id, { ativo: Boolean(v) })}
                      />
                      <StatusDot tone={d.ativo ? 'success' : 'neutral'}>
                        {d.ativo ? 'Ativo' : 'Desativado'}
                      </StatusDot>
                    </label>

                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => onTestar(d.id)}>
                        <Send className="size-3.5" aria-hidden />
                        Testar
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remover o endereço ${d.nome}`}
                        onClick={() => onRemover(d.id)}
                      >
                        <Trash2 className="size-3.5 text-danger" aria-hidden />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <Field id={`nome-${d.id}`} label="Nome">
                      <Input
                        id={`nome-${d.id}`}
                        value={d.nome}
                        onChange={(e) => onEditar(d.id, { nome: e.target.value })}
                        onBlur={onGravarCampos}
                      />
                    </Field>
                    <Field
                      id={`url-${d.id}`}
                      label="URL"
                      helper="Recebe POST com corpo JSON. O endereço novo nasce sem URL: cole aqui o desta empresa."
                    >
                      <Input
                        id={`url-${d.id}`}
                        value={d.url}
                        placeholder="https://exemplo.com/webhook/…"
                        spellCheck={false}
                        onChange={(e) => onEditar(d.id, { url: e.target.value })}
                        onBlur={onGravarCampos}
                        className="wrap-token font-mono"
                      />
                    </Field>
                  </div>

                  <p className="text-caption text-fg-muted">
                    Nome e URL são salvos quando você sai do campo.
                  </p>

                  <fieldset>
                    <legend className="mb-2 text-label font-medium text-fg-body">
                      Enviar quando
                    </legend>
                    <div className="flex flex-wrap gap-4">
                      {(Object.keys(ROTULO_EVENTO) as EventoRelay[]).map((ev) => (
                        <label
                          key={ev}
                          className="flex cursor-pointer items-center gap-2 text-caption text-fg-body"
                        >
                          <Checkbox
                            checked={d.eventos.includes(ev)}
                            onCheckedChange={(v) =>
                              onGravar(d.id, {
                                eventos: v ? [...d.eventos, ev] : d.eventos.filter((x) => x !== ev),
                              })
                            }
                          />
                          {ROTULO_EVENTO[ev]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Callout tone="info" icon={KeyRound}>
          O token da Meta e o segredo de entrada nunca entram no corpo enviado.
          O retorno contém apenas os dados necessários para o sistema configurado.
        </Callout>
      </Section>

      <Section
        id={ancoraHistorico}
        icon={History}
        variant="card"
        title="Histórico do repasse"
        description="As últimas 50 tentativas de entrega ao n8n ou CRM."
        action={
          <div className="flex items-center gap-2">
            <Badge className="font-mono tabular">{entregas.length}</Badge>
            <Button size="sm" variant="ghost" onClick={onAtualizar} disabled={salvando}>
              <RefreshCw className="size-3.5" aria-hidden />
              Atualizar
            </Button>
          </div>
        }
      >
        {entregas.length === 0 ? (
          <EstadoVazio
            icone={History}
            titulo="Nenhuma entrega registrada"
            motivo="O histórico só ganha linhas depois do primeiro envio com um endereço ativo. Se já houve envio, o endereço pode estar desligado."
            acao={
              <Button variant="outline" onClick={onAtualizar} disabled={salvando}>
                <RefreshCw className="size-4" aria-hidden />
                Atualizar
              </Button>
            }
          />
        ) : (
          <div
            className="max-w-full overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Tabela do histórico do repasse"
          >
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {['Quando', 'Endereço', 'Evento', 'HTTP', 'Tempo', 'Tentativas'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="py-2 pr-4 text-caption font-semibold tracking-wide text-fg-muted uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entregas.map((e) => (
                  <tr key={e.id} className="border-b border-line">
                    <td className="py-2 pr-4 text-caption text-fg-muted tabular">
                      {new Date(e.em).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2 pr-4 text-caption text-fg-body">{e.destinoNome}</td>
                    <td className="py-2 pr-4 font-mono text-caption text-fg-muted">{e.evento}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={cn(
                          'font-mono text-caption font-semibold tabular',
                          e.ok ? 'text-success' : 'text-danger'
                        )}
                      >
                        {e.httpStatus || '—'}
                        <span className="ml-2 font-sans text-caption font-medium">
                          {e.ok ? 'Entregue' : 'Falhou'}
                        </span>
                      </span>
                      {e.erro && (
                        <span className="ml-2 text-caption text-fg-muted">{e.erro}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-caption text-fg-muted tabular">
                      {e.duracaoMs} ms
                    </td>
                    <td className="py-2 text-caption text-fg-muted tabular">{e.tentativas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

export default Repasse;
