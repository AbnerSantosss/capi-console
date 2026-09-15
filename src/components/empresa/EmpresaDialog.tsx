'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';

import {
  useEmpresaStore,
  type EmpresaPublica,
  type EntradaDeEmpresa,
} from '@/stores/useEmpresaStore';
import { useBrandStore } from '@/stores/useBrandStore';
import { normalizarRotulo } from '@/components/integrations/rotulo';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Callout } from '@/components/common/primitives';

/**
 * O dialogo de UMA empresa — criar (duas etapas) ou editar (uma).
 *
 * Por que duas etapas na criacao, e nao um formulario unico e comprido: uma
 * empresa sem nenhum Pixel nao dispara nada. Quem cria empresa aqui esta, na
 * pratica, comecando uma instalacao — e sair do dialogo com a empresa criada e
 * nenhum destino configurado e o caminho mais curto para o operador achar que
 * terminou quando nao terminou. A etapa 2 e o primeiro Pixel, e o sucesso leva
 * direto para /instalacao, onde estao o webhook e a tag.
 *
 * Na EDICAO a etapa 2 nao existe: um Pixel ja criado se edita em /pixels, que e
 * a tela dele. Repetir o formulario de Pixel aqui criaria dois lugares para a
 * mesma coisa e a duvida de qual deles manda.
 *
 * O campo do segredo se chama `token` neste arquivo, como no BrandDialog: o
 * nome que a API espera nao pode aparecer em src/components (decisao
 * irreversivel #8), e quem traduz um no outro e o `useBrandStore`.
 *
 * 🔴 Nenhum `fetch` mora aqui (regra E-8 do plano). Toda ida a rede passa pelos
 * stores — `useEmpresaStore` para a empresa, `useBrandStore` para o Pixel.
 */

export interface EmpresaDialogProps {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Ausente = criar (duas etapas). Presente = editar: SÓ a etapa 1. */
  empresa?: EmpresaPublica;
}

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

/**
 * Cor inicial do seletor = `--tinta` do tema, LIDA do tema.
 *
 * O `<input type="color">` nao tem estado "nenhuma cor": ele sempre devolve um
 * hex. Comecar na tinta da area faz a empresa nova nascer parecida com o resto
 * da interface em vez de com o preto que o navegador usa por padrao.
 *
 * v4: e `--tinta` (o degrau de FUNDO, L 0.80) e nao `--tinta-texto`, porque a
 * cor da empresa e usada como preenchimento — pastilha, barra, fundo de selo —
 * e nao como texto.
 *
 * 🔴 O valor NAO e copiado para ca. Um hex literal aqui viraria a segunda fonte
 * da cor de acento — e `check:contrast` (G7) reprova o build justamente para
 * isso: no dia em que o tema mudasse, empresa nova continuaria nascendo na cor
 * velha. Lendo a custom property, a copia nao existe.
 *
 * Fora do navegador devolve string vazia, e isso nao alcanca o `<input>`: o
 * conteudo do dialogo so monta depois do portal, ja no cliente.
 */
function corInicial(): string {
  if (typeof document === 'undefined') return '';
  const v = getComputedStyle(document.documentElement).getPropertyValue('--tinta').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '';
}

const VAZIO = {
  nome: '',
  plataforma: '',
  slug: '',
  // Preenchida na semeadura, que roda no cliente — ver `corInicial()`.
  cor: '',
  logoDataUrl: '',
  pixelNome: '',
  pixelId: '',
  token: '',
  testCode: '',
};

/**
 * Ids que o `Field` gera para helper e erro.
 *
 * O `Field` publica esses ids por contexto, mas o contexto so alcanca um
 * COMPONENTE filho — e aqui o `<Input>` e irmao na mesma renderizacao, entao o
 * hook nao veria o valor. Montar a string pela mesma convencao e o que mantem o
 * `aria-describedby` realmente ligado ao erro.
 */
