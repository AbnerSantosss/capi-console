/**
 * Tipos e função compartilhados entre `TagDoSite.tsx` (aba Instalação) e o
 * bloco "Eventos extras" (`EventosExtras.tsx`).
 *
 * Tarefa 6 do plano v5 (§6.1/§6.2): o bloco de eventos extras precisa do
 * MESMO formato de tag gerada e do MESMO cálculo de "para onde o evento vai
 * de verdade" que `TagDoSite.tsx` já usava. Um import direto de um componente
 * para o outro criaria um ciclo — `TagDoSite` renderiza `EventosExtras`, que
 * precisaria importar de volta de `TagDoSite` — por isso os dois pontos vivem
 * aqui, num módulo que nenhum dos dois componentes precisa importar de volta.
 */
import type { EventoTag } from '@/lib/tag-eventos';
import type { RegraRoteamento } from '@/lib/config-store';

/** Uma tag gerada pelo servidor, nos dois formatos de instalação. */
export interface TagGerada {
  evento: EventoTag;
  gtm: string;
  site: string;
}

export type TomEstado = 'success' | 'warning' | 'neutral';

export interface EstadoRegra {
  texto: string;
  tom: TomEstado;
  explicacao: string;
}

/**
 * O que acontece de verdade com o evento depois que a tag o envia.
 *
 * Sem isto a tela mentiria por omissão: o operador instalaria a tag no site do
 * cliente, veria o evento chegar e acharia que a Meta já está recebendo —
 * quando na verdade a regra correspondente nasceu em fila ou em ignorar e nada
 * saiu daqui.
 */
export function estadoDaRegra(regras: RegraRoteamento[], origem: string): EstadoRegra {
  const regra = regras.find((r) => r.eventoOrigem === origem);
  if (!regra) {
    return {
      texto: 'Sem regra — não vai à Meta',
      tom: 'warning',
      explicacao:
        'Sem regra, o evento não entra na fila nem vai à Meta. O fbc e o fbp dele ajudam a venda do webhook a achar a campanha.',
    };
  }
  if (!regra.ativo) {
    return {
      texto: 'Regra desativada',
      tom: 'neutral',
      explicacao:
        'A regra existe mas está desligada: o evento chega, é registrado e não vai para a Meta.',
    };
  }
  if (regra.modo === 'auto') {
    return {
      texto: 'Ligada',
      tom: 'success',
      explicacao:
        'Assim que a tag envia, o evento vai sozinho para a Meta, sem revisão humana.',
    };
  }
  if (regra.modo === 'ignorar') {
    return {
      texto: 'Ignorada',
      tom: 'neutral',
      explicacao:
        'O evento chega e fica só no registro. Nunca vai para a Meta enquanto a regra estiver em Ignorar.',
    };
  }
  return {
    texto: 'Na fila',
    tom: 'warning',
    explicacao:
      'O evento fica na Fila esperando você revisar e enviar. Nada sai daqui sozinho.',
  };
}
