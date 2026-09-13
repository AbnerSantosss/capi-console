import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { pedir } from '@/lib/cliente-api';
import { useBrandStore } from '@/stores/useBrandStore';

/**
 * Empresas no cliente (FASE D do plano `wiki/plano-multi-empresa-instalacao.md`).
 *
 * Molde: `useBrandStore`. A lista SEMPRE vem do servidor; do navegador só sai a
 * ESCOLHA — qual empresa o operador está olhando agora. Duas diferenças em
 * relação ao store de Pixels, e as duas são de propósito:
 *
 *  - a escolha é espelhada num cookie (`capi_empresa`), porque página de
 *    servidor (RSC) não enxerga `localStorage` e não recebe header de
 *    aplicação. Sem o espelho, a tela diria "Empresa B" e o HTML renderizado
 *    pelo servidor viria com os dados da empresa padrão;
 *  - trocar de empresa RECARREGA os Pixels, porque a lista de Pixels é por
 *    empresa. Mostrar o Pixel do cliente A sob o nome do cliente B é o começo
 *    de uma conversão enviada para o Pixel errado, e isso não volta atrás.
 *
 * 🔴 D-19 — **nada de credencial passa por aqui.** Pixel ID, token de acesso e
 * código de teste continuam indo por `PUT /api/marcas` (`useBrandStore`). A
 * rota `/api/empresas` recusa esses campos com 400 explícito; este store nunca
 * os monta.
 */

/**
 * CÓPIA da `EmpresaPublica` de `src/lib/empresas.ts`.
 *
 * 🔴 Não dá para importar de lá: aquele arquivo abre com `import 'server-only'`
 * e este store roda no navegador — a mesma razão da cópia de `MarcaPublica` em
 * `useBrandStore.ts`. A cópia é obrigatória; o que não é obrigatório é ela
 * divergir. Ao mexer na forma publicada por `publicarEmpresa()`, mexa TAMBÉM
 * aqui: o `tsc` não liga os dois lados, então um campo esquecido não quebra a
 * compilação — ele só some da tela, em silêncio.
 */
export interface EmpresaPublica {
  id: string;
  nome: string;
  slug: string;
  plataforma?: string;
  logoDataUrl?: string;
  logoUrl?: string;
  cor?: string;
  criadoEm: string;
}

/** O que o diálogo de empresa devolve. Ausência de `id` significa empresa nova. */
export interface EntradaDeEmpresa {
  /** Ausente em empresa nova: quem gera o id é o servidor (`novoIdEmpresa()`). */
  id?: string;
  nome: string;
  slug?: string;
  plataforma?: string;
  logoDataUrl?: string;
  logoUrl?: string;
  cor?: string;
}

interface EmpresaState {
  empresas: EmpresaPublica[];
  empresaAtivaId: string;
  carregando: boolean;
  carregado: boolean;
  /** Mensagem da última falha de leitura. Null quando a lista está boa. */
  erro: string | null;

  carregar: () => Promise<void>;
  setEmpresaAtiva: (id: string) => Promise<void>;
  salvarEmpresa: (dados: EntradaDeEmpresa) => Promise<EmpresaPublica>;
  removerEmpresa: (id: string) => Promise<void>;
  ativa: () => EmpresaPublica | undefined;
}

/** Nome da chave do `persist` no `localStorage`. */
export const CHAVE_EMPRESA_ATIVA = 'capi_empresa_ativa_v1';

/**
 * Cookie que o servidor lê (`COOKIE_EMPRESA` de `src/lib/empresa-ativa.ts`).
 *
 * Repetido aqui em vez de importado pelo mesmo motivo da cópia do tipo:
 * `empresa-ativa.ts` é `server-only`. As duas pontas têm que concordar no nome
 * — se divergirem, o cookie é escrito num nome que ninguém lê e a RSC volta
 * silenciosamente para a empresa padrão.
 */
export const COOKIE_EMPRESA = 'capi_empresa';

/**
 * A empresa que sempre existe. Cópia de `EMPRESA_DEFAULT_ID` (`empresas.ts`).
 *
 * É para ela que se cai quando a escolha guardada não está mais na lista — e
 * não para a primeira da lista, como faz o `useBrandStore`. É a regra D-4, que
 * o servidor já aplica em `resolverEmpresaId()`: empresa apagada volta para a
 * padrão. Se as duas pontas discordassem, a tela mostraria uma empresa e o
 * header `X-Empresa-Id` pediria outra.
 */
