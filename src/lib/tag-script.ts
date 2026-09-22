/**
 * Gerador do JavaScript que o cliente cola no site dele.
 *
 * Duas saidas do MESMO nucleo: a versao GTM (HTML personalizado) e a versao
 * para colar antes de </head>. O nucleo e identico nas duas porque manter dois
 * coletores no navegador significa, um dia, corrigir um e esquecer o outro —
 * e a diferenca so aparece meses depois, num relatorio que nao bate.
 *
 * POR QUE ESTA TAG EXISTE: o webhook da plataforma de vendas nao manda PageView
 * nenhum, entao ela e a UNICA fonte de sinal de topo. Pior: e a unica fonte de
 * fbc, fbp, UTM e IP real do visitante. A venda por PIX chega horas depois,
 * pelo webhook, sem nada disso — o comprador pagou no aplicativo do banco e
 * nunca mais voltou ao navegador. Sem o que esta tag coleta na visita, o
 * Purchase que chega depois e um evento sem dono: a Meta nao sabe de qual
 * anuncio veio, e o dinheiro do trafego vira gasto sem atribuicao.
 *
 * Arquivo puro de proposito: sem I/O e sem 'server-only'. A tela do console
 * precisa mostrar o script para o operador copiar, e a rota que serve a tag
 * gera o mesmo texto no servidor. Duas copias do gerador seria uma copia
 * errada.
 *
 * ARMADILHA DE MANUTENCAO: o corpo do script gerado vive dentro de template
 * literal. NAO escreva contrabarra dentro dele — em template literal `\+` vira
 * `+` e a regex gerada chega quebrada no navegador do cliente, derrubando a
 * medicao de todo mundo de uma vez. Onde precisaria de contrabarra, use outra
 * forma (classe de caractere, comparacao de string).
 */
import type { EventoTag } from './tag-eventos';
import { EVENTOS_TAG, eventoTagPermitido } from './tag-eventos';
import { NOME_PRODUTO } from './produto';

/**
 * Versao do nucleo embutido no script.
 *
 * O navegador pode ter duas tags nossas na mesma pagina (PageView pelo HTML do
 * site e InitiateCheckout pelo GTM, por exemplo). A primeira que roda instala o
 * nucleo em window.cvtag; as outras reaproveitam. Mexeu no nucleo, suba o
 * numero — senao uma pagina com a tag antiga em cache continuaria mandando no
 * formato velho e o operador nunca saberia.
 */
const VERSAO_NUCLEO = 2;

/**
 * Eventos de formulario: so eles ganham, na tag do GTM e nas instrucoes do
 * site, o terceiro argumento de `enviar` com e-mail, telefone e nome. Num
 * PageView esse bloco seria convite para colar variavel de formulario numa
 * pagina que nao tem formulario.
 */
const COM_DADOS_DE_FORMULARIO: ReadonlySet<string> = new Set([
  'tag.lead',
  'tag.completeregistration',
]);

/** Unico objeto global que o script cria na pagina do cliente. */
const GLOBAL = 'cvtag';

/**
 * Janela de deduplicacao por evento, em milissegundos, guardada em
 * sessionStorage. 0 = pode repetir a vontade.
 *
 * Cada numero e um risco diferente: PageView e F5 e disparo duplo do GTM
 * (segundos); Lead e cadastro e o visitante que volta na mesma aba e reenvia o
 * formulario (a sessao toda); clique e duplo clique nervoso no botao de compra
 * (dois segundos). Janela larga demais engole evento real e o relatorio fica
 * menor que a realidade; estreita demais infla a conversao e o algoritmo
 * aprende com evento que nunca aconteceu.
 */
const DEDUP_MS: Readonly<Record<string, number>> = {
  'tag.pageview': 10_000,
  'tag.viewcontent': 10_000,
  'tag.lead': 86_400_000,
  'tag.completeregistration': 86_400_000,
  'tag.search': 0,
  'tag.initiatecheckout': 2_000,
  'tag.addtocart': 2_000,
  'tag.addpaymentinfo': 2_000,
  'tag.contact': 2_000,
};

/** Janela de quem nao esta no mapa: trata como clique. */
const DEDUP_PADRAO = 2_000;

/**
 * Como o evento sai sozinho quando o script roda.
 *
 * 'imediato'    — manda assim que a pagina abre (so PageView).
 * 'engajamento' — espera tempo de leitura ou rolagem (ViewContent).
 * 'manual'      — nao manda nada; quem decide o momento e o acionador do GTM
 *                 ou uma chamada do proprio site.
 */
type ModoDisparo = 'imediato' | 'engajamento' | 'manual';

const MODO: Readonly<Record<string, ModoDisparo>> = {
  'tag.pageview': 'imediato',
  'tag.viewcontent': 'engajamento',
};

