'use client';

/**
 * "Onde colar o código" — o passo que faltava entre gerar a tag e ela existir
 * no site do cliente.
 *
 * Até a FASE A o console entregava o código e parava ali. Quem instalava era
 * outra pessoa, quase sempre por WhatsApp, quase sempre sem saber se o site
 * usava Google Tag Manager ou HTML direto — e o erro mais caro não era colar no
 * lugar errado: era colar nos DOIS, e a Meta passar a contar cada visita duas
 * vezes. Um PageView duplicado não aparece como erro em lugar nenhum; aparece
 * semanas depois, como um custo por resultado que parece bom demais.
 *
 * Por isso os dois caminhos aparecem lado a lado, numerados, com o aviso de
 * escolher UM no meio — e não como um parágrafo de ajuda no rodapé.
 *
 * Tarefa 5 do plano v5 (6.3): a lista de passos virou clicável. O texto
 * continua todo visível na página — nada foi escondido atrás do modal —
 * porque o conteúdo já era curto; clicar no selo numerado (ou na linha do
 * passo) só abre o MESMO conteúdo com mais espaço, via `ModalDeEtapa`.
 *
 * Tarefa 6 do plano v5 (6.2 item 3): esta é a peça que virou "GERAR A TAG" no
 * topo da tela. O gerador de código continua NÃO importado aqui — as tags
 * chegam prontas por prop, vindas de `/api/tag/gerar` via `TagDoSite` — mas
 * agora, escolhido o caminho, o código do evento padrão (PageView) aparece
 * pronto para copiar, com o de ViewContent logo abaixo (os dois disparam
 * sozinhos e por isso não entram no bloco "Eventos extras").
 */

import React, { useState } from 'react';
import { AlertTriangle, Check, Code2, Container, Copy } from '@/components/ui/icones';

import { Callout, Field, Panel, StatusDot } from '@/components/common/primitives';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ModalDeEtapa } from '@/components/instalacao/ModalDeEtapa';
import { SeloDeEtapa, resumoDeEtapa } from '@/components/instalacao/SeloDeEtapa';
import type { RegraRoteamento } from '@/lib/config-store';
import { estadoDaRegra, type TagGerada } from './tag-estado';

/** Um caminho de instalação, com os passos na ordem em que se faz. */
interface Caminho {
  id: string;
  titulo: string;
  quando: string;
  icone: typeof Code2;
  passos: React.ReactNode[];
}

const CAMINHOS: Caminho[] = [
  {
    id: 'gtm',
    titulo: 'Google Tag Manager',
    quando:
      'Use este caminho se o site do cliente já tem o GTM instalado. É o mais comum em site feito por agência, e não exige tocar no código do site.',
    icone: Container,
    passos: [
      <>
        Abra o container do cliente em <strong>tagmanager.google.com</strong> e
        vá em <strong>Tags → Nova</strong>.
      </>,
      <>
        Em <strong>Configuração da tag</strong> escolha{' '}
        <strong>HTML personalizado</strong>.
      </>,
      <>
        Copie o código do evento abaixo na versão <strong>Para o GTM</strong> e
        cole na caixa de HTML. Não marque{' '}
        <em>Suportar document.write</em>.
      </>,
      <>
        Em <strong>Acionamento</strong> use o gatilho descrito no cabeçalho do
        próprio código — para a visita é <strong>All Pages</strong>; para os
        demais eventos é o gatilho de clique ou de envio de formulário indicado
        ali.
      </>,
      <>
        Salve, clique em <strong>Visualizar</strong> e abra o site: o modo de
        depuração precisa mostrar a tag como <em>acionada</em>.
      </>,
      <>
        Só então clique em <strong>Enviar</strong> para publicar a versão. Tag
        salva e não publicada não coleta nada.
      </>,
    ],
  },
  {
    id: 'site',
    titulo: 'Direto no código do site',
    quando:
      'Use quando não há GTM, ou quando você tem acesso ao HTML (WordPress com plugin de cabeçalho, tema próprio, landing page).',
    icone: Code2,
    passos: [
      <>
        Copie o código do evento abaixo na versão{' '}
        <strong>Para colar no site</strong>.
      </>,
      <>
        Cole o bloco inteiro <strong>imediatamente antes de</strong>{' '}
        <code className="font-mono">&lt;/head&gt;</code>, em{' '}
        <strong>todas</strong> as páginas — inclusive a de obrigado.
      </>,
      <>
        No WordPress, o lugar é o campo de cabeçalho do tema ou um plugin do
        tipo <em>Insert Headers and Footers</em>. Nunca dentro de um post.
      </>,
      <>
        Publique e abra o site com o console do navegador aberto: não pode haver
        erro em vermelho vindo do endereço do coletor.
      </>,
      <>
        Confira em <strong>Eventos → Fila</strong> que o evento chegou. Se não
        chegou, o domínio provavelmente não está na lista de sites permitidos,
        mais abaixo nesta página.
      </>,
    ],
  },
];

