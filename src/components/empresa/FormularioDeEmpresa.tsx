'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Info, Lock, Save, Trash2 } from '@/components/ui/icones';

import { useEmpresaStore, type EmpresaPublica } from '@/stores/useEmpresaStore';
import { destinoAoTrocar } from '@/lib/empresa-do-endereco';
import { normalizarRotulo } from '@/components/integrations/rotulo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, Field, Section, StatusDot } from '@/components/common/primitives';

/**
 * Os dados de UMA empresa, num lugar só (V7 do v7).
 *
 * Três peças, usadas por dois lugares:
 *
 *  - `CamposDaEmpresa`: os campos que `Empresa` tem HOJE (`empresas.ts`):
 *    nome, logo (`logoDataUrl`, com prévia do `logoUrl`), plataforma, apelido
 *    (`slug`) e cor. Nada além disso: campo que o servidor não guarda não entra
 *    aqui, porque o operador acharia que salvou.
 *  - `FormularioDeEmpresa`: a aba Configurações edita com esses campos pelo
 *    `PUT /api/empresas` de hoje (via `useEmpresaStore.salvarEmpresa`, com o
 *    `id` da empresa do endereço).
 *  - `ExcluirEmpresa`: o `DELETE /api/empresas`, confirmado com o nome
 *    digitado. A empresa padrão não tem o botão (regra de `removerEmpresa()`).
 *
 * O `EmpresaDialog` continua sendo quem CRIA empresa (duas etapas, com o
 * primeiro Pixel) e usa `CamposDaEmpresa` na etapa 1 — os mesmos campos, sem
 * cópia.
 *
 * 🔴 Nenhum `fetch` mora aqui (regra E-8 do plano v6): toda ida à rede passa
 * pelo `useEmpresaStore`.
 */

/**
 * COPIA do teto de `src/lib/empresas.ts` (LOGO_MAX_BYTES).
 *
 * 🔴 Nao da para importar de la: aquele arquivo abre com `import 'server-only'`.
 * A copia existe porque a imagem precisa ser recusada ANTES do `FileReader`:
 * quem escolhe um PNG de 4 MB nao deve esperar a leitura inteira, virar 5,3 MB
 * de base64 em memoria e so entao levar 400. A autoridade continua sendo o
 * servidor, que mede de novo em `salvarEmpresa()`.
 */
const LOGO_MAX_BYTES = 150 * 1024;

/** Cópia de `EMPRESA_DEFAULT_ID` (`empresas.ts`, server-only): a padrão nunca é excluída. */
const EMPRESA_PADRAO = 'default';

/**
 * Cor inicial do seletor = `--tinta` do tema, LIDA do tema.
 *
 * O `<input type="color">` nao tem estado "nenhuma cor": ele sempre devolve um
 * hex. Comecar na tinta da area faz a empresa nova nascer parecida com o resto
 * da interface em vez de com o preto que o navegador usa por padrao.
 *
 * 🔴 O valor NAO e copiado para ca. Um hex literal aqui viraria a segunda fonte
 * da cor de acento — e `check:contrast` (G7) reprova o build justamente para
 * isso. Lendo a custom property, a copia nao existe.
 *
 * Fora do navegador devolve string vazia.
 */
export function corInicial(): string {
  if (typeof document === 'undefined') return '';
  const v = getComputedStyle(document.documentElement).getPropertyValue('--tinta').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '';
}

const semAssinatura = () => () => {};
const semCorNoServidor = () => '';

/**
 * A cor do tema sem quebrar a hidratação: no servidor (e no primeiro quadro do
 * cliente) ela é vazia; depois da hidratação, a lida do CSS. Ler direto no
 * render daria um HTML diferente do servidor na aba Configurações, que não
 * mora dentro de um portal como o diálogo.
 */
function useCorDoTema(): string {
  return useSyncExternalStore(semAssinatura, corInicial, semCorNoServidor);
}

