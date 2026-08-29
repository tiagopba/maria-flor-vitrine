# Processo de deploy — Maria Flor Vitrine

A partir de agora, **nenhuma alteração vai direto para produção**. Toda
mudança passa por três níveis antes de chegar em `modamariaflor.com.br`.

> Este documento substitui `docs/deploy.md` (guia do primeiro deploy,
> quando o processo ainda era "commitar direto na `main`"). O conteúdo
> relevante daquele guia (variáveis de ambiente, checklist pós-deploy)
> foi incorporado aqui.

## 1. Os três níveis

```
feature/nome-da-funcionalidade   (você cria, por funcionalidade)
        │
        │  push / abrir PR
        ▼
   Preview Deployment            (a Vercel gera sozinha, 1 por branch/PR)
        │
        │  testar no link de preview
        ▼
      staging                    (branch fixa, já existe)
        │
        │  testar em staging (URL de preview da própria branch;
        │  no futuro: staging.modamariaflor.com.br)
        ▼
       main                      (branch fixa, produção)
        │
        │  push/merge = deploy automático
        ▼
   PRODUÇÃO — modamariaflor.com.br e www.modamariaflor.com.br
```

**Nunca commitar direto na `main` nem na `staging`.** Toda mudança nasce
numa branch `feature/...`.

### Nomenclatura de branch

```
feature/favoritos
feature/provadores
feature/analytics
fix/nome-do-bug
```

### Fluxo passo a passo

1. **Criar a branch a partir da `main` atualizada**
   ```bash
   git checkout main
   git pull
   git checkout -b feature/nome-da-funcionalidade
   ```
2. **Trabalhar e commitar normalmente.** Cada `git push` atualiza o Preview
   Deployment daquela branch automaticamente (comportamento padrão da
   integração GitHub↔Vercel — nada precisa ser configurado).
3. **Testar no link de Preview** que a Vercel comenta no PR do GitHub (ou
   que aparece em `vercel ls` / no dashboard). Cada preview é um ambiente
   isolado com sua própria URL (`https://maria-flor-vitrine-<hash>-tiagopba.vercel.app`).
4. **Abrir PR de `feature/...` → `staging`.** Depois de mergeado, a
   `staging` recebe seu próprio deployment (hoje também via URL de
   Preview, já que ainda não tem domínio fixo — ver seção 4).
5. **Testar em `staging`** com calma — é o último passo antes do mundo
   real ver a mudança.
6. **Abrir PR de `staging` → `main`.** Depois de mergeado, a Vercel builda
   e publica em produção automaticamente
   (`modamariaflor.com.br` / `www.modamariaflor.com.br`).
7. **Apagar a branch `feature/...`** depois do merge (`staging` e `main`
   nunca são apagadas — são fixas).

## 2. Ambientes na Vercel

| Ambiente Vercel | Branch(es) | URL hoje | URL futura |
|---|---|---|---|
| **Production** | `main` | `modamariaflor.com.br`, `www.modamariaflor.com.br` | (mesma) |
| **Preview** | `staging` | URL de preview gerada por deployment | `staging.modamariaflor.com.br` |
| **Preview** | `feature/*`, `fix/*`, PRs | URL de preview gerada por deployment | — (efêmera por natureza) |
| **Development** | local (`npm run dev` / `npm run start`) | `http://localhost:3000` | — |

A Vercel só tem dois "ambientes" de fato (Production e Preview) — `staging`
é uma branch fixa que roda como Preview, distinguida pelo nome, não por um
ambiente separado. Isso é suficiente para o fluxo pedido; se no futuro
quiser que `staging` tenha suas próprias variáveis de ambiente
*diferentes* do resto do Preview, isso exige o recurso pago "Custom
Environments" da Vercel — não configurado agora por não ter sido pedido.

### 4. Domínio de staging (preparar para o futuro)

Ainda não configurado — quando quiser ativar:

1. Vercel → Project Settings → Domains → **Add** →
   `staging.modamariaflor.com.br`.
2. Na tela de adicionar, marcar **"Assign to a Git Branch"** → `staging`.
   Isso faz esse domínio sempre refletir o deployment mais recente da
   branch `staging`, em vez de gerar uma URL nova a cada commit.
3. Adicionar o CNAME que a Vercel indicar no DNS da Hostinger (mesmo
   processo já feito para `www` — ver commits anteriores).

## 3. Variáveis de ambiente

Cadastradas em **Vercel → Project Settings → Environment Variables**,
escopadas por ambiente (Production / Preview). Confira sempre com
`npx vercel env ls`.

### Client-safe (`NEXT_PUBLIC_*`, vão para o bundle do navegador)

| Variável | Production | Preview | Observação |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | mesmo projeto Supabase nos dois — ver limitação abaixo |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | respeita RLS, segura por natureza |
| `NEXT_PUBLIC_SITE_URL` | ✅ (`https://www.modamariaflor.com.br`) | ❌ (propositalmente) | Preview usa `getSiteUrl()` (`src/lib/site.ts`), que detecta a URL do próprio deployment via `VERCEL_URL` automaticamente. Setar isso em Preview faria todo link de WhatsApp/Open Graph de qualquer preview apontar pra produção — corrigido nesta auditoria (estava setado por engano). |
| `NEXT_PUBLIC_SITE_NAME` | ✅ | ✅ | só um texto, sem risco |
| `NEXT_PUBLIC_WHATSAPP_DEFAULT_NUMBER` | ✅ (vazio hoje) | ✅ (vazio hoje) | fallback de rodízio — ver `docs/business-rules.md` |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `NEXT_PUBLIC_META_PIXEL_ID` | reservadas | reservadas | módulo de analytics ainda não implementado |

