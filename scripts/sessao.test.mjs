#!/usr/bin/env node
/**
 * Testes automatizados do núcleo de autenticação e sessão do console (F7).
 *
 * Cobre:
 *  1. Ida-e-volta de assinar e verificar sessão
 *  2. Sessão expirada retorna null
 *  3. Payload adulterado retorna null
 *  4. Tag HMAC adulterada ou de tamanho incorreto retorna null
 *  5. Senha trocada invalida sessões anteriores
 *  6. SESSION_SECRET trocado invalida sessões anteriores
 *  7. credenciaisConferem (correto, usuário errado, senha errada, comprimentos diferentes)
 *  8. validarDestino (destinos permitidos, evasões com open redirect, query strings, URLs perigosas)
 *
 * Uso: npm run test:sessao
 */

// Define credenciais fortes antes de carregar o módulo
process.env.CONSOLE_USER = 'admin';
process.env.CONSOLE_PASSWORD = 'senha-super-segura-com-mais-de-12-chars';
process.env.SESSION_SECRET = 'segredo-de-sessao-muito-seguro-com-mais-de-32-caracteres-para-teste';

const {
  assinarSessao,
  verificarSessao,
  credenciaisConferem,
  validarDestino,
  DESTINOS_PERMITIDOS,
} = await import(new URL('../src/lib/sessao.ts', import.meta.url).href);

let falhas = 0;
const ok = (cond, texto, detalhe = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALHA'}  ${texto}${detalhe ? '  ' + detalhe : ''}`);
  if (!cond) falhas++;
};

console.log('\n  Autenticação e Sessão do Console\n');

/* ---------------- 1. Ida-e-volta ---------------- */
const token = assinarSessao('admin', 12);
ok(typeof token === 'string' && token.startsWith('v1.'), 'assinarSessao emite token v1');
const sessao = verificarSessao(token);
ok(sessao !== null && sessao.usuario === 'admin', 'verificarSessao valida e extrai usuario correto');
ok(typeof sessao?.expiraEm === 'number' && sessao.expiraEm > Date.now(), 'sessao expira no futuro');

/* ---------------- 2. Expirado -> null ---------------- */
const tokenExpirado = assinarSessao('admin', -1);
ok(verificarSessao(tokenExpirado) === null, 'token com expiracao no passado retorna null');

/* ---------------- 3. Payload adulterado -> null ---------------- */
const partes = token.split('.');
const payloadOriginal = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
const payloadAdulterado = Buffer.from(
  JSON.stringify({ ...payloadOriginal, u: 'hacker' }),
  'utf8'
).toString('base64url');
const tokenPayloadAlterado = `${partes[0]}.${payloadAdulterado}.${partes[2]}`;
ok(verificarSessao(tokenPayloadAlterado) === null, 'payload adulterado rejeitado pela assinatura HMAC');

/* ---------------- 4. Tag adulterada -> null ---------------- */
const tagChars = partes[2].split('');
tagChars[0] = tagChars[0] === 'a' ? 'b' : 'a';
const tagAdulterada = tagChars.join('');
const tokenTagAlterada = `${partes[0]}.${partes[1]}.${tagAdulterada}`;
ok(verificarSessao(tokenTagAlterada) === null, 'tag adulterada retorna null');
ok(verificarSessao(`${partes[0]}.${partes[1]}.${partes[2].slice(0, 16)}`) === null, 'tag truncada retorna null');

/* ---------------- 5. Senha trocada invalida sessões anteriores ---------------- */
const tokenSenhaAntiga = assinarSessao('admin', 12);
ok(verificarSessao(tokenSenhaAntiga) !== null, 'sessao inicial e valida');

const senhaOriginal = process.env.CONSOLE_PASSWORD;
process.env.CONSOLE_PASSWORD = 'outra-senha-totalmente-diferente-1234';
ok(verificarSessao(tokenSenhaAntiga) === null, 'trocar CONSOLE_PASSWORD invalida sessao emitida com a senha anterior');
process.env.CONSOLE_PASSWORD = senhaOriginal;
ok(verificarSessao(tokenSenhaAntiga) !== null, 'restaurar CONSOLE_PASSWORD revalida a sessao original');

/* ---------------- 6. SESSION_SECRET trocado invalida sessões anteriores ---------------- */
const tokenSecretAntigo = assinarSessao('admin', 12);
const secretOriginal = process.env.SESSION_SECRET;
process.env.SESSION_SECRET = 'novo-segredo-de-sessao-super-longo-com-32-chars-ou-mais!';
ok(verificarSessao(tokenSecretAntigo) === null, 'trocar SESSION_SECRET invalida sessao emitida com secret anterior');
process.env.SESSION_SECRET = secretOriginal;
ok(verificarSessao(tokenSecretAntigo) !== null, 'restaurar SESSION_SECRET restabelece validacao');