const EMPRESA_DEFAULT = 'default';

/** 1 ano. Mesmo valor de `COOKIE_EMPRESA_MAX_AGE` em `empresa-ativa.ts`. */
const MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Espelha a empresa escolhida no cookie que o servidor lê.
 *
 * Por que o cookie existe, se `pedir()` já manda o header `X-Empresa-Id`: o
 * header só existe em chamada de API feita pela tela. Página de servidor (RSC)
 * renderiza ANTES de qualquer fetch do cliente e não recebe header de
 * aplicação nenhum — `empresaDaPagina()` só tem o cookie. Sem o espelho, um
 * `localStorage` dizendo "empresa B" conviveria com um servidor renderizando a
 * empresa padrão, e a tela se contradiria.
 *
 * Os atributos batem com `atributosDoCookieEmpresa()` (`empresa-ativa.ts`), e
 * cada um tem motivo:
 *
 *  - `Path=/` — o console inteiro lê a escolha, não só uma rota;
 *  - `Max-Age` de 1 ano — escolher empresa é preferência de trabalho, não
 *    sessão; expirar junto com o login faria o operador voltar para a empresa
 *    padrão toda manhã;
 *  - `SameSite=Lax` — nenhuma navegação de terceiro precisa carregar a escolha;
 *  - **sem `HttpOnly`** — é justamente a tela que escreve este cookie. Ele não
 *    é credencial: SELECIONA, não autoriza. Quem autoriza continua sendo
 *    `capi_sessao`, e toda rota de empresa exige sessão;
 *  - `Secure` **condicional**, nunca fixo — o console também roda em
 *    `http://localhost:3333`, e ali um `Secure` faria o navegador descartar o
 *    cookie em silêncio: a tela trocaria de empresa e o servidor nunca saberia.
 */
