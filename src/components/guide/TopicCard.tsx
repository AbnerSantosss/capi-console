'use client';

/**
 * Card de um topico do Guia.
 *
 * Fechado, mostra capa + tile + titulo + uma frase + contador. Aberto, mostra
 * "para que serve / quando usar / o que voce sai sabendo" e os itens, cada um
 * expansivel por conta propria.
 *
 * O estado de aberto e CONTROLADO pelo pai: o indice e a ancora da URL
 * precisam conseguir abrir um topico.
 */

import { ChevronDown, Lock, ShieldCheck, Webhook } from '@/components/ui/icones';

import { calcularEmq } from '@/lib/emq';
import { Callout } from '@/components/common/primitives';
import { cn } from '@/lib/utils';
import type { Topico } from './conteudo';
import { CLASSE_HUE } from './hue';
import { RichText } from './RichText';
import { StepDisclosure } from './StepDisclosure';
import styles from './guide.module.css';

/** Pesos e descricoes vem de src/lib/emq.ts — fonte unica. */
const PARAMETROS = calcularEmq({}).parametros;

export function TopicCard({
  topico,
  aberto,
  onToggle,
}: {
  topico: Topico;
  aberto: boolean;
  onToggle: (id: string) => void;
}) {
  const Icone = topico.icone;
  const idCorpo = `${topico.id}-corpo`;

  return (
    <section
      id={topico.id}
      aria-labelledby={`${topico.id}-titulo`}
      className={cn(styles.topic, CLASSE_HUE[topico.hue])}
    >
      {/* A capa: a tinta do assunto a 8% num retangulo de 72px. Antes cada
          topico tinha um desenho proprio (pontos, linhas que corriam sozinhas,
          trilha, grade, barras, listras), dissolvido no cartao por um fade. O
          desenho nunca dizia nada que o texto ao lado ja nao dissesse — e uma
          capa com forma reconhecivel e o que faz o produto parecer template. */}
      <div className={styles.cover} aria-hidden />

      <button
        type="button"
        className={styles.topicHead}
        aria-expanded={aberto}
        aria-controls={idCorpo}
        onClick={() => onToggle(topico.id)}
      >
        <span className={styles.tile} aria-hidden>
          <Icone size={26} weight="duotone" />
        </span>

        <span className="min-w-0 flex-1 pt-1">
          <span className="flex flex-wrap items-center gap-2">
            <span id={`${topico.id}-titulo`} className={styles.topicTitle}>
              {topico.titulo}
            </span>
            <span className={styles.counter}>{topico.contador}</span>
          </span>
          <span className={cn(styles.topicPhrase, 'block')}>{topico.frase}</span>
        </span>

        <span className={cn(styles.chevron, 'mt-1')} aria-hidden>
          <ChevronDown className="size-4" />
        </span>
      </button>

      {aberto && (
        <div id={idCorpo} className={styles.topicBody}>
          <dl className={styles.purpose}>
            <div className={styles.purposeRow}>
              <dt className={styles.purposeTerm}>Para que serve</dt>
              <dd className={styles.purposeDesc}>
                <RichText>{topico.paraQue}</RichText>
              </dd>
            </div>
            <div className={styles.purposeRow}>
              <dt className={styles.purposeTerm}>Quando usar</dt>
              <dd className={styles.purposeDesc}>
                <RichText>{topico.quandoUsar}</RichText>
              </dd>
            </div>
            <div className={styles.purposeRow}>
              <dt className={styles.purposeTerm}>Você sai sabendo</dt>
              <dd className={styles.purposeDesc}>
                <RichText>{topico.saiSabendo}</RichText>
              </dd>
            </div>
          </dl>

          {topico.itens.length > 0 && (
            <div className={styles.stepList}>
              {topico.itens.map((item, i) => (
                <StepDisclosure
                  key={item.id}
                  item={item}
                  numero={topico.numerado ? i + 1 : undefined}
                />
              ))}
            </div>
          )}

          {topico.extra === 'ordem-webhook' && (
            <Callout
              tone="warning"
              icon={Webhook}
              title="A ordem existe por um motivo"
              className="mt-4"
            >
              O passo 5 é a rede de segurança: enquanto o Código de teste da
              marca estiver preenchido, o disparo automático aparece no Testar
              eventos e <strong>não entra nas métricas reais</strong>. Só limpe
              o código depois de ver a compra chegando certa, com fbc e valor.
            </Callout>
          )}

          {topico.extra === 'tabela-emq' && <TabelaEmq />}

          {topico.extra === 'regra-de-ouro' && (
            <Callout
              tone="danger"
              icon={ShieldCheck}
              title="Regra de ouro do projeto"
              className="mt-4"
            >
              Só envie eventos que aconteceram de verdade. Conversão inventada
              estraga o aprendizado da campanha e viola os termos da Meta.
            </Callout>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function TabelaEmq() {
  return (
    <div className="overflow-x-auto">
      <table className={styles.emqTable}>
        <thead>
          <tr>
            <th scope="col">Parâmetro</th>
            <th scope="col">Peso</th>
            <th scope="col">Como obter</th>
          </tr>
        </thead>
        <tbody>
          {PARAMETROS.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="block text-label font-medium text-fg-body">
                  {p.nome}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 font-mono text-caption text-fg-muted">
                  {p.sigla}
                  {p.hash && (
                    <span className="inline-flex items-center gap-0.5 text-success">
                      <Lock className="size-2.5" aria-hidden />
                      SHA-256
                    </span>
                  )}
                </span>
              </td>
              <td className="text-label text-fg-body tabular">
                {p.peso.toFixed(1)}
                {p.critico && (
                  <span className="mt-0.5 block text-caption font-semibold text-warning uppercase">
                    crítico
                  </span>
                )}
              </td>
              <td className="text-caption text-fg-muted">{p.comoObter}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
