# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (Next.js 16, desktop first; celular precisa funcionar para conferir rápido)

## Users

O dono e a equipe dele: gestores de tráfego que cuidam de várias empresas (infoprodutos vendidos com Meta Ads). Abrem o console várias vezes por dia, quase sempre no notebook, para responder duas perguntas: "as vendas de hoje chegaram à Meta?" e "o que está quebrado e onde eu mexo?". Conhecem Pixel, CAPI, GTM e webhook, mas não querem ler parágrafo: querem o número e o próximo clique.

## Product Purpose

Polen Track recebe as vendas das plataformas de pagamento (webhook) e o rastro do site (tag própria), reconcilia e envia a compra para a Meta Conversions API quando o Pixel do navegador falha, principalmente no PIX assíncrono. Mostra por empresa o que chegou, o que foi aceito pela Meta, o que espera na fila e o que falta configurar.

## Positioning

Ferramenta interna de operação, não produto de vitrine. Concorre com a Stape e com planilha + Gerenciador de Eventos da Meta. Ganha por ser específica: cada venda tem rastro, cada falha tem o próximo passo.

## Operating Context

Tela de trabalho usada em sessões curtas e frequentes, ao lado do Gerenciador de Anúncios. Dados vêm de arquivos locais (`logs/*.jsonl`, `config/*.json`), sem banco. Várias empresas na lateral, 8 abas por empresa: Visão geral, Domínio, Instalação, Pixels, Eventos, Teste, Regras, Configurações.

## Capabilities and Constraints

- Nunca enviar evento fictício à Meta; teste interno (cupom de R$ 0,01, equipe) fica fora das métricas.
- Token e chave nunca aparecem na tela inteira, em log ou em URL.
- Ícones só de `@phosphor-icons/react` (lucide proibido).
- Nenhuma cor escrita à mão em `src/components/**`; cores e tamanhos vêm dos tokens de `globals.css` (o gate `npm run check` reprova o resto).
- Texto de tela em português do Brasil, sem caixa-alta; palavras proibidas: "caixa de entrada", "disparar/disparo", "marca(s)", "destino(s)", "fontes de dados", "roteamento", "domínios autorizados".

## Brand Commitments

- Nome: Polen Track (constante `NOME_PRODUTO` em `@/lib/produto`).
- Paleta fixada pelo dono: amarelo `#FCEE21`, preto e branco; símbolo de 4 círculos amarelos; logos do dono em `public/brand/` (logo não é gerado por IA).
- Imagem gerada por IA só como fundo, sem texto; texto, cartões e ícones em HTML/CSS.

## Evidence on Hand

- Captura do dono de 18/11/2026 19:08 (Visão geral) apontando texto grande demais, ícones grandes e coloridos nas abas, avisos empilhados e os números (KPIs) abaixo da dobra.
- Wiki do projeto (`../wiki/`), planos v4 a v8 e as decisões do dono registradas lá.

## Product Principles

1. UX extremamente prática (decisão D8 do dono): uma ação principal por tela, o dia a dia em no máximo 2 cliques, palavras de quem usa.
2. O número vem antes do aviso: o estado das vendas fica acima da dobra; avisos são compactos e sempre trazem o próximo passo.
3. Vazio e erro dizem o que fazer em seguida.
4. Na dúvida, o simples.

## Accessibility & Inclusion

WCAG AA de contraste (o gate mede), alvo de toque mínimo de 24px (44px no celular), foco visível, nada de informação só por cor, texto mínimo de 12px, respeito a `prefers-reduced-motion`.