function descrito(id: string, temHelper: boolean, temErro: boolean): string | undefined {
  const ids = [temHelper ? `${id}-helper` : '', temErro ? `${id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/** Iniciais para o avatar enquanto nao ha logo. Ate duas letras. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

export function EmpresaDialog({ aberto, onOpenChange, empresa }: EmpresaDialogProps) {
  const salvarEmpresa = useEmpresaStore((s) => s.salvarEmpresa);
  const setEmpresaAtiva = useEmpresaStore((s) => s.setEmpresaAtiva);
  const router = useRouter();

  const [form, setForm] = useState({ ...VAZIO });
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [verToken, setVerToken] = useState(false);
  const [salvando, setSalvando] = useState(false);
  /** Mensagem crua do servidor (o 400 de `ErroDeEmpresa`). Nunca reescrita. */
  const [erro, setErro] = useState('');
  const [erroLogo, setErroLogo] = useState('');
  /**
   * O operador mexeu no apelido a mao? Enquanto nao mexeu, o apelido segue o
   * nome. Depois que mexeu, o nome para de mandar nele — senao a primeira letra
   * digitada no nome apagaria o apelido escolhido.
   */
  const [slugTocado, setSlugTocado] = useState(false);
  /**
   * Preenchida quando a EMPRESA ja foi criada mas o Pixel nao entrou. Enquanto
   * ela existir, o dialogo esta no estado de recuperacao — ver `salvarTudo`.
   */
  const [criada, setCriada] = useState<EmpresaPublica | null>(null);

  const refArquivo = useRef<HTMLInputElement>(null);

  // Semear o formulario DURANTE a renderizacao, e nao dentro de um efeito: o
  // efeito so roda depois da pintura, entao abrir "editar" pintaria um quadro
  // com os dados da empresa anterior antes de trocar — e o lint
  // (react-hooks/set-state-in-effect) reprova, com razao, a renderizacao em
  // cascata que isso produz. Mesmo padrao do BrandDialog.
  const alvo = aberto ? (empresa?.id ?? '#nova') : '';
  const [alvoAtual, setAlvoAtual] = useState('');
  if (alvo !== alvoAtual) {
    setAlvoAtual(alvo);
    setForm(
      empresa
        ? {
            ...VAZIO,
            nome: empresa.nome,
            plataforma: empresa.plataforma ?? '',
            slug: empresa.slug,
            cor: empresa.cor ?? corInicial(),
            logoDataUrl: empresa.logoDataUrl ?? '',
          }
        : { ...VAZIO, cor: corInicial() }
    );
    setEtapa(1);
    setVerToken(false);
    setErro('');
    setErroLogo('');
    // Editando, o apelido ja existe e nao pode ser reescrito pelo nome: um slug
    // gravado pode ja estar numa URL de webhook em producao (D-15).
    setSlugTocado(Boolean(empresa));
    setCriada(null);
  }

  const editando = Boolean(empresa);
  /** Prévia: o data URI escolhido agora vence; senão o arquivo estático da empresa. */
  const previa = form.logoDataUrl || empresa?.logoUrl || '';
  const slugEfetivo = slugTocado ? form.slug : normalizarRotulo(form.nome);

  /* ---------------------------------------------------------------- */
  /* Logo                                                              */
  /* ---------------------------------------------------------------- */

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
      setForm((f) => ({ ...f, logoDataUrl: String(leitor.result ?? '') }));
    };
    leitor.readAsDataURL(arquivo);
  };

  const removerLogo = () => {
    setForm((f) => ({ ...f, logoDataUrl: '' }));
    setErroLogo('');
    // Zerar o `<input type="file">` tambem: senao escolher DE NOVO o mesmo
    // arquivo nao dispara `change` e a imagem removida nao volta.
    if (refArquivo.current) refArquivo.current.value = '';
  };

  /* ---------------------------------------------------------------- */
  /* Gravacao                                                          */
  /* ---------------------------------------------------------------- */

  /** O que sobe para o PUT /api/empresas. Um lugar só, usado pelos dois modos. */
  const entrada = (): EntradaDeEmpresa => ({
    id: empresa?.id,
    nome: form.nome.trim(),
    slug: slugEfetivo,
    plataforma: form.plataforma.trim(),
    logoDataUrl: form.logoDataUrl,
    cor: form.cor,
  });

  /** Só o Pixel — o passo 3, isolado para o botão "Tentar de novo" repetir. */
  const gravarPixel = async (empresaId: string) => {
    // 🔴 O `setEmpresaAtiva` vem ANTES do Pixel: e ele que faz a proxima chamada
    // levar o header X-Empresa-Id da empresa nova, e e o header que diz ao
    // servidor em qual empresa gravar. Sem este passo o Pixel nasce na empresa
    // errada — e um Pixel na empresa errada dispara venda de um cliente para a
    // conta de outro.
    //
    // Repetir a troca a cada tentativa (e nao so na primeira) e deliberado: se o
    // que falhou foi a PROPRIA troca, tentar so o PUT do Pixel o gravaria na
    // empresa que estava ativa antes. Trocar duas vezes para a mesma empresa nao
    // custa nada; gravar no lugar errado custa uma venda.
    await setEmpresaAtiva(empresaId);
    await useBrandStore.getState().salvarMarca({
      nome: form.pixelNome.trim() || form.nome.trim(),
      pixelId: form.pixelId.trim(),
      token: form.token,
      testCode: form.testCode.trim(),
      adAccountId: '',
    });
  };

  const concluir = (nomeDaEmpresa: string) => {
    toast.success(
      `Empresa criada com o Pixel ${nomeDaEmpresa}. Agora instale o webhook e a tag.`
    );
    onOpenChange(false);
    router.push('/instalacao');
  };

  /** Etapa 1 → etapa 2. Só na criação. */
  const avancar = () => {
    if (!form.nome.trim()) return toast.error('Informe o nome da empresa.');
    setErro('');
    setEtapa(2);
    // O nome do Pixel comeca igual ao da empresa: e o que o operador escreveria
    // de qualquer jeito quando so existe um Pixel.
    setForm((f) => ({ ...f, pixelNome: f.pixelNome || f.nome.trim() }));
  };

  /** Modo edição: grava a empresa e pronto. Pixel não passa por aqui. */
  const salvarEdicao = async () => {
    if (!form.nome.trim()) return toast.error('Informe o nome da empresa.');
    setSalvando(true);
    setErro('');
    try {
      await salvarEmpresa(entrada());
      onOpenChange(false);
      toast.success('Empresa salva.');
    } catch (e) {
      // A mensagem do servidor e escrita para humano ("Já existe uma empresa com
      // o apelido …") e diz exatamente qual campo corrigir. Uma frase minha por
      // cima so apagaria essa informacao.
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a empresa.');
    } finally {
      setSalvando(false);
    }
  };

  /** Modo criação: empresa → empresa ativa → primeiro Pixel. Nesta ordem. */
  const salvarTudo = async () => {
    if (!form.pixelId.trim()) return toast.error('Informe o Pixel ID.');

    setSalvando(true);
    setErro('');
    try {
      const nova = criada ?? (await salvarEmpresa(entrada()));
      // Guardar ANTES do Pixel: a partir daqui a empresa existe em disco, e
      // qualquer falha adiante e falha de Pixel, nao de empresa.
      setCriada(nova);

      try {
        await gravarPixel(nova.id);
      } catch (e) {
        // 🔴 A empresa JA EXISTE. Nao existe "tentar tudo de novo": repetir o
        // fluxo inteiro criaria uma segunda empresa com o mesmo nome, e desfazer
        // a primeira seria apagar dados que o operador acabou de criar por causa
        // de um erro que pode ser so o token colado errado. O dialogo fica
        // aberto na etapa 2, dizendo o que ja esta feito e o que falta.
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar o Pixel.');
        return;
      }

      concluir(form.pixelNome.trim() || nova.nome);
    } catch (e) {
      // Falhou a propria empresa: nada foi criado. O erro e de campo da etapa 1,
      // entao a etapa 1 e para onde o operador precisa voltar.
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a empresa.');
      setEtapa(1);
    } finally {
      setSalvando(false);
    }
  };

  /** Saída do estado de recuperação: a empresa fica, o Pixel se resolve depois. */
  const pularPixel = () => {
    onOpenChange(false);
    toast.message('Empresa criada sem Pixel.', {
      description: 'Cadastre o Pixel dela em Pixels para poder disparar.',
    });
    router.push('/pixels');
  };

  /* ---------------------------------------------------------------- */
  /* Tela                                                              */
  /* ---------------------------------------------------------------- */

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {/* `empresa &&` e nao `editando &&`: o booleano derivado nao estreita
                o tipo para o `tsc`, e aqui o estreitamento e o que garante que
                o titulo nunca leia o nome de uma empresa ausente. */}
            {empresa ? `Editar ${empresa.nome}` : 'Nova empresa'}
          </DialogTitle>
          <DialogDescription>
            {editando
              ? 'Nome, logo, apelido da URL e cor. O Pixel desta empresa se edita em Pixels.'
              : 'Uma empresa é dona dos Pixels, do webhook e da tag dela. Nada se mistura entre empresas.'}
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de etapa. Sem componente novo: o Stepper do console le o
            `useEventStore` do disparo manual e nao serve aqui. Duas etapas cabem
            numa linha de texto com os dois rotulos escritos por extenso — quem
            esta na etapa 2 precisa saber o que ficou para tras. */}
        {!editando && (
          <ol
            aria-label="Etapas da criação"
            className="flex items-center gap-2 text-caption"
          >
            {[
              { n: 1 as const, titulo: 'A empresa' },
              { n: 2 as const, titulo: 'O primeiro Pixel' },
            ].map((e) => (
              <li key={e.n} className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className={
                    etapa === e.n
                      // Etapa atual: tinta cheia com o numero em `surface-0`.
                      // A tinta do v4 e CLARA (L 0.80), entao o numero inverte
                      // — branco sobre ela daria ~1.7:1 e o degrau atual
                      // sumiria dentro da propria pastilha.
                      ? 'flex size-6 shrink-0 items-center justify-center rounded-full border border-tinta-texto bg-tinta font-mono font-bold text-surface-0'
                      : 'flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 font-mono font-bold text-fg-muted'
                  }
                >
                  {e.n}
                </span>
                <span
                  className={
                    etapa === e.n
                      ? 'font-semibold text-fg-strong'
                      : 'text-fg-muted'
                  }
                >
                  Etapa {e.n} de 2 · {e.titulo}
                  {etapa === e.n && <span className="sr-only"> (atual)</span>}
                </span>
                {e.n === 1 && (
                  <span aria-hidden className="text-fg-muted">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {/* O erro do servidor fica NA TELA, nao num toast: ele some sozinho e
            aqui ele precisa continuar visivel enquanto o campo e corrigido. */}
        {erro && (
          <Callout tone="danger" icon={AlertTriangle} title="Não foi possível concluir">
            {erro}
          </Callout>
        )}

        {/* A frase que diz o que sobrou de pe quando o passo 3 falha. Sem ela o
            operador fecha o dialogo achando que nada aconteceu — e cria a mesma
            empresa de novo. */}
        {criada && (
          <Callout tone="warning" icon={AlertTriangle}>
            A empresa <strong>{criada.nome}</strong> já foi criada e está salva.
            Falta só o Pixel dela.
          </Callout>
        )}

        {etapa === 1 ? (
          <div className="flex flex-col gap-4">
            <Field
              id="empresa-nome"
              label="Nome"
              required
              helper="Como esta empresa aparece no seletor do cabeçalho."
            >
              <Input
                id="empresa-nome"
                autoFocus
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Código Vencedor"
                aria-describedby={descrito('empresa-nome', true, false)}
                maxLength={60}
              />
            </Field>

            <Field
              id="empresa-logo"
              label="Foto ou logo"
              error={erroLogo || undefined}
              helper="PNG, JPEG, SVG ou WebP, até 150 KB. Sem imagem, o avatar usa as iniciais."
            >
              <div className="flex items-center gap-3">
                {/* Prévia redonda: é assim que o logo vai aparecer no seletor,
                    então é assim que ele é mostrado aqui. */}
                <span
                  aria-hidden
                  className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-control bg-surface-2 text-label font-semibold text-white"
                  style={previa ? undefined : { backgroundColor: form.cor }}
                >
                  {previa ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previa}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    iniciais(form.nome)
                  )}
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Input
                    id="empresa-logo"
                    ref={refArquivo}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={escolherLogo}
                    aria-describedby={descrito('empresa-logo', true, Boolean(erroLogo))}
                    className="h-auto cursor-pointer px-0 py-0 text-caption file:mr-3 file:cursor-pointer file:rounded-l-control file:border-0 file:bg-surface-3 file:px-3 file:py-2.5 file:text-label file:font-medium file:text-fg-body"
                  />
                  {form.logoDataUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={removerLogo}
                      className="self-start"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Remover imagem
                    </Button>
                  )}
                </div>
              </div>
            </Field>

            <Field
              id="empresa-plataforma"
              label="Plataforma de vendas"
              helper="Aparece nos textos de instalação do webhook desta empresa."
            >
              <Input
                id="empresa-plataforma"
                value={form.plataforma}
                onChange={(e) => setForm({ ...form, plataforma: e.target.value })}
                placeholder="xWinner, Hotmart, Kiwify…"
                aria-describedby={descrito('empresa-plataforma', true, false)}
                maxLength={40}
              />
            </Field>

            <Field
              id="empresa-slug"
              label="Apelido da URL"
              helper="Vai na URL do webhook desta empresa. Só minúsculas, dígitos e hífen."
            >
              <Input
                id="empresa-slug"
                value={slugEfetivo}
                onChange={(e) => {
                  setSlugTocado(true);
                  setForm({ ...form, slug: e.target.value });
                }}
                // Normalizar ao sair do campo, e nao a cada tecla: normalizando
                // durante a digitacao o hifen que o operador acabou de escrever
                // some antes da proxima letra e o campo parece quebrado.
                onBlur={() => setForm((f) => ({ ...f, slug: normalizarRotulo(slugEfetivo) }))}
                placeholder="codigo-vencedor"
                className="font-mono"
                aria-describedby={descrito('empresa-slug', true, false)}
                spellCheck={false}
              />
            </Field>

            <Field
              id="empresa-cor"
              label="Cor"
              helper="Cor do avatar quando a empresa não tem logo."
            >
              <div className="flex items-center gap-3">
                <Input
                  id="empresa-cor"
                  type="color"
                  value={form.cor || corInicial()}
                  onChange={(e) => setForm({ ...form, cor: e.target.value })}
                  aria-describedby={descrito('empresa-cor', true, false)}
                  className="w-20 cursor-pointer px-1 py-1"
                />
                <span className="font-mono text-caption text-fg-muted">{form.cor}</span>
              </div>
            </Field>

            {/* So na CRIACAO. Na edicao isto ja aconteceu ha tempos e viraria
                ruido permanente. O aviso existe porque a empresa nova nasce com
                credencial propria de recebimento, e quem nao sabe disso tenta
                cadastrar na plataforma do cliente novo a URL do cliente antigo
                — o evento chega, mas na caixa da empresa errada. */}
            <Callout tone="info" icon={KeyRound}>
              Cada empresa tem o próprio segredo de webhook e a própria chave de
              tag. Eles aparecem em Instalação.
            </Callout>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field
              id="empresa-pixel-nome"
              label="Nome do Pixel"
              required
              helper="Como este Pixel aparece na lista de Pixels."
            >
              <Input
                id="empresa-pixel-nome"
                autoFocus
                value={form.pixelNome}
                onChange={(e) => setForm({ ...form, pixelNome: e.target.value })}
                placeholder={form.nome.trim() || 'Código Vencedor'}
                aria-describedby={descrito('empresa-pixel-nome', true, false)}
              />
            </Field>

            <Field
              id="empresa-pixel-id"
              label="Pixel ID"
              param="pixel_id"
              required
              helper="Gerenciador de Eventos → Fontes de dados → o número abaixo do nome."
            >
              <Input
                id="empresa-pixel-id"
                value={form.pixelId}
                onChange={(e) => setForm({ ...form, pixelId: e.target.value })}
                placeholder="1624114999139319"
                className="font-mono tabular"
                inputMode="numeric"
                aria-describedby={descrito('empresa-pixel-id', true, false)}
              />
            </Field>

            <Field
              id="empresa-pixel-token"
              label="Token de acesso"
              helper="Gerenciador de Eventos → Configurações → API de Conversões → Gerar token."
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setVerToken((v) => !v)}
                  aria-label={verToken ? 'Ocultar o token' : 'Mostrar o token'}
                >
                  {verToken ? (
                    <EyeOff className="size-3.5" aria-hidden />
                  ) : (
                    <Eye className="size-3.5" aria-hidden />
                  )}
                  {verToken ? 'Ocultar' : 'Mostrar'}
                </Button>
              }
            >
              <Input
                id="empresa-pixel-token"
                type={verToken ? 'text' : 'password'}
                value={form.token}
                onChange={(e) => setForm({ ...form, token: e.target.value })}
                placeholder="EAAG..."
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                aria-describedby={descrito('empresa-pixel-token', true, false)}
              />
            </Field>

            <Field
              id="empresa-pixel-teste"
              label="Código de teste"
              param="test_event_code"
              helper="Com ele preenchido, nada entra nas métricas reais."
            >
              <Input
                id="empresa-pixel-teste"
                value={form.testCode}
                onChange={(e) => setForm({ ...form, testCode: e.target.value })}
                placeholder="TEST12345"
                className="font-mono"
                aria-describedby={descrito('empresa-pixel-teste', true, false)}
              />
            </Field>

            <Callout tone="info" icon={ShieldCheck}>
              O token fica no servidor e nunca volta inteiro para a tela.
            </Callout>
          </div>
        )}

        <DialogFooter className="flex-row justify-end gap-2">
          {editando ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={salvarEdicao} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </Button>
            </>
          ) : etapa === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={avancar}>Continuar</Button>
            </>
          ) : criada ? (
            // Estado de recuperacao: a empresa existe, o Pixel nao. Os dois
            // caminhos que sobram — e "cancelar" nao e um deles, porque nao ha o
            // que cancelar.
            <>
              <Button variant="outline" onClick={pularPixel} disabled={salvando}>
                Pular por agora
              </Button>
              <Button onClick={salvarTudo} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Tentar de novo'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEtapa(1)} disabled={salvando}>
                Voltar
              </Button>
              <Button onClick={salvarTudo} disabled={salvando}>
                {salvando ? 'Criando…' : 'Criar empresa'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EmpresaDialog;
