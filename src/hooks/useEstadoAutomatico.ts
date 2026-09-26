'use client';

/**
 * Estado do disparo automatico, em um lugar so.
 *
 * O menu e o Guia precisam responder a mesma pergunta — "o automatico esta
 * ligado?" — e nunca podem discordar da aba Regras. Por isso a leitura fica
 * num store compartilhado: quem montar primeiro busca, os outros reaproveitam.
 *
 * So LE (GET /api/integracoes). Nao salva regra, nao dispara nada.
 *
 * 🔴 T3 (C6) — a leitura NAO e mais "uma por sessao". Duas saidas do cache:
 *
 *  - `recarregar()` le de novo, ignorando o cache. A confirmacao de ligar o
 *    automatico (/pixels) chama ao abrir: a frase "Hoje nenhuma regra esta no
 *    modo automatico, entao nada sera enviado ainda" nao pode sair de uma
 *    leitura feita antes de o operador criar uma regra em Automatico — e o
 *    clique que liga o envio de conversao real sem revisao;
 *  - trocar de empresa zera as regras e rele, ja com o `X-Empresa-Id` da
 *    empresa nova (ver `aoTrocarDeEmpresa`). Antes, as regras da empresa
 *    anterior ficavam aqui e contavam para os Pixels da nova — no selo do
 *    cabecalho, nos cartoes de /pixels e na confirmacao de ligar.
 */

import { useEffect } from 'react';
import { create } from 'zustand';

import { pedir } from '@/lib/cliente-api';
import { useBrandStore } from '@/stores/useBrandStore';
import { useEmpresaStore } from '@/stores/useEmpresaStore';
import type { Integracoes, RegraRoteamento } from '@/lib/config-store';

interface EstadoAuto {
  /**
   * As regras de roteamento inteiras. `null` significa NAO SEI — leitura ainda
   * nao feita, ou feita e falhada. `null` nunca deve virar `[]`: quem conta
   * regras para dizer um numero ao usuario (PX-11, estado 🟡 de 8.2.3) precisa
   * saber a diferenca entre "zero regras" e "nao consegui ler".
   */
  regras: RegraRoteamento[] | null;
  regrasAuto: number;
  carregado: boolean;
  carregando: boolean;
  /** Le uma vez; depois devolve o cache. Com leitura em voo, espera por ela. */
  carregar: () => Promise<void>;
  /**
   * Le de novo, ignorando o cache (T3, C6). Com leitura em voo, espera por
   * ela em vez de abrir outra. Nunca rejeita: falha vira `regras = null`.
   */
  recarregar: () => Promise<void>;
}

/**
 * A leitura em voo. Quem chama `carregar()` ou `recarregar()` enquanto ela nao
 * volta recebe ESTA promessa, e nao uma que resolve na hora: quem faz
 * `await recarregar()` precisa saber que, quando ela resolve, o store ja tem a
 * resposta. Sair cedo (como o antigo `if (carregando) return`) faria a
 * confirmacao de ligar parar de "conferir" com a lista velha ainda na tela.
 */
let emVoo: Promise<void> | null = null;

/**
 * Sobe a cada troca de empresa. Leitura que saiu numa geracao anterior e da
 * empresa anterior: a resposta dela e jogada fora e ela nao mexe no
 * `carregando` da leitura nova. Sem isto, a resposta da empresa A que chega
 * depois da troca poria as regras de A sob os Pixels de B.
 */
let geracao = 0;

const useStore = create<EstadoAuto>()((set, get) => {
  const ler = (): Promise<void> => {
    const minha = geracao;
    set({ carregando: true });
    const leitura = (async () => {
      try {
        const dados = await pedir<{ integracoes: Integracoes }>('/api/integracoes', {
          cache: 'no-store',
        });
        if (minha !== geracao) return;
        const regras = dados.integracoes?.regras ?? [];
        set({
          regras,
          regrasAuto: regras.filter((r) => r.ativo && r.modo === 'auto').length,
          carregado: true,
        });
      } catch {
        if (minha !== geracao) return;
        // 401 ja redireciona no cliente-api; outro erro nao pode derrubar o menu.
        // `regras` vai para null de proposito — "nao sei" —, e nao fica com a
        // lista da leitura anterior: depois de um `recarregar()`, a lista velha
        // faria a confirmacao de ligar afirmar com dado velho, que e o T3.
        // `regrasAuto` fica com o ultimo numero lido: o selo do cabecalho nao
        // pisca a cada falha de rede.
        set({ regras: null, carregado: true });
      } finally {
        if (minha === geracao) {
          emVoo = null;
          set({ carregando: false });
        }
      }
    })();
    emVoo = leitura;
    return leitura;
  };

  return {
    regras: null,
    regrasAuto: 0,
    carregado: false,
    carregando: false,
    carregar: () => {
      if (emVoo) return emVoo;
      if (get().carregado) return Promise.resolve();
      return ler();
    },
    // `carregado` NAO volta a falso aqui: o selo do cabecalho segue com o
    // ultimo numero enquanto a releitura vem, em vez de piscar "—". Quem
    // precisa saber que esta conferindo (a confirmacao de ligar) marca isso
    // no proprio clique que chama `recarregar()`.
    recarregar: () => emVoo ?? ler(),
  };
});