/**
 * Ids que o `Field` gera para helper e erro.
 *
 * O `Field` publica esses ids por contexto, mas o contexto so alcanca um
 * COMPONENTE filho — e aqui o `<Input>` e irmao na mesma renderizacao, entao o
 * hook nao veria o valor. Montar a string pela mesma convencao e o que mantem o
 * `aria-describedby` realmente ligado ao erro.
 */
export function descrito(id: string, temHelper: boolean, temErro: boolean): string | undefined {
  const ids = [temHelper ? `${id}-helper` : '', temErro ? `${id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/** Iniciais para o avatar enquanto nao ha logo. Ate duas letras. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Os campos                                                           */
/* ------------------------------------------------------------------ */

/** Os campos que `Empresa` tem hoje, como o formulário os segura. */
export interface ValoresDaEmpresa {
  nome: string;
  plataforma: string;
  slug: string;
  cor: string;
  logoDataUrl: string;
}

export interface CamposDaEmpresaProps {
  valores: ValoresDaEmpresa;
  onChange: (mudanca: Partial<ValoresDaEmpresa>) => void;
  /**
   * O apelido que vai para o servidor: o digitado, ou o que sai do nome
   * enquanto ninguém mexeu no apelido (criação).
   */
  slugEfetivo: string;
  /** Avisado na primeira tecla no apelido: a partir dali o nome para de mandar nele. */
  onSlugTocado?: () => void;
  /** Logo estático já gravado (`logoUrl`), para a prévia quando não há imagem escolhida. */
  logoSalvo?: string;
  /** Prefixo dos ids — o diálogo e a aba podem estar na mesma tela. */
  prefixo?: string;
  autoFocus?: boolean;
  /**
   * Texto de ajuda do apelido. Na criação o apelido semeia a URL do webhook
   * (`config-store.ts`, `rotulo: slug`); depois disso trocar o apelido NÃO
   * mexe no webhook — só no endereço `/e/<slug>` — e a aba Configurações diz
   * exatamente isso.
   */
  ajudaDoApelido?: string;
}

export function CamposDaEmpresa({
  valores,
  onChange,
  slugEfetivo,
  onSlugTocado,
  logoSalvo,
  prefixo = 'empresa',
  autoFocus = false,
  ajudaDoApelido = 'Vai na URL do webhook desta empresa. Só minúsculas, dígitos e hífen.',
}: CamposDaEmpresaProps) {
  const [erroLogo, setErroLogo] = useState('');
  const refArquivo = useRef<HTMLInputElement>(null);
  const corDoTema = useCorDoTema();

  const id = (campo: string) => `${prefixo}-${campo}`;
  /** Prévia: o data URI escolhido agora vence; senão o arquivo estático da empresa. */
  const previa = valores.logoDataUrl || logoSalvo || '';
  const corDoAvatar = valores.cor || corDoTema;

  const escolherLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;

    if (arquivo.size > LOGO_MAX_BYTES) {
      setErroLogo(
        `Esta imagem tem ${Math.round(arquivo.size / 1024)} KB. O limite é ` +
          `${Math.round(LOGO_MAX_BYTES / 1024)} KB — escolha uma menor.`
      );
      // Zerar o campo: sem isso o nome do arquivo recusado continua na tela,
      // como se ele tivesse entrado.
      e.target.value = '';
      return;
    }

    const leitor = new FileReader();
    leitor.onerror = () => setErroLogo('Não foi possível ler este arquivo. Tente outro.');
    leitor.onload = () => {
      setErroLogo('');
      onChange({ logoDataUrl: String(leitor.result ?? '') });
    };
    leitor.readAsDataURL(arquivo);
  };

  const removerLogo = () => {
    onChange({ logoDataUrl: '' });
    setErroLogo('');
    // Zerar o `<input type="file">` tambem: senao escolher DE NOVO o mesmo
    // arquivo nao dispara `change` e a imagem removida nao volta.
    if (refArquivo.current) refArquivo.current.value = '';
  };

  return (
    <div className="flex flex-col gap-4">
      <Field
        id={id('nome')}
        label="Nome"
        required
        helper="Como esta empresa aparece na lista de empresas."
      >
        <Input
          id={id('nome')}
          autoFocus={autoFocus}
          value={valores.nome}
          onChange={(e) => onChange({ nome: e.target.value })}
          placeholder="Código Vencedor"
          aria-describedby={descrito(id('nome'), true, false)}
          maxLength={60}
        />
      </Field>

      <Field
        id={id('logo')}
        label="Foto ou logo"
        error={erroLogo || undefined}
        helper="PNG, JPEG, SVG ou WebP, até 150 KB. Sem imagem, o avatar usa as iniciais."
      >
        <div className="flex items-center gap-3">
          {/* Prévia redonda: é assim que o logo vai aparecer na lista de
              empresas, então é assim que ele é mostrado aqui. */}
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-control bg-surface-2 text-label font-semibold text-white"
            style={previa || !corDoAvatar ? undefined : { backgroundColor: corDoAvatar }}
          >
            {previa ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previa} alt="" className="size-full object-cover" />
            ) : (
              iniciais(valores.nome)
            )}
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Input
              id={id('logo')}
              ref={refArquivo}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={escolherLogo}
              aria-describedby={descrito(id('logo'), true, Boolean(erroLogo))}
              className="h-auto cursor-pointer px-0 py-0 text-caption file:mr-3 file:cursor-pointer file:rounded-l-control file:border-0 file:bg-surface-3 file:px-3 file:py-2.5 file:text-label file:font-medium file:text-fg-body"
            />
            {valores.logoDataUrl && (
              <Button size="sm" variant="ghost" onClick={removerLogo} className="self-start">
                <Trash2 className="size-3.5" aria-hidden />
                Remover imagem
              </Button>
            )}
          </div>
        </div>
      </Field>

      <Field
        id={id('plataforma')}
        label="Plataforma de vendas"
        helper="Aparece nos textos de instalação do webhook desta empresa."
      >
        <Input
          id={id('plataforma')}
          value={valores.plataforma}
          onChange={(e) => onChange({ plataforma: e.target.value })}
          placeholder="xWinner, Hotmart, Kiwify…"
          aria-describedby={descrito(id('plataforma'), true, false)}
          maxLength={40}
        />
      </Field>

      <Field id={id('slug')} label="Apelido da URL" helper={ajudaDoApelido}>
        <Input
          id={id('slug')}
          value={slugEfetivo}
          onChange={(e) => {
            onSlugTocado?.();
            onChange({ slug: e.target.value });
          }}
          // Normalizar ao sair do campo, e nao a cada tecla: normalizando
          // durante a digitacao o hifen que o operador acabou de escrever
          // some antes da proxima letra e o campo parece quebrado.
          onBlur={() => onChange({ slug: normalizarRotulo(slugEfetivo) })}
          placeholder="codigo-vencedor"
          className="font-mono"
          aria-describedby={descrito(id('slug'), true, false)}
          spellCheck={false}
        />
      </Field>

      <Field id={id('cor')} label="Cor" helper="Cor do avatar quando a empresa não tem logo.">
        <div className="flex items-center gap-3">
          <Input
            id={id('cor')}
            type="color"
            value={corDoAvatar}
            onChange={(e) => onChange({ cor: e.target.value })}
            aria-describedby={descrito(id('cor'), true, false)}
            className="w-20 cursor-pointer px-1 py-1"
          />
          <span className="font-mono text-caption text-fg-muted">
            {valores.cor || 'cor do tema'}
          </span>
        </div>
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editar (aba Configurações)                                          */
/* ------------------------------------------------------------------ */

/** Os valores do formulário a partir do que o servidor gravou. */
function valoresDe(empresa: EmpresaPublica): ValoresDaEmpresa {
  return {
    nome: empresa.nome,
    plataforma: empresa.plataforma ?? '',
    slug: empresa.slug,
    cor: empresa.cor ?? '',
    logoDataUrl: empresa.logoDataUrl ?? '',
  };
}

/** Compara como o servidor vai gravar: espaços nas pontas e apelido normalizado não contam. */
function mesmosValores(a: ValoresDaEmpresa, b: ValoresDaEmpresa): boolean {
  return (
    a.nome.trim() === b.nome.trim() &&
    a.plataforma.trim() === b.plataforma.trim() &&
    normalizarRotulo(a.slug) === normalizarRotulo(b.slug) &&
    a.cor.toLowerCase() === b.cor.toLowerCase() &&
    a.logoDataUrl === b.logoDataUrl
  );
}

export function FormularioDeEmpresa({ empresa }: { empresa: EmpresaPublica }) {
  const salvarEmpresa = useEmpresaStore((s) => s.salvarEmpresa);
  const marcarRascunho = useEmpresaStore((s) => s.marcarRascunho);
  const router = useRouter();
  const pathname = usePathname();

  // Semeado uma vez: a página monta este formulário com `key={empresaId}`,
  // então trocar de empresa monta outro, já com os dados da nova.
  const [valores, setValores] = useState<ValoresDaEmpresa>(() => valoresDe(empresa));
  const [salvando, setSalvando] = useState(false);
  /** Mensagem crua do servidor (o 400 de `ErroDeEmpresa`). Nunca reescrita. */
  const [erro, setErro] = useState('');

  const slugNovo = normalizarRotulo(valores.slug);
  const apelidoMuda = slugNovo !== '' && slugNovo !== empresa.slug;
  const sujo = !mesmosValores(valores, valoresDe(empresa));

  // Contrato de C2 (T6): tela com coisa digitada e não salva avisa o seletor,
  // que então não recarrega a tela por baixo do operador.
  useEffect(() => {
    marcarRascunho(sujo);
  }, [sujo, marcarRascunho]);
  useEffect(() => () => marcarRascunho(false), [marcarRascunho]);

  const mudar = (mudanca: Partial<ValoresDaEmpresa>) => setValores((v) => ({ ...v, ...mudanca }));

  const salvar = async () => {
    if (!valores.nome.trim()) {
      setErro('Informe o nome da empresa.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const salva = await salvarEmpresa({
        id: empresa.id,
        nome: valores.nome.trim(),
        slug: slugNovo || empresa.slug,
        plataforma: valores.plataforma.trim(),
        logoDataUrl: valores.logoDataUrl,
        cor: valores.cor,
      });
      toast.success('Alterações salvas.');
      // O apelido É o endereço (V2 do v7). Se ele mudou, a tela vai para o
      // endereço novo — o antigo daria "Empresa não encontrada" no próximo
      // clique. Senão, relê a página de servidor para o nome novo aparecer.
      if (salva.slug !== empresa.slug) {
        router.replace(destinoAoTrocar(pathname, salva.slug));
      } else {
        router.refresh();
      }
    } catch (e) {
      // A mensagem do servidor e escrita para humano ("Já existe uma empresa com
      // o apelido …") e diz exatamente qual campo corrigir.
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a empresa.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Section
      id="dados-da-empresa"
      title="Dados da empresa"
      icon={Save}
      variant="card"
      description="Nome, logo, plataforma de vendas, apelido da URL e cor."
      action={
        sujo ? (
          <StatusDot tone="warning">Alterações não salvas</StatusDot>
        ) : (
          <StatusDot tone="success">Tudo salvo</StatusDot>
        )
      }
    >
      {erro && (
        <Callout tone="danger" icon={AlertTriangle} title="Não foi possível salvar">
          {erro}
        </Callout>
      )}

      <CamposDaEmpresa
        valores={valores}
        onChange={mudar}
        slugEfetivo={valores.slug}
        logoSalvo={empresa.logoUrl}
        prefixo="configuracoes-empresa"
        ajudaDoApelido={`O endereço desta empresa no console: /e/${slugNovo || empresa.slug}. Só minúsculas, dígitos e hífen. A URL do webhook não muda.`}
      />

      {apelidoMuda && (
        <Callout tone="warning" icon={AlertTriangle} title="O endereço desta empresa vai mudar">
          De <span className="font-mono">/e/{empresa.slug}</span> para{' '}
          <span className="font-mono">/e/{slugNovo}</span>. Favoritos e links com o endereço
          antigo deixam de abrir esta empresa.
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void salvar()} disabled={!sujo || salvando}>
          <Save className="size-4" aria-hidden />
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </Button>
        {sujo && !salvando && (
          <Button
            variant="ghost"
            onClick={() => {
              setValores(valoresDe(empresa));
              setErro('');
            }}
          >
            Descartar alterações
          </Button>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Excluir                                                             */
/* ------------------------------------------------------------------ */

export function ExcluirEmpresa({ empresa }: { empresa: Pick<EmpresaPublica, 'id' | 'nome' | 'slug'> }) {
  const removerEmpresa = useEmpresaStore((s) => s.removerEmpresa);
  const router = useRouter();
  const [digitado, setDigitado] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  /** Mensagem crua do servidor — inclusive a trava do envio automático ligado. */
  const [erro, setErro] = useState('');

  const abaPixels = `/e/${encodeURIComponent(empresa.slug)}/pixels`;

  if (empresa.id === EMPRESA_PADRAO) {
    return (
      <Section
        id="excluir-empresa"
        title="Excluir empresa"
        icon={Trash2}
        variant="card"
        action={
          <StatusDot tone="neutral" icon={Lock}>
            Não pode ser excluída
          </StatusDot>
        }
      >
        <p className="text-body text-fg-body">
          Esta é a empresa principal do console: é nela que ficam o webhook e a tag que já
          recebem vendas hoje. Por isso ela não tem o botão de excluir.
        </p>
      </Section>
    );
  }

  const confere = digitado.trim() !== '' && digitado.trim() === empresa.nome.trim();

  const excluir = async () => {
    if (!confere) return;
    setExcluindo(true);
    setErro('');
    try {
      await removerEmpresa(empresa.id);
      toast.success(`Empresa ${empresa.nome} excluída.`);
      router.push('/empresas');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir a empresa. Nada foi apagado.');
      setExcluindo(false);
    }
  };

  return (
    <Section
      id="excluir-empresa"
      title="Excluir empresa"
      icon={Trash2}
      variant="card"
      description="Apaga esta empresa e os Pixels dela."
    >
      <p className="text-body text-fg-body">
        Excluir apaga <strong className="font-semibold text-fg-strong">{empresa.nome}</strong> e
        os Pixels dela, e o webhook desta empresa deixa de receber vendas. Não dá para desfazer
        por aqui.
      </p>

      <Callout tone="info" icon={Info}>
        Pixel com envio automático ligado impede a exclusão. Desligue antes em{' '}
        <Link href={abaPixels} className="font-medium text-tinta-texto underline-offset-4 hover:underline">
          Pixels
        </Link>
        .
      </Callout>

      {erro && (
        <Callout tone="danger" icon={AlertTriangle} title="A empresa não foi excluída">
          <p>{erro}</p>
          <Link
            href={abaPixels}
            className="mt-1 inline-block font-medium text-tinta-texto underline-offset-4 hover:underline"
          >
            Abrir Pixels desta empresa
          </Link>
        </Callout>
      )}

      <Field
        id="excluir-empresa-nome"
        label="Nome para confirmar"
        helper={`Digite ${empresa.nome} para liberar o botão.`}
      >
        <Input
          id="excluir-empresa-nome"
          value={digitado}
          onChange={(e) => setDigitado(e.target.value)}
          placeholder={empresa.nome}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={descrito('excluir-empresa-nome', true, false)}
        />
      </Field>

      <div>
        <Button variant="destructive" onClick={() => void excluir()} disabled={!confere || excluindo}>
          <Trash2 className="size-4" aria-hidden />
          {excluindo ? 'Excluindo…' : 'Excluir empresa'}
        </Button>
      </div>
    </Section>
  );
}

export default FormularioDeEmpresa;