/**
 * Acionador do GTM que o operador tem que escolher, no nome que aparece na
 * tela do Gerenciador de Tags. Vai impresso no cabecalho do script porque
 * acionador errado e o jeito mais comum de instalar a tag e nao coletar nada
 * (ou coletar PageView em todo clique).
 */
const ACIONADOR_GTM: Readonly<Record<string, string>> = {
  'tag.pageview': 'Inicialização - Todas as páginas (Initialization - All Pages)',
  'tag.viewcontent': 'Todas as páginas (All Pages) — o próprio script espera a leitura',
  'tag.initiatecheckout':
    'Clique - Apenas links, com Click URL contendo o endereço do checkout',
  'tag.lead': 'Envio de formulário (Form Submission)',
  'tag.addtocart': 'Clique - Todos os elementos, no botão de adicionar ao carrinho',
  'tag.search': 'Envio de formulário (Form Submission) do campo de busca',
  'tag.completeregistration':
    'Visualização de página (Page View) na URL de confirmação do cadastro',
  'tag.contact':
    'Clique - Apenas links, com Click URL contendo wa.me ou api.whatsapp.com',
  'tag.addpaymentinfo':
    'Clique - Todos os elementos, no seletor de forma de pagamento',
};

/** Opcoes de geracao de uma tag. */
export interface OpcoesTag {
  /** URL completa do coletor, ex.: 'https://tk.loja.com.br/api/tag'. */
  endpoint: string;
  /** Integracoes.tag.chave. Publica de proposito — ver o cabecalho gerado. */
  chave: string;
  /** Entrada do catalogo EVENTOS_TAG. */
  evento: EventoTag;
  /** Dominio do site do cliente, so para aparecer no cabecalho. */
  host?: string;
}

/* ------------------------------------------------------------------ */
/* Escapes                                                             */
/* ------------------------------------------------------------------ */

/**
 * Literal JavaScript seguro para colar dentro de <script> em HTML.
 *
 * JSON.stringify sozinho nao basta: ele deixa '<' passar, e um valor contendo
 * a sequencia de fechamento de script encerraria a tag no meio, deixando o
 * resto do codigo visivel como texto na pagina de vendas do cliente.
 */
function paraJs(v: string): string {
  return JSON.stringify(String(v ?? ''))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/[\u2028]/g, '\\u2028')
    .replace(/[\u2029]/g, '\\u2029');
}

/**
 * Texto seguro para ir dentro de comentario de bloco do script gerado.
 *
 * Um '*' seguido de '/' vindo de um host cadastrado fecharia o comentario e o
 * que viesse depois viraria codigo.
 */