/**
 * 🔴 T3 (C6) — trocar de empresa invalida as regras.
 *
 * As regras sao por empresa (`integracoes.<id>.json`). A troca zera tudo NA
 * HORA — `regras: null` ("nao sei") e `carregado: false`, para o selo do
 * cabecalho voltar a "—" em vez de mostrar o numero da empresa anterior — e
 * rele. A leitura nova ja sai com o `X-Empresa-Id` da empresa nova, porque
 * `pedir()` le a escolha do store no momento do pedido, e este ouvinte roda
 * depois de o store de empresa ja ter trocado.
 *
 * Uma leitura em voo da empresa anterior e abandonada, nao esperada: a
 * `geracao` nova faz a resposta dela ser jogada fora.
 */
function aoTrocarDeEmpresa(): void {
  geracao += 1;
  emVoo = null;
  useStore.setState({ regras: null, regrasAuto: 0, carregado: false, carregando: false });
  void useStore.getState().carregar();
}

if (typeof window !== 'undefined') {
  // So no navegador: no servidor nao ha troca de empresa, e o `pedir()` de uma
  // releitura nao teria para onde ir. Uma inscricao so por janela, mesmo com o
  // modulo reavaliado pelo HMR (o mesmo cuidado de `useEmpresaStore`).
  const janela = window as Window & { __capiDesligarRegrasPorEmpresa?: () => void };
  janela.__capiDesligarRegrasPorEmpresa?.();
  janela.__capiDesligarRegrasPorEmpresa = useEmpresaStore.subscribe((estado, anterior) => {
    if (estado.empresaAtivaId !== anterior.empresaAtivaId) aoTrocarDeEmpresa();
  });
}

/**
 * As regras de roteamento. Lidas uma vez e reaproveitadas por todas as telas;
 * relidas quando a empresa muda e quando alguem chama `recarregar()` (T3, C6).
 *
 * 🔴 Existe porque a premissa de `08` §8.4 estava errada: o blueprint dizia que
 * a contagem de regras `auto` por Pixel "ja esta disponivel no cliente". Nao
 * estava — este store reduzia tudo a um unico numero GLOBAL (`regrasAuto`) e o
 * array nunca saia daqui. Sem isto, /pixels precisava fazer um SEGUNDO
 * GET /api/integracoes, alem do que o cabecalho ja faz em toda pagina.
 *
 * So LE. Quem salva regra e a aba Regras, por outro caminho.
 */
export function useRegrasDeRoteamento(): RegraRoteamento[] | null {
  const regras = useStore((s) => s.regras);
  const carregar = useStore((s) => s.carregar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return regras;
}

/**
 * Rele as regras ignorando o cache (T3, C6).
 *
 * Para quem vai AFIRMAR algo com base nas regras num clique que tem
 * consequencia — hoje, a confirmacao de ligar o automatico em /pixels. A
 * promessa resolve quando o store ja tem a resposta (ou `null`, se a leitura
 * falhou); nunca rejeita. Com uma leitura em voo, espera por ela.
 */
export function useRecarregarRegras(): () => Promise<void> {
  return useStore((s) => s.recarregar);
}

/**
 * O mesmo store, fora do React. Componente usa os hooks acima; isto existe
 * para o teste `scripts/estado-automatico.test.mjs` provar o cache, a
 * releitura e a troca de empresa sem montar tela. So LE, como o resto.
 */
export const regrasDeRoteamento = {
  agora: () => {
    const { regras, regrasAuto, carregado, carregando } = useStore.getState();
    return { regras, regrasAuto, carregado, carregando };
  },
  carregar: (): Promise<void> => useStore.getState().carregar(),
  recarregar: (): Promise<void> => useStore.getState().recarregar(),
};

export type SituacaoAuto = 'carregando' | 'desligado' | 'teste' | 'producao';

export interface EstadoAutomatico {
  regrasAuto: number;
  /** A marca ativa esta com codigo de teste preenchido. */
  emTeste: boolean;
  carregado: boolean;
  situacao: SituacaoAuto;
  /** Rotulo curto para selo. Ex.: "Desligado", "2 em produção". */
  rotulo: string;
}

export function useEstadoAutomatico(): EstadoAutomatico {
  const regrasAuto = useStore((s) => s.regrasAuto);
  const carregado = useStore((s) => s.carregado);
  const carregar = useStore((s) => s.carregar);

  const marcas = useBrandStore((s) => s.marcas);
  const marcaAtivaId = useBrandStore((s) => s.marcaAtivaId);
  const marcasCarregadas = useBrandStore((s) => s.carregado);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ativa = marcas.find((m) => m.id === marcaAtivaId) ?? marcas[0];
  const emTeste = Boolean(ativa?.testCode?.trim());

  let situacao: SituacaoAuto = 'carregando';
  let rotulo = '—';

  if (carregado && marcasCarregadas) {
    if (regrasAuto === 0) {
      situacao = 'desligado';
      rotulo = 'Desligado';
    } else if (emTeste) {
      situacao = 'teste';
      rotulo = `${regrasAuto} em teste`;
    } else {
      situacao = 'producao';
      rotulo = `${regrasAuto} em produção`;
    }
  }

  return { regrasAuto, emTeste, carregado: carregado && marcasCarregadas, situacao, rotulo };
}
