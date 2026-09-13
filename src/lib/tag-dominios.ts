/**
 * Registro dos dominios do cliente e o DNS que faz a tag ser primeira parte.
 *
 * Modelo Stape.io: o cliente aponta um subdominio DELE (ex.: tk.loja.com.br)
 * para o nosso servidor. A partir dai o coletor responde dentro do dominio do
 * proprio site, e nao como terceiro.
 *
 * Por que isso vale dinheiro: como terceiro, a tag morre no bloqueador de
 * anuncio e o Safari (ITP) apaga o cookie em 7 dias — o visitante que voltou no
 * dia 10 vira uma pessoa nova, o fbp se perde e o Purchase que o webhook manda
 * depois nao encontra atribuicao. Como primeira parte, o cookie dura e a venda
 * continua colada na campanha que a gerou.
 *
 * Arquivo puro de proposito: sem I/O e sem 'server-only', porque a tela de
 * cadastro de dominios valida e mostra o registro DNS no navegador, usando
 * exatamente as mesmas funcoes que o coletor usa no servidor. Duas copias da
 * regra de dominio seria uma copia errada.
 */

/** Tamanho maximo de um nome de dominio completo (limite do proprio DNS). */
const MAX_HOST = 253;

const RE_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const RE_ROTULO_DNS = /^[a-z0-9-]+$/;

/**
 * Um dominio autorizado a mandar evento para o coletor publico.
 *
 * `ultimoHit` e o unico jeito honesto de responder "o cliente instalou a tag?":
 * enquanto ele estiver vazio, nenhuma requisicao chegou desse Origin — nao
 * adianta olhar campanha, nao ha coleta acontecendo.
 */
export interface DominioTag {
  /** crypto.randomUUID() — gerado por quem cadastra, nao por este arquivo. */
  id: string;
  /** Ex.: 'codigovencedor.com.br'. Sem esquema, sem barra, minusculo. */
  host: string;
  /** Ex.: 'tk'. O rotulo que o cliente cria no DNS dele. Vazio = usa o nosso. */
  subdominio?: string;
  /** ISO. */
  criadoEm: string;
  /** ISO do ultimo hit recebido deste Origin. Vazio = tag nunca chamou. */
  ultimoHit?: string;
  hits: number;
}

/**
 * Bloco de configuracao da tag do navegador.
 *
 * `chave` e PUBLICA de proposito: ela viaja dentro do GTM, onde qualquer
 * visitante le. Ela NAO e o segredo de entrada do webhook — se os dois se
 * misturarem, qualquer um forja um Purchase. Ver Integracoes.tag.
 */
export interface ConfigTag {
  chave: string;
  dominios: DominioTag[];
}

/* ------------------------------------------------------------------ */
/* Normalizacao e validacao do dominio                                 */
/* ------------------------------------------------------------------ */

/**
 * Aceita o que o operador colou (URL inteira, com www, com porta, com barra)
 * e devolve so o host. Nao valida, normaliza — o par e `erroDoDominio`.
 *
 * Existe porque o operador cola da barra de endereco do navegador. Guardar
 * 'https://www.loja.com.br/obrigado?x=1' como host faria a comparacao de Origin
 * falhar para sempre, e o cliente veria a tag instalada sem coletar nada.
 */