function paraComentario(v: string): string {
  return String(v ?? '')
    .replace(/\*\//g, '* /')
    .replace(/[<>]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/** Host do endpoint, para o cabecalho. Vazio quando a URL nao presta. */
function hostDoEndpoint(endpoint: string): string {
  try {
    return new URL(String(endpoint)).host;
  } catch {
    // Endpoint invalido ja e barrado em `conferirOpcoes`; aqui so significa
    // que o cabecalho sai sem essa linha.
    return '';
  }
}

/**
 * Recusa opcoes que gerariam uma tag inutil ou perigosa.
 *
 * Falhar alto e de proposito: uma tag sem chave, com endpoint torto ou — pior
 * — para um evento de dinheiro passa despercebida na instalacao e so aparece
 * semanas depois, como campanha sem conversao ou como venda forjada no
 * Gerenciador.
 */
function conferirOpcoes(o: OpcoesTag): EventoTag {
  const endpoint = String(o?.endpoint ?? '').trim();
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    throw new Error('Endpoint da tag inválido: informe a URL completa do coletor.');
  }
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') {
    throw new Error('O endpoint da tag precisa ser https.');
  }
  if (!String(o?.chave ?? '').trim()) {
    throw new Error('Sem a chave pública da tag o coletor recusa todos os eventos.');
  }
  const permitido = eventoTagPermitido(String(o?.evento?.origem ?? ''));
  if (!permitido) {
    throw new Error(
      `A tag do navegador não pode disparar "${o?.evento?.evento ?? '?'}": ` +
        'evento de dinheiro vem só do webhook do checkout.'
    );
  }
  return permitido;
}

/* ------------------------------------------------------------------ */
/* Cabecalho                                                           */
/* ------------------------------------------------------------------ */

/** Cabecalho em comentario: quem e a tag, onde vai e o que nao fazer com ela. */
function cabecalho(o: OpcoesTag, evento: EventoTag): string {
  const host = paraComentario(o.host || hostDoEndpoint(o.endpoint) || '(não informado)');
  const acionador = ACIONADOR_GTM[evento.origem] || evento.quando;
  const linhas = [
    // Quem assina o bloco é o PRODUTO, não uma empresa. Este texto vai para
    // dentro do site de um cliente qualquer: um site de Hotmart recebendo um
    // comentário assinado "Código Vencedor" parece código colado por engano, e
    // é o tipo de coisa que faz um desenvolvedor apagar a tag. A FASE D pode
    // passar o nome da empresa ativa por `OpcoesTag`, se o dono quiser assinar.
    `${NOME_PRODUTO} — medição de campanha`,
    '',
    `Evento .........: ${evento.evento} (${evento.rotuloPt})`,
    `Domínio ........: ${host}`,
    `Coletor ........: ${paraComentario(o.endpoint)}`,
    `Acionador no GTM: ${paraComentario(acionador)}`,
    `Quando dispara .: ${paraComentario(evento.quando)}`,
    '',
    'A chave abaixo é PÚBLICA de propósito: ela vive no HTML e qualquer',
    'visitante consegue lê-la no código-fonte. Ela não abre nada — só diz ao',
    'coletor de qual conta é o evento. O coletor aceita apenas os eventos da',
    'lista branca e apenas quando a requisição vem de um domínio cadastrado.',
    'Purchase e Subscribe são recusados aqui: venda só entra pelo webhook do',
    'checkout, autenticado por um segredo que nunca sai do servidor.',
    '',
    'Se esta página também tiver o Pixel da Meta, use o mesmo event_id nos',
    'dois lados para a Meta não contar o evento duas vezes:',
    '',
    `  fbq('track', '${evento.evento}', {}, ` +
      `{ eventID: window.${GLOBAL}.eventId('${evento.origem}') });`,
    '',
    'Pixel instalado por modelo do GTM, que gera o próprio event_id: faça o',
    'caminho inverso e passe o id DELE para cá, no terceiro argumento —',
    `  window.${GLOBAL}.enviar('${evento.origem}', janela, { eventId: ID_DO_PIXEL });`,
    '',
    'Gerado pelo console. Não edite à mão: a próxima geração sobrescreve.',
  ];
  const largura = 76;
  const barra = '='.repeat(largura);
  const corpo = linhas.map((l) => (l ? ` * ${l}` : ' *')).join('\n');
  return `/* ${barra}\n${corpo}\n * ${barra} */`;
}

/* ------------------------------------------------------------------ */
/* Nucleo                                                              */
/* ------------------------------------------------------------------ */

/**
 * O JavaScript puro da tag, ja com cabecalho, chave e evento embutidos.
 *
 * Tudo dentro de IIFE e de try/catch, sem dependencia externa e com um unico
 * nome global: a pagina de vendas do cliente nao pode cair por causa da
 * medicao. Uma excecao solta aqui custaria a venda inteira, e nao um evento.
 */
export function gerarScriptTag(o: OpcoesTag): string {
  const evento = conferirOpcoes(o);
  const janela = DEDUP_MS[evento.origem] ?? DEDUP_PADRAO;
  const modo = MODO[evento.origem] ?? 'manual';
  const disparo =
    modo === 'imediato'
      ? '    api.enviar(ORIGEM, DEDUP_MS);'
      : modo === 'engajamento'
        ? '    api.engajamento(ORIGEM, DEDUP_MS);'
        : [
            '    // Este evento não dispara sozinho: quem escolhe o momento é o',
            '    // acionador do GTM ou uma chamada do próprio site —',
            `    //   window.${GLOBAL}.enviar(${paraJs(evento.origem)});`,
            '    void api;',
          ].join('\n');

  return `${cabecalho(o, evento)}
(function () {
  'use strict';

  var VERSAO = ${VERSAO_NUCLEO};
  var ENDPOINT = ${paraJs(o.endpoint.trim())};
  var CHAVE = ${paraJs(o.chave.trim())};
  var ORIGEM = ${paraJs(evento.origem)};
  var DEDUP_MS = ${janela};

  try {
    nucleo();
    var api = window.${GLOBAL};
    if (!api || api.versao !== VERSAO) return;
${disparo}
  } catch (e) {
    // Vazio de propósito: medição nunca derruba a página do cliente. Um erro
    // aqui custa um evento; uma exceção solta custaria a venda.
  }

  function nucleo() {
    // Já instalado por outra tag nossa nesta mesma página: reaproveita, para
    // não gerar um segundo visit id e partir o visitante em duas pessoas.
    if (window.${GLOBAL} && window.${GLOBAL}.versao === VERSAO &&
        window.${GLOBAL}.chave === CHAVE) return;

    var IDS = ['fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid', 'msclkid', 'twclid'];
    var LS_IDS = 'cv_ids';
    var LS_VISITA = 'cv_visit';
    var CK_VISITA = 'cv_visit';
    var DIAS_VISITA = 400;   // teto que o Chrome aceita para cookie
    var DIAS_FB = 90;        // mesma validade que o próprio Pixel usa
    var VALIDADE_IDS = 90 * 864e5;
    var FORA = /^(mailto:|tel:|sms:|javascript:|data:|whatsapp:|ftp:)/i;
    var ABRE_CHAVES = '{' + '{';

    // Variável do GTM que não resolveu chega como texto: o nome dela entre
    // duas chaves. Isso é lixo, não valor — mandado adiante viraria um fbclid
    // inexistente, e o evento apontaria para um anúncio que não existe.
    // (O par de chaves é montado acima em ABRE_CHAVES de propósito: escrito
    // literalmente aqui, o próprio GTM tentaria resolvê-lo ao salvar a tag.)
    function limpo(v) {
      if (v === null || v === undefined) return '';
      var s = String(v).trim();
      if (!s || s.indexOf(ABRE_CHAVES) === 0) return '';
      return s;
    }

    function ler(k) {
      try {
        return localStorage.getItem(k) || '';
      } catch (e) {
        // Aba anônima do Safari e bloqueador de armazenamento derrubam o
        // acesso. Sem persistência a visita vira nova a cada página — ruim,
        // mas não pode virar erro na página do cliente.
        return '';
      }
    }

    function guardar(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {
        // Mesmo motivo de \`ler\`: sem armazenamento, segue só com o cookie.
      }
    }

    function lerCookie(n) {
      try {
        var ps = (document.cookie || '').split(';');
        for (var i = 0; i < ps.length; i++) {
          var ig = ps[i].indexOf('=');
          if (ig < 0) continue;
          if (ps[i].slice(0, ig).trim() !== n) continue;
          return decodeURIComponent(ps[i].slice(ig + 1).trim());
        }
      } catch (e) {
        // Cookie inacessível ou com escape inválido: segue sem ele.
      }
      return '';
    }

    // Domínio mais curto em que o navegador aceita gravar o cookie. Sem isso o
    // cookie nasce preso ao host exato e o visitante que vai de www para a
    // raiz (ou para a página de obrigado em outro subdomínio) perde o visit id
    // e a venda seguinte não encontra a visita que a gerou.
    var raizCache = null;
    function raizCookie() {
      if (raizCache !== null) return raizCache;
      raizCache = '';
      try {
        var host = location.hostname || '';
        if (!host || host.indexOf('.') < 0) return raizCache;
        if (/^[0-9.]+$/.test(host)) return raizCache;
        var partes = host.split('.');
        for (var i = partes.length - 2; i >= 0; i--) {
          var alvo = '.' + partes.slice(i).join('.');
          document.cookie = 'cv_t=1;path=/;domain=' + alvo;
          if (document.cookie.indexOf('cv_t=1') >= 0) {
            document.cookie =
              'cv_t=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/;domain=' + alvo;
            raizCache = alvo;
            return raizCache;
          }
        }
      } catch (e) {
        // Sem domínio comum: grava no host exato, que ainda funciona.
      }
      return raizCache;
    }

    function gravarCookie(n, v, dias) {
      try {
        var ate = new Date(Date.now() + dias * 864e5).toUTCString();
        var dom = raizCookie();
        document.cookie =
          n + '=' + encodeURIComponent(v) +
          ';expires=' + ate +
          ';path=/;SameSite=Lax' +
          (dom ? ';domain=' + dom : '') +
          (location.protocol === 'https:' ? ';Secure' : '');
      } catch (e) {
        // Cookie bloqueado: o id continua valendo pelo localStorage.
      }
    }

    function uuid() {
      try {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        if (window.crypto && crypto.getRandomValues) {
          var b = new Uint8Array(16);
          crypto.getRandomValues(b);
          b[6] = (b[6] & 15) | 64;
          b[8] = (b[8] & 63) | 128;
          var h = [];
          for (var i = 0; i < 16; i++) h.push((b[i] + 256).toString(16).slice(1));
          return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' +
            h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' +
            h.slice(10, 16).join('');
        }
      } catch (e) {
        // Navegador antigo sem crypto: cai no relógio + aleatório abaixo.
      }
      return 'x' + Date.now().toString(16) + Math.random().toString(16).slice(2, 14);
    }

    function params() {
      var fora = {};
      var q = location.search || '';
      if (q.charAt(0) === '?') q = q.slice(1);
      if (!q) return fora;
      var ps = q.split('&');
      for (var i = 0; i < ps.length; i++) {
        try {
          var ig = ps[i].indexOf('=');
          if (ig < 0) continue;
          var nome = decodeURIComponent(ps[i].slice(0, ig).split('+').join(' '));
          var val = limpo(decodeURIComponent(ps[i].slice(ig + 1).split('+').join(' ')));
          nome = nome.trim().toLowerCase();
          if (nome && val) fora[nome] = val;
        } catch (e) {
          // Parâmetro com % inválido: descarta o parâmetro, nunca a página.
        }
      }
      return fora;
    }

    // Pacote pegajoso de identificadores de clique e UTMs.
    //
    // Sem ele, o visitante que clica no anúncio, navega duas páginas e só
    // então compra chega ao checkout sem fbclid nenhum: a venda existe, o
    // dinheiro entrou e a campanha aparece zerada no Gerenciador.
    function pegarIds(p) {
      var agora = Date.now();
      var novos = {};
      var achou = false;
      for (var i = 0; i < IDS.length; i++) {
        if (p[IDS[i]]) { novos[IDS[i]] = p[IDS[i]]; achou = true; }
      }
      for (var k in p) {
        if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
        if (k.indexOf('utm_') === 0 && p[k]) { novos[k] = p[k]; achou = true; }
      }
      if (achou) {
        // Clique NOVO: troca o pacote inteiro em vez de mesclar. Misturar o
        // utm_campaign antigo com o gclid recém-chegado faria o relatório
        // jurar que a venda veio de uma campanha que nem estava no ar.
        guardar(LS_IDS, JSON.stringify({ ts: agora, v: novos }));
        return { ts: agora, valores: novos };
      }
      var salvo = null;
      try {
        salvo = JSON.parse(ler(LS_IDS) || 'null');
      } catch (e) {
        // JSON corrompido por outra extensão: começa do zero.
      }
      if (salvo && salvo.v && typeof salvo.ts === 'number' &&
          agora - salvo.ts < VALIDADE_IDS) {
        return { ts: salvo.ts, valores: salvo.v };
      }
      return { ts: agora, valores: {} };
    }

    // Identificador ANÔNIMO de visita. É a ponte até a venda: o e-mail do
    // comprador só existe depois, no backoffice, então é este id que viaja
    // até o checkout e volta para nós dentro do webhook.
    function visita() {
      var v = lerCookie(CK_VISITA) || ler(LS_VISITA) || '';
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(v)) v = '';
      if (!v) v = uuid();
      guardar(LS_VISITA, v);
      gravarCookie(CK_VISITA, v, DIAS_VISITA);
      return v;
    }

    // fbc é o ÚNICO campo que liga a conversão a campanha / conjunto / anúncio.
    // utm_source e utm_campaign não atribuem nada. Quando o cookie não existe,
    // remonta no formato que a Meta espera e grava de primeira parte, para o
    // próximo pageview já achar pronto.
    function fbc(pacote) {
      var c = lerCookie('_fbc');
      if (c) return c;
      var id = pacote.valores.fbclid || '';
      if (!id) return '';
      var v = 'fb.1.' + pacote.ts + '.' + id;
      gravarCookie('_fbc', v, DIAS_FB);
      return v;
    }

    // Mesmo cookie que o fbevents.js lê e grava. Criar aqui quando falta não
    // inventa pessoa nenhuma: garante que Pixel e CAPI falem do MESMO
    // navegador, em vez de a Meta ver dois visitantes onde há um.
    function fbp() {
      var c = lerCookie('_fbp');
      if (c) return c;
      var v = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 1e10);
      gravarCookie('_fbp', v, DIAS_FB);
      return v;
    }

    function propagarLink(a) {
      try {
        var bruto = a.getAttribute('href') || '';
        if (!bruto || bruto.charAt(0) === '#' || FORA.test(bruto)) return;
        var u = new URL(a.href, location.href);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
        // Link interno não precisa de parâmetro: dentro do site o cv_visit
        // viaja no cookie de primeira parte. Só o salto para o checkout, que
        // é outro domínio, perde o cookie — e é ali que o id tem que ir na URL.
        if (u.host === location.host) return;
        if (u.searchParams.get('cv_visit') === estado.visita) return;
        u.searchParams.set('cv_visit', estado.visita);
        for (var k in estado.ids) {
          if (!Object.prototype.hasOwnProperty.call(estado.ids, k)) continue;
          if (k !== 'fbclid' && k.indexOf('utm_') !== 0) continue;
          if (!u.searchParams.get(k)) u.searchParams.set(k, estado.ids[k]);
        }
        a.href = u.toString();
      } catch (e) {
        // Link exótico: fica como estava. Navegar importa mais que medir.
      }
    }

    function ligarLinks() {
      function varrer() {
        try {
          var as = document.getElementsByTagName('a');
          for (var i = 0; i < as.length; i++) propagarLink(as[i]);
        } catch (e) {
          // DOM ainda instável: o clique delegado abaixo cobre o mesmo link.
        }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', varrer);
      } else {
        varrer();
      }
      // Botão criado depois (página feita em construtor visual): reescreve no
      // próprio clique, antes de o navegador sair.
      document.addEventListener('click', function (ev) {
        try {
          var el = ev.target;
          while (el && el.nodeType === 1 && el.tagName !== 'A') el = el.parentNode;
          if (el && el.tagName === 'A') propagarLink(el);
        } catch (e) {
          // Alvo sem DOM normal (SVG, shadow root): deixa o clique seguir.
        }
      }, true);
    }

    function jaMandou(chave, janela) {
      if (!janela) return false;
      try {
        var t = Number(sessionStorage.getItem(chave) || 0);
        return t > 0 && Date.now() - t < janela;
      } catch (e) {
        // Sem sessionStorage é melhor um evento a mais do que nenhum: a Meta
        // ainda deduplica pelo event_id.
        return false;
      }
    }

    function marcar(chave) {
      try {
        sessionStorage.setItem(chave, String(Date.now()));
      } catch (e) {
        // Sem armazenamento não há como deduplicar; ver \`jaMandou\`.
      }
    }

    // event_id estável por evento e por página: é o que faz a Meta entender
    // que o Pixel do navegador e o CAPI do servidor são a MESMA conversão.
    function eventIdDe(origem) {
      var k = 'cv_eid_' + origem + '|' + location.pathname;
      var v = '';
      try {
        v = sessionStorage.getItem(k) || '';
      } catch (e) {
        // Sem armazenamento: id novo a cada chamada, sem dedupe com o Pixel.
      }
      if (!v) {
        v = uuid();
        try {
          sessionStorage.setItem(k, v);
        } catch (e) {
          // Idem: segue com o id em memória só desta chamada.
        }
      }
      return v;
    }

    function renovarEventId(origem) {
      try {
        sessionStorage.removeItem('cv_eid_' + origem + '|' + location.pathname);
      } catch (e) {
        // Sem armazenamento não há id guardado para renovar.
      }
    }

    function despachar(texto) {
      try {
        // Blob de text/plain de propósito: com application/json o navegador
        // manda um OPTIONS de sondagem antes de CADA evento, dobra a latência
        // e, se esse OPTIONS falhar, engole o evento inteiro em silêncio.
        if (navigator.sendBeacon) {
          var blob = new Blob([texto], { type: 'text/plain;charset=UTF-8' });
          if (navigator.sendBeacon(ENDPOINT, blob)) return;
        }
      } catch (e) {
        // sendBeacon indisponível ou recusado: cai no fetch abaixo.
      }
      try {
        fetch(ENDPOINT, {
          method: 'POST',
          // keepalive é obrigatório: o visitante clica em "Comprar" e sai da
          // página no mesmo instante. Sem ele o navegador aborta o envio e o
          // evento mais perto do dinheiro é justamente o que nunca chega.
          keepalive: true,
          // O coletor autentica por chave e por Origin, nunca por cookie dele.
          credentials: 'omit',
          mode: 'cors',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: texto
        })['catch'](function () {
          // Rede caiu: não há o que fazer, e a página segue normalmente.
        });
      } catch (e) {
        // Nem fetch existe: desiste em silêncio.
      }
    }

    // Dados do formulário (Lead): e-mail, telefone e nome, do jeito que o
    // visitante digitou. Quem normaliza é o servidor — o telefone, por
    // exemplo, precisa do país do visitante, e só o servidor sabe qual é.
    // Aceita os nomes curtos da Meta e os legíveis.
    var CAMPOS_DO_FORMULARIO = {
      em: ['em', 'email'],
      ph: ['ph', 'telefone', 'phone', 'whatsapp'],
      fn: ['fn', 'firstName'],
      ln: ['ln', 'lastName'],
      nome: ['nome', 'name']
    };

    function dadosDoFormulario(dados) {
      if (!dados || typeof dados !== 'object') return null;
      var d = {};
      var achou = false;
      for (var campo in CAMPOS_DO_FORMULARIO) {
        if (!Object.prototype.hasOwnProperty.call(CAMPOS_DO_FORMULARIO, campo)) continue;
        var nomes = CAMPOS_DO_FORMULARIO[campo];
        for (var i = 0; i < nomes.length; i++) {
          var v = limpo(dados[nomes[i]]);
          // Variável do GTM vazia costuma chegar como o TEXTO "undefined".
          if (v && v !== 'undefined' && v !== 'null') {
            d[campo] = v.slice(0, 200);
            achou = true;
            break;
          }
        }
      }
      return achou ? d : null;
    }

    function enviar(origem, janela, dados) {
      try {
        origem = String(origem || '');
        if (origem.indexOf('tag.') !== 0) return false;
        janela = typeof janela === 'number' ? janela : ${DEDUP_PADRAO};
        var chaveDedup = 'cv_ev_' + origem + '|' + location.pathname;
        if (jaMandou(chaveDedup, janela)) return false;
        // event_id vindo de fora ganha do nosso: é o da tag do Pixel no GTM,
        // e só com os dois iguais a Meta junta navegador e servidor numa
        // conversão só.
        var idDeFora = dados && typeof dados === 'object' ? limpo(dados.eventId) : '';
        if (idDeFora === 'undefined' || idDeFora === 'null') idDeFora = '';
        var id = idDeFora || eventIdDe(origem);
        // NÃO mandamos IP nem user-agent: o servidor lê os dois do cabeçalho
        // da requisição. Valor vindo do cliente é forjável, e um IP mentiroso
        // estraga a geolocalização do evento no Gerenciador.
        // NÃO mandamos o nome do evento da Meta: quem traduz 'tag.pageview'
        // em PageView é o servidor, pela lista branca. Se o navegador pudesse
        // escolher o nome, qualquer visitante escolheria "Purchase".
        var corpo = {
          k: CHAVE,
          e: origem,
          i: id,
          v: estado.visita,
          u: location.href,
          r: document.referrer || '',
          c: { fbc: estado.fbc, fbp: estado.fbp },
          x: estado.ids,
          t: Date.now()
        };
        var formulario = dadosDoFormulario(dados);
        if (formulario) corpo.d = formulario;
        despachar(JSON.stringify(corpo));
        marcar(chaveDedup);
        // Evento que pode repetir na mesma página (busca, por exemplo) precisa
        // de event_id novo, ou a Meta descarta a segunda ocorrência como cópia.
        if (!janela) renovarEventId(origem);
        return true;
      } catch (e) {
        // Ver o try externo: medição não derruba página.
        return false;
      }
    }

    // Leitura de verdade, não "abriu e saiu": o que vale como ViewContent é
    // tempo na página ou rolagem. Disparar na abertura faria ViewContent
    // empatar com PageView e o número perderia qualquer utilidade.
    function engajamento(origem, janela) {
      var disparou = false;
      function vai() {
        if (disparou) return;
        disparou = true;
        enviar(origem, janela);
      }
      try {
        setTimeout(vai, 15000);
        var aoRolar = function () {
          try {
            var doc = document.documentElement || document.body;
            var total = (doc.scrollHeight || 0) - (window.innerHeight || 0);
            if (total <= 0) return; // página curta: o tempo resolve
            var lido = (window.pageYOffset || doc.scrollTop || 0) / total;
            if (lido >= 0.5) {
              window.removeEventListener('scroll', aoRolar);
              vai();
            }
          } catch (e) {
            // Layout incomum: sobra o temporizador acima.
          }
        };
        window.addEventListener('scroll', aoRolar, { passive: true });
      } catch (e) {
        // Sem listener de rolagem: o temporizador já foi armado.
      }
    }

    var pacote = pegarIds(params());
    var estado = {
      visita: visita(),
      ids: pacote.valores,
      fbc: fbc(pacote),
      fbp: fbp()
    };
    ligarLinks();

    // Único global da página. Exposto de propósito: é por aqui que o site
    // dispara os eventos de clique e que o Pixel pega o event_id do dedupe.
    window.${GLOBAL} = {
      versao: VERSAO,
      chave: CHAVE,
      visita: estado.visita,
      ids: estado.ids,
      fbc: estado.fbc,
      fbp: estado.fbp,
      enviar: enviar,
      engajamento: engajamento,
      eventId: eventIdDe
    };
  }
})();`;
}

/* ------------------------------------------------------------------ */
/* Empacotamento                                                       */
/* ------------------------------------------------------------------ */

/**
 * Versao para colar no HTML personalizado do GTM.
 *
 * No GTM a tag so roda quando o acionador dispara. Por isso os eventos de
 * clique, que na versao do site ficam esperando uma chamada, aqui mandam
 * direto: o momento ja foi decidido pelo acionador.
 */
export function gerarTagGtm(o: OpcoesTag): string {
  const evento = conferirOpcoes(o);
  const janela = DEDUP_MS[evento.origem] ?? DEDUP_PADRAO;
  const modo = MODO[evento.origem] ?? 'manual';
  const acionador = paraComentario(ACIONADOR_GTM[evento.origem] || evento.quando);
  // Evento de formulario sai com o bloco de dados ja escrito e VAZIO: string
  // vazia e ignorada pelo nucleo, entao a tag funciona do jeito que foi colada
  // e o operador so troca cada '' pela variavel do GTM do campo. O nome da
  // variavel nao da para gerar daqui — cada conteiner chama de um jeito, e uma
  // variavel inexistente entre chaves faz o GTM recusar salvar a tag.
  const argumentos = COM_DADOS_DE_FORMULARIO.has(evento.origem)
    ? `${paraJs(evento.origem)}, ${janela}, {\n` +
      "    // Troque cada '' pela variável do GTM do campo. Vazio é ignorado.\n" +
      "    email: '',\n" +
      "    telefone: '',   // do jeito que o visitante digitou: o país sai sozinho\n" +
      "    nome: '',\n" +
      "    // Mesmo event_id da tag do Pixel deste evento, para a Meta não contar\n" +
      "    // em dobro. Vazio: o nosso, de window.cvtag.eventId().\n" +
      "    eventId: ''\n" +
      '  }'
    : `${paraJs(evento.origem)}, ${janela}`;
  const extra =
    modo === 'manual'
      ? '\n' +
        'try {\n' +
        `  window.${GLOBAL}.enviar(${argumentos});\n` +
        '} catch (e) {\n' +
        '  // Vazio de propósito: ver o cabeçalho. A página vem primeiro.\n' +
        '}'
      : '';
  return [
    `<!-- ${NOME_PRODUTO} — ${evento.evento} (${paraComentario(evento.rotuloPt)})`,
    '     Tipo de tag: HTML personalizado.',
    `     Acionador: ${acionador} -->`,
    '<script>',
    gerarScriptTag(o) + extra,
    '</script>',
  ].join('\n');
}

/**
 * Versao para o cliente colar direto no site, imediatamente antes de </head>.
 *
 * Vai antes do fechamento do head para o visit id e o fbc existirem ANTES de o
 * visitante ter chance de clicar no botao de compra. Colada no rodape, a tag
 * perde exatamente a visita mais apressada — que costuma ser a que compra.
 */
export function gerarTagSite(o: OpcoesTag): string {
  const evento = conferirOpcoes(o);
  const janela = DEDUP_MS[evento.origem] ?? DEDUP_PADRAO;
  const modo = MODO[evento.origem] ?? 'manual';
  const instrucoes =
    modo === 'manual'
      ? [
          '',
          '     Este evento NÃO dispara sozinho. No momento certo, chame:',
          `       window.${GLOBAL}.enviar('${evento.origem}', ${janela});`,
          '',
          ...(COM_DADOS_DE_FORMULARIO.has(evento.origem)
            ? [
                '',
                '     Exemplo, no envio do formulário, levando e-mail, telefone e',
                '     nome (o telefone vai do jeito que foi digitado — o país do',
                '     número é descoberto no servidor):',
                "       document.getElementById('SEU-FORMULARIO')",
                "         .addEventListener('submit', function (ev) {",
                '           var f = ev.target;',
                `           window.${GLOBAL}.enviar('${evento.origem}', ${janela}, {`,
                '             email: f.email && f.email.value,',
                '             telefone: f.telefone && f.telefone.value,',
                '             nome: f.nome && f.nome.value',
                '           });',
                '         });',
              ]
            : [
                '',
                '     Exemplo, no clique de um botão:',
                "       document.getElementById('SEU-BOTAO')",
                "         .addEventListener('click', function () {",
                `           window.${GLOBAL}.enviar('${evento.origem}', ${janela});`,
                '         });',
              ]),
        ]
      : [];
  return [
    `<!-- ${NOME_PRODUTO} — ${evento.evento} (${paraComentario(evento.rotuloPt)})`,
    '     Cole este bloco inteiro imediatamente ANTES de </head>, em todas as',
    '     páginas do site.',
    ...instrucoes,
    '-->',
    '<script>',
    gerarScriptTag(o),
    '</script>',
  ].join('\n');
}

/**
 * Todas as tags de uma vez, para a tela mostrar o pacote pronto assim que o
 * operador cadastra um dominio — sem ele ter que gerar uma por uma e correr o
 * risco de instalar o site com metade dos eventos faltando.
 *
 * Evento fora da lista branca e descartado em silencio, sem derrubar o resto
 * do pacote: quem passou um Purchase aqui ja e recusado por
 * `eventoTagPermitido`, e a tela nao pode quebrar por causa disso.
 */
export function gerarTodasAsTags(
  endpoint: string,
  chave: string,
  eventos: readonly EventoTag[] = EVENTOS_TAG,
  host?: string
): Array<{ evento: EventoTag; gtm: string; site: string }> {
  const fora: Array<{ evento: EventoTag; gtm: string; site: string }> = [];
  for (const evento of eventos || []) {
    if (!eventoTagPermitido(String(evento?.origem ?? ''))) continue;
    const o: OpcoesTag = { endpoint, chave, evento, host };
    fora.push({ evento, gtm: gerarTagGtm(o), site: gerarTagSite(o) });
  }
  return fora;
}