### Server-only (nunca chegam ao navegador)

| Variável | Production | Preview | Observação |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ⚠️ ✅ (mesmo valor) | **Risco de segurança conhecido e aceito por enquanto** — ver aviso abaixo. |
| `META_CONVERSIONS_API_TOKEN` | ✅ | ✅ | reservada, módulo de analytics ainda não implementado |

> ⚠️ **Aviso de segurança — `SUPABASE_SERVICE_ROLE_KEY` em Preview**
> Essa chave ignora todas as regras de RLS do banco. Hoje ela está
> configurada com o **mesmo valor** em Production e em Preview, porque o
> app usa o client admin em Server Actions/rotas que Preview também
> precisa exercitar (lista de vendedoras no fluxo de WhatsApp, registro de
> `analytics_events`). Deployments de Preview têm URL semi-pública
> (qualquer um com o link acessa) e são gerados automaticamente a cada
> branch/PR — na prática, isso amplia a superfície de exposição dessa
> chave além da produção. Decisão consciente por ora: manter assim por
> simplicidade. Caminho correto se isso virar preocupação real: um projeto
> Supabase **separado** só para Preview/staging, com seu próprio
> `SUPABASE_SERVICE_ROLE_KEY` (sem acesso ao banco de produção) — exige
> criar o projeto e rodar as migrations de `supabase/migrations/` lá
> também. Não implementado agora por não ter sido pedido; revisitar se o
> projeto ganhar mais colaboradores ou dados mais sensíveis.

### Limitação atual: um único banco Supabase

Production e Preview usam o **mesmo projeto Supabase** (mesmo banco de
dados real). Ou seja, testar em Preview/staging pode ler e escrever dados
reais (produtos, vendedoras, analytics). Fluxos que gravam
(`WHATSAPP_CLICK`, cadastro de produto/vendedora) devem ser testados com
consciência disso — teste, mas evite poluir demais, e prefira reverter
manualmente (como já vem sendo feito nesta sessão) quando alterar um
registro real só para verificar algo.

## 4. Rollback

### Identificar o último deployment estável

```bash
npx vercel ls maria-flor-vitrine --prod
```

Lista os deployments de produção mais recentes com status (`Ready`,
`Error`) e idade. Também dá pra ver pelo dashboard: **Vercel → Project →
Deployments**, filtrando por `Production`. O deployment marcado com a
tag **"Current"** é o que está no ar agora; o de baixo dele na lista
(mais antigo, com status `Ready`) é o candidato a rollback.

### Instant Rollback

**Pelo dashboard** (mais rápido em uma emergência):
1. Vercel → Project → Deployments.
2. Encontre o deployment estável anterior (status `Ready`, sem o badge de
   erro).
3. Menu **⋯** → **Instant Rollback**.
4. Confirme. A produção volta a servir aquele build em segundos — sem
   rebuild, é só re-apontar o alias.

**Pela CLI:**
```bash
npx vercel rollback <url-ou-id-do-deployment>
```
Sem argumento, `vercel rollback` mostra os deployments recentes pra
escolher interativamente.

### Voltar pra frente depois do rollback

Instant Rollback **não é permanente** — ele só re-aponta o alias de
produção pra um build antigo, o histórico de commits e o próprio código
continuam intactos. Depois de corrigir o bug:

1. Corrija o problema numa branch `fix/...`, siga o fluxo normal
   (Preview → merge em `staging` → teste → merge em `main`).
2. O merge em `main` gera um novo deployment de produção automaticamente,
   que passa a ser o "Current" — isso já *é* o "voltar pra versão
   corrigida", sem nenhum comando especial de "desfazer o rollback".
3. Se quiser reforçar manualmente sem esperar o merge, `npx vercel --prod`
   a partir da branch `main` local também promove um novo deployment.

## 5. Checklist pós-deploy em produção

Repetir a cada merge em `main` (herdado do processo antigo, ainda válido):

- Login/logout em `/admin`.
- Cadastrar/editar produto e categoria (upload de foto real).
- Produto aparecendo em `/novidades`, na categoria e na página individual.
- Fluxo de WhatsApp: tamanho → vendedora → mensagem → link correto.
- Confirmar no Network do navegador que nenhuma chamada expõe
  `SUPABASE_SERVICE_ROLE_KEY` no client.
- Testar em largura de celular real (375/393/430px) — Safari iOS
  especialmente, por já termos pego bugs que só aparecem lá.

## 6. Histórico (do `docs/deploy.md` original)

O guia original de configuração inicial (primeiro deploy do zero, quando
o repositório ainda não existia no GitHub) foi incorporado a este
documento e removido para não manter duas fontes de verdade conflitantes.
Nada nele contradiz o processo acima — era só a versão "commit direto na
`main`" das seções 1 e 3.
