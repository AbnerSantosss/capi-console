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
 */

import React from 'react';
import { AlertTriangle, Code2, Container } from 'lucide-react';

import { Callout, Panel } from '@/components/common/primitives';

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
        depuração precisa mostrar a tag como <em>disparada</em>.
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
        Confira na <strong>caixa de entrada</strong> do disparo automático que o
        evento chegou. Se não chegou, o domínio provavelmente não está na lista
        autorizada acima.
      </>,
    ],
  },
];

export function OndeInstalarTag() {
  return (
    <Panel title="Onde colar o código" icon={Container}>
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
            <section
              key={caminho.id}
              aria-labelledby={`instalar-${caminho.id}`}
              className="flex min-w-0 flex-col rounded-panel border border-line-strong bg-surface-1 p-4"
            >
              <h4
                id={`instalar-${caminho.id}`}
                className="flex items-center gap-2 text-label font-semibold text-fg-strong"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-control border border-accent-text/20 bg-accent-text/8 text-accent-text">
                  <Icone className="size-4" strokeWidth={1.75} aria-hidden />
                </span>
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
                    className="flex min-w-0 gap-2.5 text-caption text-fg-body"
                  >
                    <span
                      aria-hidden
                      className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border border-line-control bg-surface-2 font-mono text-caption font-semibold tabular text-fg-muted"
                    >
                      {indice + 1}
                    </span>
                    <span className="min-w-0">{passo}</span>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}

export default OndeInstalarTag;