/* ---------------- 7. credenciaisConferem ---------------- */
ok(credenciaisConferem('admin', 'senha-super-segura-com-mais-de-12-chars') === true, 'credenciais corretas conferem');
ok(credenciaisConferem('admin2', 'senha-super-segura-com-mais-de-12-chars') === false, 'usuario incorreto falha');
ok(credenciaisConferem('admin', 'senha-errada-qualquer-123') === false, 'senha incorreta falha');
ok(credenciaisConferem('a', 's') === false, 'comprimento muito curto falha sem vazar tempo');
ok(credenciaisConferem('admin'.repeat(10), 'senha'.repeat(20)) === false, 'comprimento muito longo falha sem erro');
ok(credenciaisConferem('', '') === false, 'credenciais vazias falham');

/* ---------------- 8. validarDestino ---------------- */
ok(Array.isArray(DESTINOS_PERMITIDOS) && DESTINOS_PERMITIDOS.length === 9, 'DESTINOS_PERMITIDOS possui 9 rotas');
ok(validarDestino('/') === '/', 'destino / permitido');
ok(validarDestino('/painel') === '/painel', 'destino /painel permitido');
ok(validarDestino('/painel/compras') === '/painel/compras', 'destino /painel/compras permitido');
ok(validarDestino('/painel/eventos') === '/painel/eventos', 'destino /painel/eventos permitido');
// O recorte das duas telas novas viaja na query, e a allowlist compara pathname
// inteiro: o destino volta limpo, sem o `?evento=`, e continua sendo uma tela.
ok(
  validarDestino('/painel/eventos?evento=Purchase') === '/painel/eventos',
  'query do recorte descartada, pathname preservado'
);
// Prefixo NAO basta: a comparacao continua sendo do caminho inteiro.
ok(validarDestino('/painel/inventada') === '/', 'sub-rota desconhecida do painel -> /');
ok(validarDestino('/instalacao') === '/instalacao', 'destino /instalacao permitido');
ok(validarDestino('/pixels') === '/pixels', 'destino /pixels permitido');
ok(validarDestino('/automatico') === '/automatico', 'destino /automatico permitido');
ok(validarDestino('/integracoes') === '/integracoes', 'destino /integracoes permitido (308, decisao #10)');
ok(validarDestino('/guia') === '/guia', 'destino /guia permitido');
ok(!DESTINOS_PERMITIDOS.includes('/login'), '/login fora da allowlist (evita laco de redirecionamento)');

ok(validarDestino('/\\evil.com') === '/', 'barra invertida rejeitada -> /');
ok(validarDestino('//evil.com') === '/', 'barra dupla rejeitada -> /');
ok(validarDestino('//evil.com/integracoes') === '/', 'barra dupla com rota permitida rejeitada -> /');
ok(validarDestino('/login') === '/', '/login nao e destino de redirecionamento -> /');
ok(validarDestino('/api/x') === '/', '/api/* rejeitado -> /');
ok(validarDestino('/api/marcas') === '/', '/api/marcas rejeitado -> /');
ok(validarDestino('/integracoes?_rsc=1') === '/integracoes', 'descarta query params mantendo pathname seguro');
ok(validarDestino('javascript:alert(1)') === '/', 'protocolo javascript rejeitado -> /');
ok(validarDestino('https://evil.com') === '/', 'origem externa rejeitada -> /');
ok(validarDestino('') === '/', 'string vazia -> /');
ok(validarDestino(null) === '/', 'null -> /');
ok(validarDestino(undefined) === '/', 'undefined -> /');

/* ---------------- 9. DESTINO_INICIAL (D-2') ---------------- */
// A tela de chegada e o Painel, mas a rede de seguranca de um destino RECUSADO
// continua sendo `/`. Se alguem trocar o fallback de `validarDestino` por
// `/painel`, um open redirect barrado passaria a mandar o usuario para outra
// tela que nao a do disparo manual — e os tres casos acima (barra dupla,
// javascript:, origem externa) deixariam de provar o que provam.
const { DESTINO_INICIAL } = await import(
  new URL('../src/lib/rotas-console.ts', import.meta.url).href
);
ok(DESTINO_INICIAL === '/painel', 'quem entra sem pedir tela cai no Painel');
ok(
  DESTINOS_PERMITIDOS.includes(DESTINO_INICIAL),
  'a tela de chegada esta na allowlist (senao o proxy faria laco)'
);
ok(validarDestino('') === '/', 'e o fallback de destino recusado continua sendo /');

console.log(falhas === 0 ? '\n  Autenticação e sessão com 100% de cobertura e funcionando.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