export function normalizarDominio(v: string): string {
  let s = String(v ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // esquema
  s = s.split(/[/?#]/)[0]; // caminho, query, fragmento
  const arroba = s.lastIndexOf('@'); // usuario:senha@
  if (arroba >= 0) s = s.slice(arroba + 1);
  const entreColchetes = s.match(/^\[([^\]]*)\](?::\d+)?$/);
  if (entreColchetes) {
    // Forma '[::1]:8080': o IPv6 fica inteiro para `erroDoDominio` recusar com
    // a mensagem certa, em vez de virar lixo sem sentido.
    s = entreColchetes[1];
  } else {
    // So tira a porta quando sobrou um unico ':' — assim '::1' nao vira ':'.
    s = s.replace(/^([^:]+):\d+$/, '$1');
  }
  s = s.replace(/^www\./, '');
  s = s.replace(/\.+$/, ''); // ponto final da raiz DNS
  return s;
}

/** Endereco IPv6 escrito na mao: so digitos hexa, ':' e '.'. */
function ehIpv6(host: string): boolean {
  return host.includes(':') && /^[0-9a-f:.]+$/.test(host);
}

/**
 * Erro legivel, ou null se o dominio serve. Espera o host ja normalizado.
 *
 * Cada recusa aqui e uma linha a menos na lista branca do coletor: dominio mal
 * formado nunca casaria com Origin nenhum, e o cliente ficaria esperando dados
 * de uma tag que o servidor recusa em silencio.
 */
export function erroDoDominio(v: string): string | null {
  const host = String(v ?? '').trim();
  if (!host) return 'Informe o domínio do site do cliente.';
  if (host.includes('*')) return 'Curinga não vale: cadastre o domínio exato.';
  if (host.length > MAX_HOST) return `Máximo de ${MAX_HOST} caracteres.`;
  if (RE_IPV4.test(host) || ehIpv6(host)) {
    return 'Endereço de IP não serve: a tag precisa de um nome de domínio.';
  }
  if (host === 'localhost') {
    return 'localhost só existe na máquina de quem testa — use o domínio público.';
  }
  if (!host.includes('.')) {
    return 'Falta o ponto: escreva o domínio completo, como codigovencedor.com.br.';
  }
  for (const rotulo of host.split('.')) {
    if (!rotulo) return 'Há um ponto sobrando no domínio.';
    // [a-z0-9-] ja elimina por construcao '/', '..', espaco, '<' e aspas: o host
    // nunca vira travessia de caminho, HTML injetado nem casamento torto de sufixo.
    if (!RE_ROTULO_DNS.test(rotulo)) return 'Só minúsculas, dígitos, hífen e ponto.';
    if (rotulo.startsWith('-') || rotulo.endsWith('-')) {
      return 'Nenhuma parte do domínio pode começar ou terminar com hífen.';
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Host da tag e host da nossa base                                    */
/* ------------------------------------------------------------------ */

/**
 * Host de PUBLIC_BASE_URL. Diferente de `normalizarDominio`, NAO tira 'www.':
 * a base e endereco nosso, tem que sair daqui identica ao que o navegador vai
 * mandar no Origin, ou o CORS do coletor recusa a nossa propria pagina.
 */
function hostDeBase(base: string): string {
  const v = String(base ?? '')
    .trim()
    .toLowerCase();
  if (!v) return '';
  try {
    return new URL(v).hostname.replace(/\.+$/, '');
  } catch {
    // O .env pode trazer so o host, sem 'https://'. Derruba caminho e porta na mao.
    return v
      .split(/[/?#]/)[0]
      .replace(/^([^:]+):\d+$/, '$1')
      .replace(/\.+$/, '');
  }
}

/** Subdominio limpo do registro, ou '' quando o cliente ainda nao criou o DNS. */
function subdominioDe(d: DominioTag): string {
  return String(d?.subdominio ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');
}

/**
 * Host que a tag vai chamar no navegador do visitante.
 *
 * Com subdominio: primeira parte, cookie sobrevive ao ITP e ao bloqueador.
 * Sem subdominio: cai no nosso dominio atual, que funciona hoje mas continua
 * sendo terceiro — a tag coleta menos, e nunca deve ficar apontando para um
 * subdominio do cliente que ainda nao tem certificado (ai nao coleta nada).
 */
export function hostDaTag(d: DominioTag, baseFallback: string): string {
  const sub = subdominioDe(d);
  const host = String(d?.host ?? '').trim().toLowerCase();
  if (sub && host) return `${sub}.${host}`;
  return hostDeBase(baseFallback);
}

/* ------------------------------------------------------------------ */
/* Lista branca de Origin (a tranca do endpoint publico)               */
/* ------------------------------------------------------------------ */

/**
 * Recebe o cabecalho Origin cru e devolve o valor exato para ecoar em
 * Access-Control-Allow-Origin, ou null quando a origem nao esta autorizada.
 *
 * ESTA COMPARACAO DE SUFIXO E A TRANCA DO ENDPOINT PUBLICO. O coletor nao tem
 * senha — a chave da tag e publica, qualquer visitante le no GTM. O unico
 * filtro que sobra e este. Errar o sufixo abre o coletor para QUALQUER site da
 * internet enviar evento em nome do cliente, e o pixel passa a aprender com
 * trafego que nao e nosso.
 *
 * Por isso o casamento e host identico OU sufixo com ponto ('.' + host):
 * 'loja.com.br' e 'tk.loja.com.br' passam; 'malloja.com.br' NAO passa. Um
 * `endsWith(host)` solto, sem o ponto, deixaria o atacante registrar
 * 'malloja.com.br' e entrar.
 */
export function origemPermitida(
  origin: string | null,
  dominios: DominioTag[],
  base: string
): string | null {
  const cru = String(origin ?? '').trim();
  if (!cru) return null;
  let u: URL;
  try {
    u = new URL(cru);
  } catch {
    // Origin que nao e URL (ex.: 'null' de iframe sandbox) nunca e autorizado.
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/\.+$/, '');
  const ehLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';

  // So https: em http o cookie de primeira parte e o fbc viajam em texto claro,
  // e o navegador ja bloquearia a chamada vinda de uma pagina segura.
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ehLocal)) return null;

  // Excecao unica: a maquina do proprio operador, para conferir a tag antes de
  // mandar para o cliente. Nenhum site publico consegue se apresentar assim.
  if (ehLocal) return u.origin;

  const alvos = [
    hostDeBase(base),
    ...(Array.isArray(dominios) ? dominios : []).map((d) =>
      String(d?.host ?? '')
        .trim()
        .toLowerCase()
    ),
  ];
  for (const alvo of alvos) {
    if (!alvo) continue;
    if (host === alvo || host.endsWith('.' + alvo)) {
      // u.origin e a forma canonica do proprio cabecalho recebido: e isso que o
      // navegador compara. Ecoar outra coisa derruba a resposta no CORS.
      return u.origin;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Registro DNS para o cliente criar                                   */
/* ------------------------------------------------------------------ */

/** Uma linha de DNS, do jeito que o painel do cliente pede os campos. */
export interface RegistroDns {
  tipo: 'CNAME';
  /** So o rotulo, ex.: 'tk' — a maioria dos paineis completa o resto sozinha. */
  nome: string;
  /** Para onde aponta: o host da nossa base. */
  valor: string;
  ttl: string;
  proxy: string;
  observacao: string;
}

/**
 * Registro que o cliente precisa criar, ou null quando ainda nao ha subdominio
 * escolhido (nesse caso nao ha DNS nenhum a fazer: a tag usa o dominio atual).
 */
export function registroDnsDe(d: DominioTag, base: string): RegistroDns | null {
  const sub = subdominioDe(d);
  const host = String(d?.host ?? '').trim().toLowerCase();
  if (!sub || !host) return null;
  const valor = hostDeBase(base);
  return {
    tipo: 'CNAME',
    nome: sub,
    valor,
    ttl: 'Automático',
    // Nuvem cinza: com o proxy laranja da Cloudflare ligado, quem apresenta o
    // certificado passa a ser a Cloudflare e o IP que chega ate nos vira o dela,
    // nao o do visitante — o evento perde o client_ip_address e o EMQ cai.
    proxy: 'DNS only (nuvem cinza)',
    observacao:
      `O certificado TLS de ${sub}.${host} precisa existir no nosso servidor ` +
      `antes de a tag funcionar nesse endereço; até lá a tag deve continuar ` +
      `apontando para ${valor}.`,
  };
}

/**
 * Bloco de texto pronto para o operador copiar e mandar ao cliente por WhatsApp
 * ou e-mail. Sem jargao: quem le costuma ser o dono do site, nao quem cuida de
 * DNS. Texto confuso vira semana parada esperando um registro de uma linha.
 */
export function textoDnsParaCliente(d: DominioTag, base: string): string {
  const host = String(d?.host ?? '').trim().toLowerCase();
  const reg = registroDnsDe(d, base);
  if (!reg) {
    return (
      `Nada a fazer no DNS de ${host || 'seu domínio'} por enquanto.\n\n` +
      `A medição está funcionando pelo nosso endereço (${hostDeBase(base)}).\n` +
      `Quando quiser que a medição passe a responder dentro do seu próprio ` +
      `domínio — o que faz os dados durarem mais no navegador do visitante — ` +
      `escolhemos juntos um subdomínio (por exemplo tk.${host || 'seudominio.com.br'}) ` +
      `e mandamos o registro para você criar.`
    );
  }
  const completo = `${reg.nome}.${host}`;
  return [
    `Configuração de DNS — ${host}`,
    '',
    `Para a medição das campanhas funcionar no seu site, é preciso criar 1 (um)`,
    `registro no painel onde o domínio ${host} está hospedado (Cloudflare,`,
    `Registro.br, GoDaddy, Hostinger, etc.), na área de "DNS" ou "Zona DNS".`,
    '',
    'Copie exatamente assim:',
    '',
    `Tipo: ${reg.tipo}`,
    `Nome (ou Host): ${reg.nome}`,
    `Aponta para (Destino/Valor): ${reg.valor}`,
    `TTL: ${reg.ttl}`,
    `Proxy: ${reg.proxy}`,
    '',
    'Observações importantes:',
    `- Se o painel for da Cloudflare, deixe a nuvem CINZA (DNS only). Com a nuvem`,
    `  laranja ligada, a medição perde a localização real do visitante.`,
    `- Não é preciso mexer em mais nada: o site continua funcionando igual. Esse`,
    `  registro cria apenas o endereço ${completo}, usado só pela medição.`,
    `- ${reg.observacao}`,
    '',
    `Assim que você criar, me avise: eu confirmo que ${completo} já responde e`,
    `ativo a medição por esse endereço. Costuma valer em poucos minutos, mas o`,
    `DNS pode levar até algumas horas para se espalhar.`,
  ].join('\n');
}