/** Qual passo, de qual caminho, está aberto no `ModalDeEtapa`. */
interface EtapaAberta {
  caminhoId: string;
  indice: number;
}

/** O id do caminho é literalmente o nome do formato de tag — só o GTM difere. */
function formatoDoCaminho(caminhoId: string): 'gtm' | 'site' {
  return caminhoId === 'gtm' ? 'gtm' : 'site';
}

export interface OndeInstalarTagProps {
  /**
   * Tags já geradas pelo servidor para o domínio escolhido. Vazio antes de
   * cadastrar um domínio, ou enquanto a chamada a `/api/tag/gerar` está em
   * voo — `TagDoSite` mostra o estado de carregamento e de erro logo acima
   * desta peça, então aqui só resta tratar "ainda não há nada".
   */
  tags: TagGerada[];
  /**
   * Regras de roteamento, para dizer ao lado de cada código o que acontece com
   * o evento depois que a tag o envia. Sem isso o operador cola o PageView,
   * vê o evento chegar e acha que a Meta já recebe — com a regra em fila.
   */
  regras: RegraRoteamento[];
  /**
   * true quando há pelo menos um domínio cadastrado. Com domínio e sem tags,
   * a geração está em voo ou falhou (`TagDoSite` mostra qual, logo acima);
   * pedir para cadastrar um domínio aí mandaria o operador fazer o que já fez.
   */
  temDominio: boolean;
  copiar: (texto: string, chave: string) => void | Promise<void>;
  copiado: string | null;
}

/** Frase de uso do código mais o destino real do evento, lado a lado. */
function ajudaComDestino(frase: string, regras: RegraRoteamento[], origem: string) {
  const estado = estadoDaRegra(regras, origem);
  return (
    <>
      {frase}
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusDot tone={estado.tom}>{estado.texto}</StatusDot>
        <span>{estado.explicacao}</span>
      </span>
    </>
  );
}

