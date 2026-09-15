'use client';

/**
 * A lista de testes — a tela do "coloque uma medida de segurança".
 *
 * O console já reconhecia sozinho o padrão óbvio (`@example.com`,
 * `evt_preview…`, cupom de centavos). O que ele NÃO tem como adivinhar é o
 * e-mail pessoal que o testador da equipe usa para bater no checkout: esse só a
 * pessoa que opera sabe, e até agora a única forma de cadastrá-lo era editar
 * `config/integracoes.json` na mão.
 *
 * ────────────────────────────────────────────────────────────────────────
 * 🔴 ESTA TELA É A ÚNICA DO CONSOLE QUE IMPEDE UMA VENDA DE CHEGAR À META
 * ────────────────────────────────────────────────────────────────────────
 *
 * Todo o resto do produto erra para o lado de entregar demais: regra sem
 * destino fica na fila, Pixel sem token não dispara, evento sem atribuição vai
 * mesmo assim. Aqui é o contrário — o que casa com a lista é descartado, em
 * silêncio, para sempre. Por isso três coisas que parecem excesso e não são:
 *
 *   1. o nome tem piso de 3 letras (ele casa por CONTER: "a" marcaria todo
 *      comprador do Brasil como teste, e nenhum erro apareceria em lugar
 *      nenhum);
 *   2. a validação daqui é a MESMA do servidor, e roda antes do envio, para o
 *      operador ler o motivo em vez de um 400 genérico;
 *   3. cada item cadastrado aparece por extenso, com botão de remover ao lado.
 *      Lista que só some por dentro ninguém revisa.
 *
 * O que NÃO está aqui, de propósito: a suspeita por e-mail repetido não tem
 * chave de liga/desliga. Ela nunca descarta nada — só tira o automático e
 * espera um clique humano —, então o que o operador ajusta é o número de
 * compras, não a existência da regra.
 */

import { useState, type ComponentProps } from 'react';
import { FlaskConical, Mail, Plus, Repeat2, Trash2, User } from '@/components/ui/icones';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, Field, Panel, useFieldA11y } from '@/components/common/primitives';
import { EstadoVazio } from '@/components/common/EstadoVazio';
import {
  COMPRAS_PARA_SUSPEITAR,
  limiteDeCompras,
  type ListaDeTeste,
} from '@/lib/deteccao-de-teste';

/** Espelha `NOME_MIN` de `api/integracoes/route.ts`. Ver o bloco vermelho de lá. */
const NOME_MIN = 3;
const TETO_DA_LISTA = 200;

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * As mesmas duas réguas do servidor, ditas aqui em português de tela.
 * Devolvem `null` quando está tudo certo — nunca lançam, para que um item
 * torto vire mensagem embaixo do campo e não uma tela quebrada.
 */
function erroDoEmail(bruto: string, jaCadastrados: string[]): string | null {
  const v = bruto.trim().toLowerCase();
  if (!v) return 'Escreva o e-mail do testador.';
  if (!RE_EMAIL.test(v)) return 'Escreva o e-mail inteiro — a comparação é exata, um pedaço nunca casa.';
  if (jaCadastrados.some((x) => x.trim().toLowerCase() === v)) return 'Este e-mail já está na lista.';
  if (jaCadastrados.length >= TETO_DA_LISTA) return `A lista já tem ${TETO_DA_LISTA} e-mails.`;
  return null;
}

function erroDoNome(bruto: string, jaCadastrados: string[]): string | null {
  const v = bruto.trim().replace(/\s+/g, ' ');
  if (!v) return 'Escreva o nome do testador.';
  if (v.length < NOME_MIN) {
    return `O nome precisa de pelo menos ${NOME_MIN} letras — um pedaço curto marcaria compradores de verdade como teste.`;
  }
  if (jaCadastrados.some((x) => x.trim().toLowerCase() === v.toLowerCase())) return 'Este nome já está na lista.';
  if (jaCadastrados.length >= TETO_DA_LISTA) return `A lista já tem ${TETO_DA_LISTA} nomes.`;
  return null;
}

/**
 * O `Input` do `Field`, com `aria-describedby` e `aria-invalid` ligados.
 *
 * `useFieldA11y` só enxerga o contexto do `Field` a partir de um componente
 * FILHO: chamado no corpo da tela, o hook leria o contexto padrão e o campo
 * ficaria mudo para quem usa leitor de tela — a mensagem de erro existiria na
 * página sem nunca ser associada ao campo que a causou. Daí este invólucro.
 */
function CampoDoField(props: ComponentProps<typeof Input>) {
  const a11y = useFieldA11y();
  return <Input {...a11y} {...props} />;
}