export function escreverCookieEmpresa(id: string): void {
  if (typeof document === 'undefined') return;
  try {
    const seguro = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_EMPRESA}=${encodeURIComponent(id)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${seguro}`;
  } catch {
    /* cookies bloqueados — a chamada de API ainda leva o header, que basta para a tela */
  }
}

export const useEmpresaStore = create<EmpresaState>()(
  persist(
    (set, get) => ({
      empresas: [],
      empresaAtivaId: EMPRESA_DEFAULT,
      carregando: false,
      carregado: false,
      erro: null,

      carregar: async () => {
        if (get().carregando) return;
        set({ carregando: true });
        try {
          // `ativa` vem na resposta porque o servidor já resolveu
          // header → cookie → 'default' para poder responder. Não o usamos para
          // sobrescrever a escolha local: `pedir()` MANDOU `empresaAtivaId` no
          // header, então, quando a escolha continua válida, os dois lados já
          // são o mesmo valor. Quando ela não é mais válida, a regra é D-4 —
          // 'default' — e está escrita logo abaixo, de um jeito que não depende
          // da resposta chegar completa.
          const dados = await pedir<{ empresas: EmpresaPublica[]; ativa: string }>('/api/empresas', {
            cache: 'no-store',
          });
          const empresas = dados.empresas ?? [];
          const escolhida = empresas.some((e) => e.id === get().empresaAtivaId)
            ? get().empresaAtivaId
            : EMPRESA_DEFAULT;

          set({ empresas, carregado: true, erro: null, empresaAtivaId: escolhida });

          // Espelho do cookie em TODA carga, não só na troca: a primeira
          // abertura do console num navegador que já tinha a escolha em
          // `localStorage` (ou que perdeu o cookie) precisa reconciliar os dois
          // antes da próxima navegação de servidor.
          escreverCookieEmpresa(escolhida);
        } catch (e) {
          // Mesmo tratamento do `useBrandStore`: a falha vira mensagem, nunca
          // silêncio. Lista vazia sem erro seria indistinguível de "não há
          // empresa nenhuma" — e no seletor do cabeçalho isso é um convite a
          // recadastrar um cliente que já existe.
          set({
            carregado: true,
            erro: e instanceof Error ? e.message : 'Não foi possível ler as empresas.',
          });
        } finally {
          set({ carregando: false });
        }
      },

      /**
       * Troca a empresa que o operador está olhando.
       *
       * A ORDEM é o ponto:
       *
       *  1. cookie primeiro, para que qualquer navegação de servidor que
       *     aconteça a seguir já renderize a empresa certa;
       *  2. estado depois, porque é dele que `pedir()` lê o header
       *     `X-Empresa-Id` — o passo 3 precisa que ele já esteja trocado;
       *  3. recarga dos Pixels, porque a lista de Pixels é por empresa. Sem
       *     isso a tela ficaria com o nome da empresa nova e o Pixel da antiga.
       *
       * `router.refresh()` NÃO acontece aqui: o store não conhece o router, e
       * fingir que conhece o acoplaria ao Next inteiro. Quem chama decide se a
       * página precisa ser reconstruída.
       */
      setEmpresaAtiva: async (id) => {
        escreverCookieEmpresa(id);
        set({ empresaAtivaId: id });
        await useBrandStore.getState().carregar();
      },

      /**
       * Cria (sem `id`) ou edita (com `id`) uma empresa.
       *
       * 🔴 D-19 — este corpo NUNCA carrega `pixelId`, `accessToken` nem
       * `testCode`. Não é esquecimento nem economia: `PUT /api/empresas` recusa
       * esses campos com 400 de propósito, para que ninguém acredite ter salvo
       * um Pixel por aqui. Credencial vai por `PUT /api/marcas`
       * (`useBrandStore.salvarMarca`), que é o caminho que guarda o token fora
       * do que volta para a tela.
       *
       * Devolve a empresa como o servidor a gravou — é dela que o diálogo tira
       * o `id` recém-criado para, em seguida, salvar o primeiro Pixel.
       */
      salvarEmpresa: async (dados) => {
        const resposta = await pedir<{ empresa: EmpresaPublica; criada: boolean }>('/api/empresas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(dados.id ? { id: dados.id.trim() } : {}),
            nome: dados.nome.trim(),
            ...(dados.slug !== undefined ? { slug: dados.slug.trim() } : {}),
            ...(dados.plataforma !== undefined ? { plataforma: dados.plataforma.trim() } : {}),
            ...(dados.logoDataUrl !== undefined ? { logoDataUrl: dados.logoDataUrl.trim() } : {}),
            ...(dados.logoUrl !== undefined ? { logoUrl: dados.logoUrl.trim() } : {}),
            ...(dados.cor !== undefined ? { cor: dados.cor.trim() } : {}),
          }),
        });
        // Relemos em vez de mesclar no cliente: o servidor normaliza o slug,
        // garante a empresa padrão em primeiro lugar e pode ter gerado o id.
        await get().carregar();
        return resposta.empresa;
      },

      /**
       * Apaga uma empresa (D-17) — e, com ela, os Pixels dela.
       *
       * A confirmação vai NO CORPO porque é o servidor que exige: apagar
       * arrasta os Pixels junto, e isso não pode ser acionável por uma aba
       * velha repetindo a requisição. As três travas (padrão intocável,
       * automático ligado, Pixels antes da empresa) moram em `removerEmpresa()`
       * no servidor; aqui só se pede.
       */
      removerEmpresa: async (id) => {
        await pedir(`/api/empresas?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmar: true }),
        });
        // Se a apagada era a ativa, `carregar()` já reconduz para 'default'
        // (D-4) e reescreve o cookie — por isso não há nada a corrigir aqui.
        await get().carregar();
      },

      /**
       * A empresa ativa.
       *
       * Cai na PADRÃO antes de cair na primeira da lista, ao contrário de
       * `useBrandStore.ativa()`: a padrão é a instalação que já existe, dona do
       * `integracoes.json` de hoje. `empresas[0]` fica como último recurso para
       * a janela entre a montagem e a primeira carga, quando a lista ainda está
       * vazia e nem a padrão chegou.
       */
      ativa: () => {
        const { empresas, empresaAtivaId } = get();
        return (
          empresas.find((e) => e.id === empresaAtivaId) ??
          empresas.find((e) => e.id === EMPRESA_DEFAULT) ??
          empresas[0]
        );
      },
    }),
    {
      name: CHAVE_EMPRESA_ATIVA,
      // só a escolha do usuário é persistida; a lista vem sempre do servidor
      partialize: (s) => ({ empresaAtivaId: s.empresaAtivaId }) as Partial<EmpresaState>,
    }
  )
);
