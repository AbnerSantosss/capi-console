'use client';

/**
 * "Exportar" da Visão geral (spec :22): baixa um CSV com o que JÁ está na
 * tela, gerado no navegador. Não pede nada ao servidor e não lê nenhum dado a
 * mais: a planilha sai de `csvDaVisaoGeral`, que copia campo a campo só o que
 * os blocos mostram (KPIs, Funil, Qualidade e as linhas de "Últimas
 * conversões").
 *
 * Fica desligado enquanto o período carrega, quando o período não tem evento
 * (base 0: nada a exportar) e quando as últimas conversões não vieram (a
 * planilha sairia com um bloco faltando sem dizer).
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ResumoInbox } from '@/lib/inbox-resumo';
import { csvDaVisaoGeral, nomeDoCsv, type LinhaDeConversao } from '@/lib/visao-geral-calculos';

export function ExportarCsv({
  empresa,
  resumo,
  linhas,
  carregando,
}: {
  empresa: { nome: string; slug: string };
  /** `null` enquanto o resumo não veio (ou quando não veio). */
  resumo: ResumoInbox | null;
  /** `null` enquanto as últimas conversões não vieram (ou quando não vieram). */
  linhas: readonly LinhaDeConversao[] | null;
  carregando: boolean;
}) {
  const [falhou, setFalhou] = useState(false);

  const semDado = resumo !== null && resumo.base === 0;
  const desligado = carregando || resumo === null || linhas === null || semDado;
  const motivo = carregando
    ? 'Espere o período carregar'
    : resumo === null
      ? 'Os números do período não vieram'
      : semDado
        ? 'Nenhum evento no período: nada para baixar'
        : linhas === null
          ? 'As últimas conversões não vieram'
          : 'Baixar os números desta tela em CSV (abre no Excel)';

  function baixar() {
    if (desligado || !resumo || !linhas) return;
    setFalhou(false);
    try {
      const texto = csvDaVisaoGeral({ empresa, resumo, linhas });
      const arquivo = new Blob([texto], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(arquivo);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeDoCsv(empresa.slug, resumo.janela);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // O navegador já copiou o arquivo ao clicar; o endereço temporário pode ir embora.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setFalhou(true);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={baixar} disabled={desligado} title={motivo}>
        Exportar
      </Button>
      {falhou ? (
        <p role="alert" className="text-caption text-danger">
          O navegador não deixou baixar o arquivo. Tente de novo.
        </p>
      ) : null}
    </div>
  );
}