/**
 * Uma linha da lista. Remover é ação de um clique e sem confirmação de
 * propósito: o estrago de remover é o oposto do estrago desta tela — volta a
 * entregar evento, que é o comportamento normal do produto —, e recadastrar
 * custa uma digitada.
 */
function Item({
  valor,
  icone: Icone,
  aoRemover,
  rotuloRemover,
}: {
  valor: string;
  icone: React.ElementType;
  aoRemover: () => void;
  rotuloRemover: string;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-control border border-line bg-surface-2 py-1.5 pr-1.5 pl-2.5">
      <Icone className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
      <span className="wrap-token min-w-0 flex-1 font-mono text-caption text-fg-body">{valor}</span>
      <Button size="icon-sm" variant="ghost" aria-label={rotuloRemover} onClick={aoRemover}>
        <Trash2 className="size-3.5 text-danger" aria-hidden />
      </Button>
    </li>
  );
}

export function ListaDeTestes({
  testes,
  onSalvar,
  salvando,
}: {
  /** Ausente é lista vazia, nunca erro: quase toda instalação nunca abriu esta aba. */
  testes: ListaDeTeste | undefined;
  onSalvar: (testes: ListaDeTeste) => void;
  salvando: boolean;
}) {
  const emails = testes?.emails ?? [];
  const nomes = testes?.nomes ?? [];

  const [novoEmail, setNovoEmail] = useState('');
  const [erroEmail, setErroEmail] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [erroNome, setErroNome] = useState<string | null>(null);

  // O campo do número é texto em estado local porque apagar para digitar outro
  // valor passa por "" — se o estado fosse numérico, o campo se recusaria a
  // ficar vazio por um instante e o operador não conseguiria trocar 3 por 4.
  const [compras, setCompras] = useState(String(testes?.comprasParaSuspeitar ?? ''));
  const [erroCompras, setErroCompras] = useState<string | null>(null);

  const limiteAtual = limiteDeCompras(testes);

  /** Toda gravação passa por aqui: a lista salva é sempre a lista inteira. */
  const gravar = (mudanca: Partial<ListaDeTeste>) => {
    onSalvar({
      emails,
      nomes,
      comprasParaSuspeitar: testes?.comprasParaSuspeitar,
      ...mudanca,
    });
  };

  const adicionarEmail = () => {
    const erro = erroDoEmail(novoEmail, emails);
    setErroEmail(erro);
    if (erro) return;
    gravar({ emails: [...emails, novoEmail.trim().toLowerCase()] });
    setNovoEmail('');
  };

  const adicionarNome = () => {
    const erro = erroDoNome(novoNome, nomes);
    setErroNome(erro);
    if (erro) return;
    gravar({ nomes: [...nomes, novoNome.trim().replace(/\s+/g, ' ')] });
    setNovoNome('');
  };

  const salvarCompras = () => {
    const bruto = compras.trim();
    // Campo vazio é uma resposta legítima: significa "use o padrão".
    if (!bruto) {
      setErroCompras(null);
      gravar({ comprasParaSuspeitar: undefined });
      return;
    }
    const n = Number(bruto);
    if (!Number.isInteger(n)) {
      setErroCompras('Use um número inteiro de compras.');
      return;
    }
    if (n < 2) {
      setErroCompras('O mínimo é 2 — com 1, toda primeira compra viraria suspeita e o produto travava.');
      return;
    }
    if (n > 50) {
      setErroCompras('O máximo é 50.');
      return;
    }
    setErroCompras(null);
    gravar({ comprasParaSuspeitar: n });
  };

  const vazia = emails.length === 0 && nomes.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Callout tone="danger" icon={FlaskConical} title="O que cai nesta lista não chega à Meta">
        E-mail ou nome cadastrado aqui vira <strong>teste</strong>: o evento fica registrado na caixa
        de entrada, some de todas as porcentagens e <strong>nunca é enviado</strong> — nem por clique,
        nem em modo automático. Cadastre só quem é da equipe.
      </Callout>

      {/* ---------------- e-mails ---------------- */}
      <Panel title="E-mails de teste" icon={Mail}>
        <p className="text-caption text-fg-muted">
          Comparação exata, sem diferença entre maiúsculas e minúsculas. O endereço inteiro, como ele
          chega da plataforma.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field
            id="novo-email-teste"
            label="E-mail"
            error={erroEmail ?? undefined}
            className="min-w-56 flex-1"
          >
            <CampoDoField
              id="novo-email-teste"
              type="email"
              value={novoEmail}
              placeholder="jairo@exemplo.com.br"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setNovoEmail(e.target.value);
                if (erroEmail) setErroEmail(null);
              }}
              // Enter adiciona: a mão já está no teclado, e obrigar o mouse
              // aqui faria o operador cadastrar um e ir embora.
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                adicionarEmail();
              }}
              className="font-mono"
            />
          </Field>
          <Button variant="outline" onClick={adicionarEmail} disabled={salvando}>
            <Plus className="size-4" aria-hidden />
            Adicionar
          </Button>
        </div>

        {emails.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {emails.map((e) => (
              <Item
                key={e}
                valor={e}
                icone={Mail}
                rotuloRemover={`Remover o e-mail ${e} da lista de testes`}
                aoRemover={() => gravar({ emails: emails.filter((x) => x !== e) })}
              />
            ))}
          </ul>
        )}
      </Panel>

      {/* ---------------- nomes ---------------- */}
      <Panel title="Nomes de teste" icon={User}>
        <p className="text-caption text-fg-muted">
          Casa por <strong className="text-fg-body">conter</strong>, sem acento e sem diferença de
          maiúsculas: cadastrar <code className="font-mono">Jairo</code> pega também{' '}
          <code className="font-mono">Jairo Silva</code>. Por isso o mínimo de {NOME_MIN} letras — um
          pedaço curto demais marcaria compradores de verdade.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field
            id="novo-nome-teste"
            label="Nome"
            error={erroNome ?? undefined}
            className="min-w-56 flex-1"
          >
            <CampoDoField
              id="novo-nome-teste"
              value={novoNome}
              placeholder="Jairo"
              autoComplete="off"
              onChange={(e) => {
                setNovoNome(e.target.value);
                if (erroNome) setErroNome(null);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                adicionarNome();
              }}
            />
          </Field>
          <Button variant="outline" onClick={adicionarNome} disabled={salvando}>
            <Plus className="size-4" aria-hidden />
            Adicionar
          </Button>
        </div>

        {nomes.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {nomes.map((n) => (
              <Item
                key={n}
                valor={n}
                icone={User}
                rotuloRemover={`Remover o nome ${n} da lista de testes`}
                aoRemover={() => gravar({ nomes: nomes.filter((x) => x !== n) })}
              />
            ))}
          </ul>
        )}
      </Panel>

      {vazia && (
        <EstadoVazio
          icone={FlaskConical}
          titulo="Nenhum testador cadastrado"
          motivo={
            <>
              O console continua barrando sozinho o padrão conhecido —{' '}
              <code className="font-mono">@example.com</code>,{' '}
              <code className="font-mono">evt_preview…</code> e cupons de centavos. O que ele não
              adivinha é o e-mail pessoal que a equipe usa para testar o checkout.
            </>
          }
          acao={
            <Button
              variant="outline"
              onClick={() => document.getElementById('novo-email-teste')?.focus()}
            >
              <Plus className="size-4" aria-hidden />
              Cadastrar o primeiro e-mail
            </Button>
          }
        />
      )}

      {/* ---------------- e-mail repetido ---------------- */}
      <Panel title="E-mail repetido em várias compras" icon={Repeat2}>
        <p className="text-caption text-fg-muted">
          Comprador de infoproduto compra uma vez. Quando o mesmo e-mail aparece em várias{' '}
          <strong className="text-fg-body">compras</strong>, o console para de disparar sozinho e
          espera você conferir.
        </p>

        {/* 🔴 A diferença entre os dois blocos desta tela, dita na tela: lá em
            cima alguém DECIDIU que é teste e o evento é descartado; aqui o
            console só REPAROU num padrão, e descartar sozinho uma venda que ele
            apenas acha que é teste é o erro caro do outro lado. */}
        <Callout tone="warning" icon={Repeat2} className="mt-3">
          Isto <strong>não descarta nada</strong>: o evento fica na fila, continua contando nos
          números e pode ser disparado por você a qualquer momento. Só o automático é suspenso.
        </Callout>

        <div className="mt-3 max-w-64">
          <Field
            id="compras-para-suspeitar"
            label="A partir de"
            helper={`Deixe vazio para usar o padrão de ${COMPRAS_PARA_SUSPEITAR}. Valendo agora: ${limiteAtual} compras.`}
            error={erroCompras ?? undefined}
          >
            <CampoDoField
              id="compras-para-suspeitar"
              type="number"
              inputMode="numeric"
              min={2}
              max={50}
              step={1}
              value={compras}
              placeholder={String(COMPRAS_PARA_SUSPEITAR)}
              onChange={(e) => {
                setCompras(e.target.value);
                if (erroCompras) setErroCompras(null);
              }}
              onBlur={salvarCompras}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                salvarCompras();
              }}
              className="tabular-nums"
            />
          </Field>
        </div>
        <p className="mt-2 text-caption text-fg-muted">
          Salvo quando você sai do campo.
        </p>
      </Panel>
    </div>
  );
}

export default ListaDeTestes;
