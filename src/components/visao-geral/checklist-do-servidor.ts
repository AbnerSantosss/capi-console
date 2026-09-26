import 'server-only';

/**
 * A leitura do checklist de uma empresa, NO SERVIDOR (V5 do plano v7).
 *
 * Quem chama: a Visão geral (`e/[slug]/page.tsx`) e a lista `/empresas`.
 *
 * Desvio 1 da V5: o plano citava `/api/health` e `/api/integracoes` no
 * navegador. A MESMA fonte é lida aqui, e ao cliente só desce o derivado
 * (os 6 passos com a frase de cada um, os sinais do fluxo, o envio automático
 * em palavra e o estado da empresa). Motivos:
 *  - a configuração crua da empresa traz o segredo do webhook;
 *  - os Pixels crus trazem o token (a fronteira de segredos do `check` proíbe o
 *    campo em `src/components`); aqui eles passam por `publicarMarca`, que devolve
 *    só o booleano `temToken`;
 *  - de cada entrada da caixa, só a origem, a hora, o status, os marcadores de
 *    teste e o que a Meta respondeu (nada de e-mail, telefone, hash ou payload).
 *
 * Uma leitura que falha nunca vira "não tem": Pixels ilegíveis viram o passo em
 * erro, e a configuração ilegível vira erro nos passos Domínio e Tag.
 */

import {
  ErroConfiguracaoIndisponivel,
  lerIntegracoes,
  listarMarcas,
  publicarMarca,
} from '@/lib/config-store';
import { listarEntradas } from '@/lib/inbox';
import {
  envioAutomaticoDaEmpresa,
  estadoDaEmpresa,
  montarChecklist,
  type ChecklistDaEmpresa,
  type DadosDoChecklist,
  type EntradaDoChecklist,
  type EnvioAutomatico,
  type EstadoDaEmpresa,
  type PixelDoChecklist,
} from '@/lib/checklist-empresa';

/** A mesma memória que o resumo do período lê (`AMOSTRA` da rota). */
const ENTRADAS_LIDAS = 1000;

export interface ChecklistLido {
  checklist: ChecklistDaEmpresa;
  estado: EstadoDaEmpresa;
  /** `null` quando os Pixels não puderam ser lidos: sem prova para dizer ligado nem desligado. */
  envio: EnvioAutomatico | null;
}

async function lerPixels(empresaId: string): Promise<PixelDoChecklist[] | null> {
  try {
    const marcas = await listarMarcas(empresaId);
    return marcas.map((m) => {
      const p = publicarMarca(m);
      return { id: p.id, pixelId: p.pixelId, temToken: p.temToken, autoDisparo: p.autoDisparo };
    });
  } catch (erro) {
    if (erro instanceof ErroConfiguracaoIndisponivel) return null;
    throw erro;
  }
}

async function lerConfiguracao(empresaId: string): Promise<DadosDoChecklist['integracoes']> {
  try {
    const integracoes = await lerIntegracoes(empresaId);
    return {
      dominios: (integracoes.tag?.dominios ?? []).map((d) => ({
        host: d.host,
        subdominio: d.subdominio,
        ultimoHit: d.ultimoHit,
      })),
      regras: (integracoes.regras ?? []).map((r) => ({ modo: r.modo, ativo: r.ativo, marcas: r.marcas })),
    };
  } catch (erro) {
    if (erro instanceof ErroConfiguracaoIndisponivel) return null;
    throw erro;
  }
}

async function lerEntradas(empresaId: string): Promise<EntradaDoChecklist[]> {
  const itens = await listarEntradas(ENTRADAS_LIDAS, empresaId);
  return itens.map((i) => ({
    origem: i.origem,
    recebidoEm: i.recebidoEm,
    status: i.status,
    testeInterno: i.testeInterno,
    testePlataforma: i.testePlataforma,
    resultados: i.resultados,
  }));
}

/** Lê as três fontes da empresa e devolve só o que o navegador pode ver. */
export async function lerChecklistDaEmpresa(empresa: { id: string; slug: string }): Promise<ChecklistLido> {
  const [pixels, integracoes, entradas] = await Promise.all([
    lerPixels(empresa.id),
    lerConfiguracao(empresa.id),
    lerEntradas(empresa.id),
  ]);
  const checklist = montarChecklist({ empresa: { slug: empresa.slug }, pixels, integracoes, entradas });
  return {
    checklist,
    estado: estadoDaEmpresa(checklist),
    envio: pixels === null ? null : envioAutomaticoDaEmpresa(pixels, integracoes?.regras ?? null),
  };
}
