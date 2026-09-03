# Meta CAPI Console — Código Vencedor

Console local para disparar conversões para a **Meta Conversions API** quando o
Pixel do navegador não contabiliza (o caso clássico: PIX que só é pago depois
que o comprador fechou a aba).

```bash
npm install
npm run dev      # http://localhost:3333
```

> **Regra de ouro:** só envie eventos que aconteceram de verdade. Conversão
> inventada estraga o aprendizado da campanha e viola os termos da Meta.

---

## Como está organizado

```
src/
  app/
    page.tsx              console (coluna de trabalho + painel de controle)
    guia/                 como usar, onde achar cada dado, regras da Meta
    integracoes/          webhooks de entrada e saída
    api/
      enviar/             POST -> monta o payload, assina em SHA-256 e envia à Meta
      marcas/             GET/PUT/DELETE das marcas (o token nunca volta ao cliente)
      webhook/in/         recebe webhook por header X-CAPI-Secret
      webhook/in/[segredo]/  recebe webhook com o segredo no caminho da URL
      webhook/stream/     SSE da caixa de entrada
      inbox/              lista, marca e limpa a caixa de entrada
      inbox/disparar/     dispara um item da caixa para um ou mais pixels
      health/             healthcheck do container (sem segredo nenhum)
      relay/              log de entregas e teste de destino
      integracoes/        configuração de entrada e saída
  lib/
    meta-capi.ts          hashing, normalização, validação e POST para a Graph API
    parser.ts             lê o webhook de qualquer plataforma e extrai os campos
    attribution-log.ts    grava logs/disparos.md com o link do criativo
    emq.ts                cálculo do Event Match Quality (fonte única)
    event-schema.ts       schema zod compartilhado cliente/servidor
    config-store.ts       marcas, regras de roteamento e integrações (fora do git)
    auto-dispatch.ts      disparo por regra: teste, herança, validação, dedup
    perfil-atribuicao.ts  guarda fbc/fbp/ip/ua do pré-checkout por e-mail
    dedup.ts              índice pixel|evento|event_id do que a Meta já aceitou
    inbox.ts / relay.ts   fila de entrada e relay de saída com retry
  proxy.ts                Basic Auth do console (webhook e health ficam livres)
  components/
    common/primitives.tsx Field, Section, Panel, StatusDot, HelpTip
    ui/brand-icons.tsx    Meta, Pix e WhatsApp — vetores oficiais
```

---

## Configuração

`.env.local` na raiz:

```bash
PIXEL_ID=...
ACCESS_TOKEN=...        # Gerenciador de Eventos -> API de Conversões -> Gerar token
API_VERSION=v26.0
AD_ACCOUNT_ID=act_...   # opcional: habilita o link direto do criativo
TEST_EVENT_CODE=        # opcional: com valor aqui nada entra nas métricas reais
CONSOLE_USER=admin      # obrigatório fora do localhost
CONSOLE_PASSWORD=       # mínimo 12 caracteres; sem ela o console responde 503
```

A lista completa está em `env.example`.

Marcas adicionais ficam em `config/marcas.json`, criado pela própria interface.
**O token nunca é enviado ao navegador** — o cliente só recebe `temToken: true`.
`config/` está no `.gitignore`.

---

## Receber webhooks da plataforma

O backoffice do xWinner só oferece o campo **URL (https)** ao cadastrar um
endpoint de saída: não há onde colocar um header. Por isso existem duas formas.

**Para o xWinner** — segredo no caminho:

```
POST https://<seu-túnel>/api/webhook/in/<segredo>
```

**Para o n8n, curl ou código próprio** — segredo no header:

```
POST https://<seu-túnel>/api/webhook/in
X-CAPI-Secret: <segredo>
```

O segredo é gerado na primeira execução e fica em `config/integracoes.json`.
A tela **Integrações** mostra as duas URLs prontas para copiar.

Como o console roda em `localhost` e a plataforma exige `https`, é preciso um
túnel:

```bash
cloudflared tunnel --url http://localhost:3333
```

### Regras de roteamento

