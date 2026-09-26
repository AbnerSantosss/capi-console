import Link from 'next/link';
import { Building2 } from '@/components/ui/icones';

import { EstadoVazio } from '@/components/common/EstadoVazio';
import { StatusDot } from '@/components/common/primitives';
import { AvisoConfigIndisponivel } from '@/components/layout/AvisoConfigIndisponivel';
import { ConsolePageHeader } from '@/components/layout/ConsolePageHeader';
import { BotaoNovaEmpresa } from '@/components/layout/LateralDeEmpresas';
import consoleStyles from '@/components/layout/console.module.css';
import { lerChecklistDaEmpresa } from '@/components/visao-geral/checklist-do-servidor';
import type { EstadoDaEmpresa, TomDaEmpresa } from '@/lib/checklist-empresa';
import {
  ErroConfiguracaoIndisponivel,
  lerIntegracoes,
  listarMarcas,
} from '@/lib/config-store';
import { listarEmpresas, type Empresa } from '@/lib/empresas';
import { hostDaTag } from '@/lib/tag-dominios';

export const dynamic = 'force-dynamic';

const TITULO = 'Empresas';
const DESCRICAO = 'Cada empresa tem o próprio endereço, os próprios Pixels e as próprias regras.';

/** Um traço, e não um texto vazio: a célula existe e não tem valor. */
const SEM_VALOR = '—';

interface Linha {
  empresa: Empresa;
  /** `sub.host` de cada domínio próprio cadastrado na tag. */
  dominios: string[];
  /** ISO do último evento que a tag recebeu, em qualquer domínio. */
  ultimoEvento: string | null;
  /** `null` quando a configuração desta empresa não pôde ser lida. */
  pixels: number | null;
  /** O pior passo do checklist (V5), ou `null` quando a leitura falhou. */
  estado: EstadoDaEmpresa | null;
}

/** O selo em texto E cor, na mesma régua do cabeçalho da empresa. */
const TOM_DO_ESTADO: Record<TomDaEmpresa, 'danger' | 'warning' | 'accent' | 'success'> = {
  erro: 'danger',
  pendente: 'warning',
  andamento: 'accent',
  ok: 'success',
};

/**
 * A causa, sem repetir o selo: "Falta configurar: cadastrar um Pixel" vira
 * "Cadastrar um Pixel" embaixo de "Falta configurar".
 */
function causaDoEstado(estado: EstadoDaEmpresa): string {
  const dois = estado.frase.indexOf(':');
  const causa = dois === -1 ? estado.frase : estado.frase.slice(dois + 1).trim();
  if (!causa || causa === estado.rotulo) return '';
  return `${causa[0].toUpperCase()}${causa.slice(1)}`;
}

/** O que a lista mostra de uma empresa; uma leitura que falha vira "—". */
async function linhaDaEmpresa(empresa: Empresa): Promise<Linha> {
  const [integracoes, marcas, checklist] = await Promise.allSettled([
    lerIntegracoes(empresa.id),
    listarMarcas(empresa.id),
    lerChecklistDaEmpresa(empresa),
  ]);

  const dominiosDaTag =
    integracoes.status === 'fulfilled' ? integracoes.value.tag?.dominios ?? [] : [];

  // Domínio próprio = o que tem subdomínio do cliente (`tk.loja.com.br`). Sem
  // subdomínio, a tag chama o nosso domínio, e isso não é domínio próprio.
  const dominios = dominiosDaTag
    .filter((d) => String(d.subdominio ?? '').trim() && String(d.host ?? '').trim())
    .map((d) => hostDaTag(d, ''))
    .filter(Boolean);

  const ultimoEvento =
    dominiosDaTag
      .map((d) => d.ultimoHit ?? '')
      .filter((iso) => iso && !Number.isNaN(Date.parse(iso)))
      .sort()
      .at(-1) ?? null;

  return {
    empresa,
    dominios,
    ultimoEvento,
    pixels: marcas.status === 'fulfilled' ? marcas.value.length : null,
    estado: checklist.status === 'fulfilled' ? checklist.value.estado : null,
  };
}

function dataEHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/**
 * A lista de empresas (`/empresas`, V2 do v7; wireframe 2 do v6 §3.4).
 *
 * Colunas: Empresa (o link para a Visão geral dela), Domínio próprio (o
 * `sub.host` cadastrado na tag, ou "—"), Estado (o pior passo do checklist da
 * V5, `estadoDaEmpresa`, com a causa por extenso; "—" se a leitura falhou),
 * Último evento (o último que a tag recebeu, ou "—") e Pixels (quantos a
 * empresa tem).
 *
 * É a página fora de qualquer empresa: não lê nem grava o cookie da empresa
 * ativa, e o endereço não tem slug. Criar e editar empresa continuam no
 * seletor de empresas do cabeçalho.
 */
export default async function Empresas() {
  let empresas: Empresa[];
  try {
    empresas = await listarEmpresas();
  } catch (erro) {
    // Registro ilegível: o aviso de sempre, e não o error boundary do Next.
    if (!(erro instanceof ErroConfiguracaoIndisponivel)) throw erro;
    return (
      <main className={consoleStyles.page} data-area="painel">
        <ConsolePageHeader title={TITULO} description={DESCRICAO} icon={Building2} />
        <AvisoConfigIndisponivel arquivo={erro.arquivo} />
      </main>
    );
  }

  const linhas = await Promise.all(empresas.map(linhaDaEmpresa));

  // Nenhuma empresa cadastrada (V9): o vazio diz o que é e dá o botão que
  // resolve. "Nova empresa" abre o mesmo diálogo da lateral, que está montada
  // em toda tela do console (inclusive no celular, escondida).
  if (linhas.length === 0) {
    return (
      <main className={consoleStyles.page} data-area="painel">
        <ConsolePageHeader title={TITULO} description={DESCRICAO} icon={Building2} />
        <EstadoVazio
          titulo="Nenhuma empresa ainda"
          motivo="Cada empresa guarda os próprios Pixels, o endereço da tag e as regras. Cadastre a primeira para começar a receber eventos."
          acao={<BotaoNovaEmpresa size="sm" />}
        />
      </main>
    );
  }

  return (
    <main className={consoleStyles.page} data-area="painel">
      <ConsolePageHeader title={TITULO} description={DESCRICAO} icon={Building2} />

      {/* A tabela rola DENTRO do painel no celular (`.rolagemDoPainel`, V9):
          as 5 colunas continuam lá, e a página não rola para o lado. */}
      <div
        className={`${consoleStyles.rolagemDoPainel} rounded-panel border border-line-strong bg-surface-1 px-4 shadow-realce`}
        tabIndex={0}
        role="region"
        aria-label="Lista de empresas"
      >
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {['Empresa', 'Domínio próprio', 'Estado', 'Último evento', 'Pixels'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="py-3 pr-4 text-caption font-semibold tracking-wide text-fg-muted uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ empresa, dominios, ultimoEvento, pixels, estado }) => (
              <tr key={empresa.id} className="border-b border-line last:border-b-0">
                <th scope="row" className="py-3 pr-4 font-normal">
                  <Link
                    href={`/e/${empresa.slug}`}
                    className="text-body font-semibold text-fg-strong underline-offset-2 hover:text-tinta-texto hover:underline"
                  >
                    {empresa.nome}
                  </Link>
                  <span className="block font-mono text-caption text-fg-muted">
                    /e/{empresa.slug}
                  </span>
                </th>
                <td className="py-3 pr-4 font-mono text-caption text-fg-body">
                  {dominios.length === 0 ? (
                    <span className="font-sans text-fg-muted">{SEM_VALOR}</span>
                  ) : (
                    dominios.map((d) => (
                      <span key={d} className="block">
                        {d}
                      </span>
                    ))
                  )}
                </td>
                <td className="py-3 pr-4">
                  {estado === null ? (
                    <span className="text-caption text-fg-muted" title="O estado desta empresa não pôde ser lido">
                      {SEM_VALOR}
                    </span>
                  ) : (
                    <span className="flex flex-col gap-0.5">
                      <StatusDot tone={TOM_DO_ESTADO[estado.tom]}>{estado.rotulo}</StatusDot>
                      {causaDoEstado(estado) ? (
                        <span className="text-caption text-fg-muted">{causaDoEstado(estado)}</span>
                      ) : null}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-caption text-fg-body tabular">
                  {ultimoEvento ? (
                    <time dateTime={ultimoEvento}>{dataEHora(ultimoEvento)}</time>
                  ) : (
                    <span className="text-fg-muted">{SEM_VALOR}</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-caption text-fg-body tabular">
                  {pixels === null ? <span className="text-fg-muted">{SEM_VALOR}</span> : pixels}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
