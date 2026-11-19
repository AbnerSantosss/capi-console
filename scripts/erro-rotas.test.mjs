/**
 * T-M09 — as rotas e as telas não mandam mensagem técnica para quem usa.
 *
 * Estático: lê o fonte. Não sobe servidor, não lê `.env`, não fala com a Meta.
 *
 * Uso: npm run test:erro-rotas
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

let falhas = 0;
function ok(cond, texto, detalhe = '') {
  if (cond) {
    console.log(`  OK  ${texto}`);
  } else {
    falhas++;
    console.error(`  FALHOU  ${texto}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

const fonte = (rel) => fs.readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

const ROTAS = [
  'src/app/api/enviar/route.ts',
  'src/app/api/enviar-teste/route.ts',
  'src/app/api/inbox/disparar/route.ts',
  'src/app/api/tag/gerar/route.ts',
  'src/app/api/fila-disparo/route.ts',
];

/** Pedaços que só existem quando a mensagem técnica está indo para a tela. */
const VAZAMENTOS = [
  [/Erro interno/, 'o texto "Erro interno"'],
  [/Erro desconhecido/, 'o texto "Erro desconhecido"'],
  [/Falha ao conferir a sessão/, 'o texto "Falha ao conferir a sessão"'],
  [/String\((e|err)\)/, 'String(e) ou String(err)'],
  [/falar com a Meta: \$\{/, 'a mensagem técnica colada depois de "falar com a Meta"'],
  [/error_user_msg/, 'o texto cru da Meta (error_user_msg)'],
];

console.log('\n  1. As 5 rotas usam erroDeRota e não vazam mensagem técnica');
for (const rel of ROTAS) {
  const f = fonte(rel);
  ok(/from '@\/lib\/erro-api'/.test(f), `${rel}: importa de @/lib/erro-api`);
  ok(/\berroDeRota\(/.test(f), `${rel}: o catch do fim chama erroDeRota`);
  for (const [re, nome] of VAZAMENTOS) {
    ok(!re.test(f), `${rel}: não tem ${nome}`);
  }
}

console.log('\n  2. A recusa da Meta sai pela tabela de erro-meta.ts');
{
  const enviar = fonte('src/app/api/enviar/route.ts');
  const teste = fonte('src/app/api/enviar-teste/route.ts');
  ok(/textoDoErroDaMeta\(lerErroDaMeta\(/.test(enviar), '/api/enviar traduz a recusa (campo erroDaMeta)');
  ok(/\berroDaMeta\b/.test(enviar), '/api/enviar devolve erroDaMeta');
  ok(/textoDoErroDaMeta\(lerErroDaMeta\(/.test(teste), '/api/enviar-teste traduz a recusa');
  ok(/SEM_RESPOSTA_DA_META/.test(enviar) && /SEM_RESPOSTA_DA_META/.test(teste), 'rede fora usa a mesma frase nas duas rotas');
}

console.log('\n  3. As telas mostram a frase traduzida');
{
  const fila = fonte('src/components/integrations/InboxList.tsx');
  const formulario = fonte('src/components/dispatch/useDisparo.ts');
  ok(/function textoDaFalha\(/.test(fila) && /textoDoErroDaMeta\(/.test(fila), 'a Fila tem textoDaFalha e usa a tabela');
  ok(!/primeiro\.erro/.test(fila), 'a Fila não monta mais o aviso com o texto cru (primeiro.erro)');
  ok(!/\{r\.erro\}/.test(fila), 'o detalhe do item não imprime mais r.erro cru');
  ok(/dados\.erroDaMeta/.test(formulario), 'o envio manual lê erroDaMeta antes do texto cru');
}

console.log('\n  4. A frase de "a Meta nem respondeu" existe e está em português');
{
  const lib = fonte('src/lib/erro-meta.ts');
  ok(
    /export const SEM_RESPOSTA_DA_META = 'Não foi possível falar com a Meta\. Tente de novo em alguns minutos\.';/.test(lib),
    'SEM_RESPOSTA_DA_META tem o texto combinado'
  );
}

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