export function OndeInstalarTag({
  tags,
  regras,
  temDominio,
  copiar,
  copiado,
}: OndeInstalarTagProps) {
  const [etapaAberta, setEtapaAberta] = useState<EtapaAberta | null>(null);

  const pageview = tags.find((t) => t.evento.origem === 'tag.pageview');
  const viewcontent = tags.find((t) => t.evento.origem === 'tag.viewcontent');

  const abrirEtapa = (caminhoId: string, indice: number) =>
    setEtapaAberta({ caminhoId, indice });
  const fecharEtapa = () => setEtapaAberta(null);

  const caminhoAberto = etapaAberta
    ? CAMINHOS.find((c) => c.id === etapaAberta.caminhoId)
    : undefined;
  const passoAberto =
    caminhoAberto && etapaAberta
      ? caminhoAberto.passos[etapaAberta.indice]
      : undefined;

  return (
    <Panel title="Gerar a tag" icon={Container}>
      <p className="text-caption text-fg-muted">
        São dois caminhos para o mesmo resultado. Escolha{' '}
        <strong className="text-fg-body">um</strong> por evento e siga os passos
        na ordem.
      </p>

      <Callout
        tone="danger"
        icon={AlertTriangle}
        title="Nunca instale pelos dois caminhos ao mesmo tempo"
        className="mt-3"
      >
        O mesmo evento pelo GTM e colado no site vira{' '}
        <strong>duas conversões</strong> para a Meta, sem nenhum erro visível. O
        relatório fica bonito, a campanha aprende errado e o gasto vai para o
        público errado. Se estiver em dúvida se o site já tem a tag, procure
        pelo endereço do coletor no código-fonte da página antes de colar de
        novo.
      </Callout>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {CAMINHOS.map((caminho) => {
          const Icone = caminho.icone;
          return (
            // FASE 3a: os dois caminhos estão DENTRO de um `Panel`, que é
            // `surface-1`. Em `surface-1` eles não teriam degrau nenhum contra
            // o cartão que os contém; em `surface-2` ficam 0.053 de L acima
            // dele, que é o que o G3′ pede — e aí a borda some, porque a luz
            // já faz o trabalho dela.
            <section
              key={caminho.id}
              aria-labelledby={`instalar-${caminho.id}`}
              className="flex min-w-0 flex-col rounded-panel bg-surface-2 p-4"
            >
              <h4
                id={`instalar-${caminho.id}`}
                className="flex items-center gap-2 text-label font-semibold text-fg-strong"
              >
                <Icone
                  aria-hidden
                  className="size-5 shrink-0 text-tinta"
                />
                {caminho.titulo}
              </h4>

              <p className="mt-2 text-caption text-fg-muted">{caminho.quando}</p>

              <ol className="mt-3 flex flex-col gap-2.5">
                {caminho.passos.map((passo, indice) => (
                  <li
                    // Índice como chave é seguro aqui e só aqui: a lista é
                    // estática e a ORDEM é a identidade do passo — nada é
                    // inserido, removido nem reordenado em tempo de execução.
                    key={indice}
                    // A linha inteira é clicável para o mouse (conveniência,
                    // não o contrato de acessibilidade — quem carrega isso é
                    // o `SeloDeEtapa` abaixo, o único controle focável da
                    // linha). Nada do texto foi escondido: o clique só abre
                    // o MESMO conteúdo no `ModalDeEtapa`, com mais espaço.
                    onClick={() => abrirEtapa(caminho.id, indice)}
                    className="-mx-1.5 flex min-w-0 cursor-pointer gap-2.5 rounded-md px-1.5 py-1 text-caption text-fg-body transition-colors hover:bg-surface-3"
                  >
                    <SeloDeEtapa
                      numero={indice + 1}
                      titulo={resumoDeEtapa(passo)}
                      className="mt-px"
                      onClick={(evento) => {
                        evento.stopPropagation();
                        abrirEtapa(caminho.id, indice);
                      }}
                    />
                    <span className="min-w-0">{passo}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                {tags.length === 0 ? (
                  <p className="text-body text-fg-body">
                    {temDominio
                      ? 'O código aparece aqui assim que as tags forem geradas.'
                      : 'Cadastre um domínio na lista abaixo para o código aparecer aqui — a tag carrega o endereço do coletor e a chave do domínio dentro dela.'}
                  </p>
                ) : (
                  <>
                    {pageview && (
                      <Field
                        id={`codigo-pageview-${caminho.id}`}
                        label="Código pronto — Visita à página (PageView)"
                        helper={ajudaComDestino(
                          'Sai sozinho assim que a página abre. É o primeiro evento a colar.',
                          regras,
                          pageview.evento.origem
                        )}
                        action={
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              copiar(pageview[formatoDoCaminho(caminho.id)], `pv-${caminho.id}`)
                            }
                          >
                            {copiado === `pv-${caminho.id}` ? (
                              <Check className="size-3.5 text-success" aria-hidden />
                            ) : (
                              <Copy className="size-3.5" aria-hidden />
                            )}
                            Copiar
                          </Button>
                        }
                      >
                        <Textarea
                          id={`codigo-pageview-${caminho.id}`}
                          readOnly
                          spellCheck={false}
                          rows={10}
                          value={pageview[formatoDoCaminho(caminho.id)]}
                          aria-label={`Código do PageView — ${caminho.titulo}`}
                          className="wrap-token font-mono text-caption"
                        />
                      </Field>
                    )}

                    {viewcontent && (
                      <Field
                        id={`codigo-viewcontent-${caminho.id}`}
                        label="Código pronto — Visualização de página (ViewContent)"
                        helper={ajudaComDestino(
                          'Também sai sozinho: alguns segundos depois, ou quando o visitante rola a página.',
                          regras,
                          viewcontent.evento.origem
                        )}
                        action={
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              copiar(
                                viewcontent[formatoDoCaminho(caminho.id)],
                                `vc-${caminho.id}`
                              )
                            }
                          >
                            {copiado === `vc-${caminho.id}` ? (
                              <Check className="size-3.5 text-success" aria-hidden />
                            ) : (
                              <Copy className="size-3.5" aria-hidden />
                            )}
                            Copiar
                          </Button>
                        }
                      >
                        <Textarea
                          id={`codigo-viewcontent-${caminho.id}`}
                          readOnly
                          spellCheck={false}
                          rows={10}
                          value={viewcontent[formatoDoCaminho(caminho.id)]}
                          aria-label={`Código do ViewContent — ${caminho.titulo}`}
                          className="wrap-token font-mono text-caption"
                        />
                      </Field>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <ModalDeEtapa
        numero={etapaAberta ? etapaAberta.indice + 1 : 1}
        titulo={caminhoAberto?.titulo ?? ''}
        aberto={etapaAberta !== null}
        aoFechar={fecharEtapa}
      >
        {passoAberto}
      </ModalDeEtapa>
    </Panel>
  );
}

export default OndeInstalarTag;