Cada evento da plataforma passa por uma regra: **evento de origem → evento da
Meta → quais pixels → modo**. São três modos:

| Modo | O que faz |
|---|---|
| `fila` | Fica na caixa de entrada esperando um clique. É o padrão de todas as regras. |
| `auto` | Dispara sozinho, logo depois de o webhook responder 202. |
| `ignorar` | Nunca vai para a Meta (abandono, expiração, estorno, chargeback). |

As regras nascem em `fila` de propósito: nada dispara sozinho antes de a pessoa
ver funcionando no **Test Events**. A tabela fica em `config/integracoes.json` e
é editada em **Integrações → passo 2**.

Independente do modo, três travas rodam sempre, nesta ordem:

1. **Filtro de teste** — `lead@example.com`, `evt_preview…`, cupons de R$ 0,01 e
   acessos da equipe nunca chegam à Meta.
2. **Herança de atribuição** — o `Purchase` do PIX chega sem `fbc`. O console
   completa com o perfil guardado no `precheckout_opened`, por e-mail ou
   telefone. Sem isso, a venda chega à Meta órfã de campanha.
3. **Deduplicação** — `pixelId|evento|event_id`. A Meta deduplica Pixel × CAPI,
   mas não CAPI × CAPI: sem esta trava, um retry da plataforma contaria a mesma
   venda duas vezes.

---

## Verificações

```bash
npm run check           # tudo abaixo, em sequência
npm run check:contrast  # todos os pares de cor contra a WCAG 2.2
npm run test:relay      # nenhum segredo pode sair no payload de relay
npm run test:parser     # os 24 eventos do xWinner e os dois formatos de payload
npm run test:atribuicao # herança do fbc e deduplicação
```

Os exemplos de payload usados nos testes são gerados com data de hoje por
`node scripts/exemplos/gerar-exemplos.mjs` — a Meta rejeita evento com mais de
7 dias, então exemplo com data fixa apodrece.

O `check:contrast` falha se alguém alterar um token de cor e quebrar o mínimo de
4.5:1 (texto) ou 3:1 (bordas de controle). Os valores estão em
`src/app/globals.css` e a justificativa em `wiki/plano-redesign-ux-v2.md`.

---

## Densidade da interface

A escala do sistema operacional varia muito entre máquinas (Windows costuma vir
em 125–150%), então o que é confortável num monitor fica enorme no outro.
**Preferências → Densidade** ajusta `--ui-scale`, que multiplica toda a escala em
`rem`. As alturas de controle ficam em px de propósito: alvo de toque é medida
física, não tipográfica.

---

## Logs

- `logs/disparos.md` — um bloco legível por disparo, com `fbtrace_id` e o link do
  criativo que converteu
- `logs/disparos.jsonl` — a mesma coisa em uma linha por evento
- `logs/inbox.jsonl` — webhooks recebidos
- `logs/relay.jsonl` / `logs/relay-failed.jsonl` — entregas de saída

`logs/` está no `.gitignore` por conter dados de compradores.

---

## Deploy na VPS

O console roda em Docker, atrás de um Cloudflare Tunnel:

```
xWinner → capi.proxserverabner.site (Cloudflare) → localhost:3334 → container :3333
```

```bash
docker compose build
docker compose up -d
curl -s http://localhost:3334/api/health
```

A porta do host é **3334** porque a 3333 já é de outro container na VPS. As
variáveis obrigatórias estão em `env.example`; na VPS elas são definidas nas
**Environment variables** da stack do Portainer, nunca em arquivo no repositório.

`config/` e `logs/` são volumes nomeados (`capi_config`, `capi_logs`). Sem eles,
o segredo de entrada mudaria a cada redeploy e o xWinner pararia de entregar.

Se o build estourar a memória da VPS, o workflow `.github/workflows/build.yml`
constrói a imagem no GitHub e publica no GHCR; aí basta trocar o `build:` do
compose por `image: ghcr.io/<usuario>/capi-console:latest`.

O passo a passo completo — Portainer, Cloudflare Access, cadastro no xWinner e
go-live — está em `wiki/plano-deploy-vps-webhooks-capi.md`, fora deste
repositório.
