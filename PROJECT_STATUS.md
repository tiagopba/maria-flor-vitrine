# PROJECT_STATUS.md — Maria Flor Vitrine

> Handoff técnico atualizado em **2026-10-05**, por auditoria direta do
> repositório, do Git, da Vercel e do banco real (somente leitura). Não é um
> plano: é um retrato verificado do estado real. Se este arquivo divergir do
> código/banco/Git quando você o ler, **confie no código/banco/Git**, não neste
> texto, e avise o usuário.
>
> Convenção de status:
> - 🟢 **PRODUCTION** — no ar em `modamariaflor.com.br` (branch `main`).
> - 🟡 **BRANCH / PREVIEW** — existe em código, ainda NÃO está em `main`.
> - 🔴 **PENDENTE NO BANCO** — migration escrita e testada em Postgres isolado,
>   mas ainda **NÃO aplicada** no Supabase real.
> - ⚪ **PLANEJADO / NÃO IMPLEMENTADO**.

---

## 0. Leitura obrigatória ao começar uma sessão

1. Leia este arquivo inteiro.
2. Confirme contra `git status`, `git log`, `git branch -vv` e o banco real
   (somente leitura) — este arquivo envelhece.
3. **Não altere nada** (código, banco, Vercel, GitHub) antes de o usuário
   aprovar. O usuário trabalha por etapas e costuma encerrar pedidos com
   "PARE": pare de fato.
4. Respeite as regras da seção 16 (fluxo de deploy, banco compartilhado,
   dados pessoais, autenticação).

---

## 1. Estado em 30 segundos

- **Production (`main`, `ca1e66a`)** tem: vitrine completa, Admin, Faturamento
  e Envios (DANFE + etiqueta J&T/Correios, PDFs privados, situação de entrega,
  auditoria) e a correção de paginação de **Revisar numerações** (o badge
  falso `(94)` sumiu; hoje `Pendentes (0)` / `Revisados (276)`).
- **Branch atual `feature/gestao-vendedoras` (`9b76633`, 2 commits à frente de
  `main`, NÃO mergeada, Preview READY)** tem: gestão de vendedoras
  (editar nome / contato / desativar / reativar / nova), regras de seller
  ativa/inativa, preparação do Faturamento para **histórico sem PDFs**
  (`record_source`, `UNKNOWN`, selo "Histórico"), filtros paginados (>1000),
  ordenação por data da venda e o **importador histórico (só dry-run
  executável sem aprovação; nada importado)**.
- **2 migrations novas estão escritas e testadas, mas NÃO aplicadas** no banco
  real (seção 3). O Preview desta branch **erra na listagem do Faturamento**
  até elas serem aplicadas (o código lê `record_source`).
- **O CSV real do histórico ainda NÃO foi importado — nem sequer rodado em
  dry-run.** A Bruniani **continua ativa** (não foi desativada).
- Nenhum merge pendente foi feito sem aprovação; nenhum dado real foi alterado
  pelas últimas rodadas além do que o próprio usuário criou.

---

## 2. Git, branches e deploys

```
main            ca1e66a  merge: paginação em Revisar numerações (badge do menu e página)   ← PRODUCTION
staging         2043c50  DEFASADA (não recebeu Faturamento nem a correção de paginação)
feature/gestao-vendedoras  9b76633  ← BRANCH ATUAL (checkout local), = origin
```

Commits da branch atual (a partir de `main`):
- `636f2c4` feat: gestão de vendedoras (nome, contato, desativar/reativar) preservando histórico
- `9b76633` feat: preparar sellers e Faturamento para receber o histórico (sem importar)

Este arquivo (`PROJECT_STATUS.md`) é commitado **depois** de `9b76633`, sozinho,
na mesma branch (era um arquivo não rastreado). `git log -1 -- PROJECT_STATUS.md`
mostra o commit.

Branches antigas já mergeadas (não apagadas, convenção do projeto):
`feature/faturamento-envios` (`4920da5`, mergeada em `4290e41`),
`fix/revisar-numeracoes-paginacao` (`b2a9341`, mergeada em `ca1e66a`), e ~70
branches `feature/*`/`fix/*` históricas.

**Production:** deployment `dpl_6o5TB997iyHi9D277tSPx8pVDnHr` (READY) em
`www.modamariaflor.com.br` / `modamariaflor.com.br`.

**Preview da branch atual:** `dpl_2QAhRxodsYLeV7pQKemnFDy6Rmr6` (READY),
commit `9b76633`. Hosts: deployment `maria-flor-vitrine-3zwhmo37w-tiagopba.vercel.app`
e alias `maria-flor-vitrine-git-feature-gestao-vendedoras-tiagopba.vercel.app`
(o alias exato pode ter nome encurtado pela Vercel — consulte
`list_deployments`). Previews ficam atrás do login SSO da Vercel.

**Vercel (para o MCP):** team `tiagopba` = `team_U93Dd3KaIR6hQtDNqA8fN0sV`,
projeto `maria-flor-vitrine` = `prj_gLXiZZhwF1UMw6KYVHlEn6IMi7cH`.

**Fluxo oficial (docs/deployment.md):** feature → Preview → staging → main.
Nas últimas entregas o usuário autorizou merge direto `feature → main`
(`--no-ff`), **sem passar por `staging`**; `staging` ficou para trás. Decidir
com o usuário se `staging` deve ser realinhada (pendência menor, seção 12).

---

## 3. Banco de dados (Supabase compartilhado Production/Preview/local)

⚠️ **Mesmo projeto Supabase** em Production, Preview e local: trate como
produção o tempo todo (ver seção 16).

### Migrations aplicadas (27 + a do Faturamento)
Todas até `20261005120000_fulfillment_records.sql` **estão aplicadas** (a do
Faturamento foi aplicada pelo usuário). **NUNCA editar migration já aplicada.**

### Migrations 🔴 PENDENTES (escritas, testadas, NÃO aplicadas)
Aplicar **nesta ordem**, cada uma como script único, e **antes** do merge da
branch (aplicar migrations antes do merge é seguro para o Production atual;
fazer merge antes de aplicar quebra a listagem do Faturamento):

1. `supabase/migrations/20261005190000_sellers_rls_and_optional_whatsapp.sql`
   - `sellers`: policies `select/insert/update` só com `is_admin()` (Admin/Master);
     remove a `sellers_admin_all` (FOR ALL com `is_catalog_editor_or_admin()`);
     **sem policy de DELETE** e `revoke delete` de `anon, authenticated`
     (service role segue como acesso de manutenção).
   - `whatsapp_number` passa a aceitar NULL; check de formato (só dígitos
     10–15); `check (active = false or whatsapp_number is not null)` — vendedora
     **ativa sempre tem WhatsApp**, inativa pode não ter.
2. `supabase/migrations/20261005190100_fulfillment_historical_import_support.sql`
   - `fulfillment_records`: `record_source` (`PDF_UPLOAD` default |
     `HISTORICAL_IMPORT`), `import_batch`, `import_ref` (índice único
     **parcial** `where import_ref is not null`).
   - `danfe_file_path`/`label_file_path` passam a aceitar NULL no nível da
     coluna; a constraint `files_by_source` exige os dois PDFs para
     `PDF_UPLOAD` e libera `HISTORICAL_IMPORT`. Histórico exige
     `import_batch` + `import_ref`; upload por PDF não os tem.
   - `delivery_status` ganha `UNKNOWN`, e `UNKNOWN` só existe com
     `record_source = 'HISTORICAL_IMPORT'`.
   - Índice `(sale_date desc, created_at desc, id)` para a nova ordenação.

Verificado antes de pedir aprovação (Postgres em WASM, estado de produção
simulado + os registros reais): aplicam por cima do estado atual, são
idempotentes, **não quebram o código atual de Production** (replay das
consultas reais: 33/33; migrations: 46/46). `sellers.active` é **NOT NULL** no
banco real (confirmado em 2026-10-05).

Reversão (enquanto não houver vendedora sem WhatsApp nem registro histórico):
recriar `sellers_admin_all`, remover as constraints novas, restaurar
`whatsapp_number NOT NULL`, remover as colunas novas.

### Estado real dos dados (2026-10-05, leitura)
- `sellers`: 4, **todas ativas e no rodízio**: Bruniani (`523af886…`, 1 registro
  no Faturamento, 149 eventos de analytics), Camila (`eba293a0…`), Lidiane
  (`0bc9a509…`), Maria Abadia (`40f74bcc…`). Todas com WhatsApp válido.
  **A Bruniani NÃO foi desativada.**
- `fulfillment_records`: **2 registros reais, criados pelo usuário** —
  `62bbd574-702c-4c31-9e51-a92f97325e50` (J&T, EM TRÂNSITO, com vendedora +
  origem ONLINE) e `6bbabf84…` (PENDING). **Não alterar nem apagar.**
- Storage: bucket privado `fulfillment-documents` (2MB, só PDF), paths
  `<record_id>/danfe.pdf` e `<record_id>/label.pdf`.
- `profiles`: 1 admin + 1 master (nenhum `catalog_editor`/`seller`).
- `product_size_fit_compatibilities` 1539 linhas / `product_sizes` 707 /
  `products` 506 (276 não arquivados) — intocados.

---

## 4. Stack e ambientes

- Next.js 16 (App Router, Turbopack) + TypeScript estrito + React 19; Tailwind v4;
  Supabase (Postgres + Auth + Storage + Realtime); Vercel. Dependências-chave:
  `next@16.3.3`, `@supabase/ssr`, `@supabase/supabase-js`, `zod@4`, `lucide-react`,
  **`unpdf`** (leitura de texto de PDF, sem OCR).
- **Leia `node_modules/next/dist/docs/` antes de escrever código Next** (AGENTS.md:
  esta versão tem mudanças — ex.: `proxy.ts` no lugar de middleware, `PageProps`/
  `RouteContext` tipados, Server Actions com limite de body).
- Scripts: `dev`, `build`, `lint`, `typecheck`, **`test`** =
  `node --test` em `src/lib/{fulfillment,catalog,sellers}/__tests__/*.test.ts`
  (Node 24 remove tipos; módulos puros importam com extensão `.ts` —
  `allowImportingTsExtensions` no `tsconfig`).
- `next.config.ts`: `experimental.serverActions.bodySizeLimit: "4.5mb"` (2 PDFs
  de até 2MB por Server Action).
- Ambientes: Production = `main`; Preview = qualquer outra branch; local =
  `npm run dev` (porta 3000 pode estar ocupada por outra sessão).
- Variáveis (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `..._ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, etc. **Nunca imprimir valores.**

---

## 5. Arquitetura (resumo)

```
src/app/(public)      vitrine pública
src/app/admin         painel (requireAdmin() em cada página/action + RLS)
src/proxy.ts          (Next 16) sessão Supabase + redireciona /admin sem sessão para /admin/login
src/lib/db            queries por entidade (usam o client da SESSÃO → RLS decide)
src/lib/supabase      clients (browser/server/admin[service role, server-only]/public)
src/lib/fulfillment   Faturamento e Envios (parsers, comparação, schema, filtros, importador)
src/lib/sellers       regras puras da gestão de vendedoras
src/lib/catalog       preços, tamanhos, + size-fit-pending.ts (paginação/regra de pendência)
supabase/migrations   SQL puro, cronológico (29 arquivos; 2 pendentes)
scripts/              import-fulfillment-history.mts (importador, dry-run por padrão)
```

Correção do status antigo: **existe `src/proxy.ts`** (Next 16) protegendo
`/admin`; a proteção real é em 3 camadas: proxy (sessão) + `requireAdmin()` +
RLS. O client de **service role** só em Server Actions/rotas (`server-only`).

---

## 6. 🟢 Em Production hoje

Vitrine (Home, Novidades, Categoria, Busca, Produto), EU QUERO + popup, **Meu
Carrinho** (`/favoritos`, rota técnica preservada), frete inteligente,
WhatsApp com round-robin, seleção compartilhável, preço dual Pix/cartão,
analytics + Dashboard (fuso `America/Campo_Grande`), Raio-X sequencial,
Pixel/CAPI, feed Meta Catalog, SEO, login Admin/Master (OTP), Visitantes
Online (Presence), cadastro de produtos com variantes/vestibilidade,
arquivamento, delete permanente (master), **Revisar numerações**,
configurações (pagamento, frete grátis, institucional), vendedoras (versão
antiga: nome+WhatsApp+active juntos) e **Faturamento e Envios** (seção 9).

**Revisar numerações — correção de paginação (Production, `ca1e66a`):** o
PostgREST do projeto devolve no máx. **1000 linhas por request sem erro**;
`product_size_fit_compatibilities` tinha 1539 → o badge lia sem paginar e
mostrava 94 falsos pendentes. Agora leituras paginadas por `.range()` ordenadas
pela PK, só de produtos não arquivados, ids em lotes de 100, e a regra de
pendência é uma só (`isSizeFitPending`). Sidebar **sem contador** quando há 0
pendentes (comportamento normal). Arquivos: `src/lib/db/product-size-fit.ts`,
`src/lib/catalog/size-fit-pending.ts`. **Não mexer** (seção 13).

---

## 7. 🟡 Branch `feature/gestao-vendedoras` (não mergeada)

### 7.1 Gestão de vendedoras (`/admin/vendedoras`)
Reutiliza `public.sellers` (nenhuma tabela nova). Rota e item do menu mantidos
(+ atalho "Vendedoras" em Configurações). Só **Admin/Master** (páginas e
actions; antes as páginas nem chamavam `requireAdmin` e as actions aceitavam
`catalog_editor`). Item do menu fica desabilitado para outros papéis.

Ações por linha (Nome · Situação · ações):
- **EDITAR NOME** — só corrige a grafia da MESMA pessoa (mesmo `id`); aviso na
  tela; recusa nome já usado por outra vendedora (ativa ou inativa).
- **CONTATO** — WhatsApp, telefone e rodízio (nunca nome nem ativa/inativa).
- **DESATIVAR** (`active=false`, com confirmação) / **REATIVAR** (`active=true`).
- **NOVA VENDEDORA** — registro novo com `id` novo (gerado pelo banco); o
  formulário permite desmarcar "Ativa" para cadastrar ex-vendedora só para o
  histórico.
- Reordenar (↑ ↓) — afeta a ordem do round-robin.
- **Não existe nenhuma ação/função de excluir vendedora** (testes estáticos
  garantem).

### 7.2 Regras de seller ativa/inativa
- `active` é `NOT NULL` (sempre ativa ou inativa; nunca indefinida).
- **Inativa:** some do select de **nova venda** do Faturamento, do modal
  público de vendedoras, do WhatsApp e do round-robin; **continua aparecendo**
  (com o nome) em registros antigos, filtros e detalhe (vínculo por `seller_id`).
- **Ativa:** WhatsApp obrigatório e válido (formulário **e** banco, após a
  migration pendente).
- **Inativa sem WhatsApp** é válida (ex-funcionária). **Reativar** uma
  vendedora sem WhatsApp abre um formulário que **exige um número válido**,
  gravado junto com `active=true` num único comando; nunca se inventa número.
- Consumidores confirmados (nada a alterar): WhatsApp, round-robin
  (`resolve-seller.ts`), modal público (`getActiveSellersForModal`) e dashboard
  usam **service role** (ignoram RLS); WhatsApp/round-robin/modal já filtram
  `active = true`. `resolve-seller.ts` ganhou só uma defesa de tipo (ignora
  número nulo).
- **Bruniani continua ativa.** A planilha antiga escreve "Bruniane"; no banco o
  nome já é "Bruniani" (EDITAR NOME existe para corrigir grafia se preciso).

### 7.3 Faturamento preparado para histórico sem PDFs
- `record_source`: `PDF_UPLOAD` (default; fluxo de PDF) | `HISTORICAL_IMPORT`.
- Histórico **sem PDFs**: nunca se inventa path. Detalhe mostra "Registro
  histórico — documentos não disponíveis" e **não** renderiza VER DANFE/VER
  ETIQUETA; a rota de documentos responde 404 com path NULL **antes** de
  consultar o Storage. Listagem mostra o selo discreto **"Histórico"**.
- **`UNKNOWN` = "Situação não informada"**: só para histórico cuja planilha
  não diz nada sobre entrega. **Nunca** usar `PENDING` para isso. O formulário
  de cadastro por PDF não oferece `UNKNOWN`; a atualização de situação só o
  oferece em registros históricos; o banco também recusa `UNKNOWN` fora de
  histórico (migration pendente).
- Listagem ordenada por **`sale_date DESC`, depois `created_at DESC`, `id`**
  (importar hoje uma venda antiga não a joga para o topo).
- `getFulfillmentFilterOptions` agora é **paginado** (blocos de 1000, só
  `sales_origin, carrier`, sem dado pessoal) — antes truncava em 1000.
- Nova venda: o select só lista vendedoras **ativas**; o servidor também
  recusa vendedora inativa/inexistente (`isActiveSeller`).

---

## 9. Faturamento e Envios — módulo (🟢 Production + 🟡 extensões da branch)

`/admin/faturamento-envios` (só Admin/Master; item "Faturamento e Envios" no
menu). Fluxo **NOVO REGISTRO**: upload de DANFE Simplificado + etiqueta (PDF
≤2MB cada) → **LER DOCUMENTOS** (texto do próprio PDF via `unpdf`, **sem OCR e
sem IA**) → conferência DANFE × etiqueta (nome, CEP, cidade, UF, endereço;
tolerante a acento/caixa/abreviação) → revisão com todos os campos editáveis
(CPF mascarado `***.***.***-NN` com "Mostrar / corrigir") → **CONFIRMAR E
SALVAR**.

- **Parsers isolados** (`src/lib/fulfillment/parse-danfe.ts`,
  `parse-label.ts`, puros e testados): DANFE Bling; etiqueta **J&T** (transportadora
  é só logo/imagem → fica vazia para o funcionário) e **Correios/SEDEX** (rastreio
  `AD 981 445 191 BR` → `AD981445191BR`, serviço SEDEX/PAC, sem data impressa →
  `shipping_label_date = null`). Campo não encontrado = `null`, nunca inventado.
- **Dados:** tabela `fulfillment_records` (cliente, endereço, NF-e, envio,
  `shipping_service`, **venda e entrega**: `sale_date` NOT NULL e obrigatória no
  formulário — nunca derivada da NF-e —, `seller_id` (FK `sellers`),
  `sales_origin`, `expected_delivery_date`, `delivered_at`, `delivery_status`,
  `notes`). **Vendedora e origem são independentes** (podem vir os dois, só um ou
  nenhum). O antigo "X" da planilha **nunca é gravado**; sem vendedora e sem
  origem a tela mostra "Vendedora não informada".
- **Status logístico** (`delivery_status`, separado de `status=CONFIRMED`):
  `PENDING` Aguardando envio · `IN_TRANSIT` Em trânsito · `DELIVERED` Entregue ·
  `RESENT` Reenviado · `REFUNDED` Estornado · `DELIVERY_ISSUE` Problema na
  entrega · (🟡) `UNKNOWN` Situação não informada. `DELIVERED` exige
  `delivered_at`; sair de `DELIVERED` com data exige confirmação explícita para
  removê-la.
- **ATUALIZAR SITUAÇÃO** (detalhe): status, previsão, entrega, observações,
  transportadora/serviço/rastreio; o estado anterior vem sempre do banco.
- **Listagem:** `Venda | Cliente (CPF mascarado · NF-e) | Vendedora/Origem
  (ambas, sem substituir) | Transportadora/Serviço | Rastreio | Previsão | Status`;
  busca por nome/CPF (com ou sem pontuação)/NF-e (sem zeros à esquerda)/rastreio;
  filtros: período da venda, vendedora, origem (independentes), transportadora,
  status, UF; paginação de 25. O antigo filtro de "dia único" foi removido
  (decisão: período da venda basta).
- **PDFs privados:** bucket `fulfillment-documents` privado; entregues pela
  rota `/admin/faturamento-envios/[id]/arquivo/[danfe|etiqueta]` depois de
  checar a sessão (`Cache-Control: private, no-store`); **nenhuma URL pública**.
- **RLS:** `fulfillment_records` e `fulfillment_audit_logs` só `is_admin()`;
  `anon` com privilégios revogados.
- **Auditoria própria** (`fulfillment_audit_logs`, append-only — só policies de
  select e insert): `CREATED`, `DOCUMENT_VIEWED`, `DELIVERY_UPDATED` com
  metadados seguros (status anterior/novo + **nomes** dos campos alterados);
  nunca CPF/nome/endereço/observações (varredura de 31 valores: 0 vazamentos).
  O app só faz `INSERT` nessa tabela; nenhum update/delete.
- Dados pessoais **nunca** vão para analytics, Pixel/CAPI, localStorage nem logs.
- **E2E real (Production/Preview, sessão Admin do usuário, PDFs sintéticos):**
  criação, upload, leitura J&T/Correios, data da venda obrigatória, vendedora +
  origem, salvar, listagem, detalhe, 26/26 buscas e filtros, VER DANFE/ETIQUETA,
  PDFs sem URL pública, todas as transições de status e a auditoria — aprovado.
  Os registros de teste foram removidos; os 2 registros reais ficaram.

---

## 10. Importador histórico — 🟡 pronto, **NÃO executado com dados reais**

`scripts/import-fulfillment-history.mts` + `src/lib/fulfillment/historical-import/`
(`csv`, `plan`, `batch`, `report`, `run`).

**Uso (padrão = DRY-RUN, nunca grava):**
```bash
# offline (sem tocar no banco): informe as vendedoras reconhecidas
node scripts/import-fulfillment-history.mts <arquivo.csv> --label <apelido> --sellers "Bruniani,Camila,Lidiane,Maria Abadia" --json relatorio.json
# lendo vendedoras e registros existentes do banco (SOMENTE LEITURA)
node scripts/import-fulfillment-history.mts <arquivo.csv> --label <apelido> --db --json relatorio.json
# aplicar (SÓ com aprovação; exige --db): grava as linhas válidas
node scripts/import-fulfillment-history.mts <arquivo.csv> --db --apply --confirm <id-do-lote-impresso-no-dry-run> --actor <uuid-do-perfil-admin>
```
**Regras:** `X` → vendedora e origem NULL · `ONLINE` → `sales_origin=ONLINE` ·
nome → casa com `sellers` pelo nome normalizado (caixa/acento) — **nunca cria
vendedora** (nome não encontrado/ambíguo → linha rejeitada para revisão) ·
data em "Entrega" → `DELIVERED` + `delivered_at` · `REENVIADO` → `RESENT` ·
`ESTORNADO` → `REFUNDED` · célula vazia → **`UNKNOWN`** · sem data da venda ou
sem cliente → rejeitada · UF inválida → rejeitada (**nunca corrigida por
adivinhação**) · texto de entrega não reconhecido, rastreio inválido e valor
inválido → rejeitadas · **ano de 2 dígitos (`14/03/25`) é rejeitado** (não
adivinha o século; a regra NÃO foi alterada — o usuário quer ver o dry-run do
CSV real antes de decidir).
**Idempotência:** `import_batch = hist-[apelido]-<sha256 do arquivo (12)>`;
`import_ref = <lote>#<posição da linha>` → reimportar o mesmo arquivo não
duplica e duas linhas idênticas em posições diferentes seguem distintas
(linhas idênticas dentro do arquivo só geram **aviso**). Possível duplicada no
banco: mesmo rastreio+data+cliente+valor (só detecta linhas com rastreio).
**Relatório:** total, válidas, rejeitadas (com número da linha e a célula
problemática), possíveis duplicadas, vendedoras reconhecidas/não reconhecidas,
ONLINE, X, entregues, reenviadas, estornadas, situação desconhecida.
**Aplicação:** só com `--apply` + `--confirm <lote>` + `--actor <uuid>`; pré-filtra
`import_ref` já existentes (o PostgREST não faz `ON CONFLICT` em índice
parcial); grava auditoria `CREATED` com `{source:"historical_import", batch}`;
desfazer um lote = remover por `import_batch` via service role.
Fixture **fictícia** com relatório de exemplo em
`src/lib/fulfillment/__tests__/fixtures/historico-ficticio.csv`.

**O CSV real ainda não foi fornecido/rodado.** Nada foi importado.

---

## 11. Testes executados

**No repositório (`npm test`, branch atual): 150/150**, mais `tsc --noEmit`,
`eslint` e `next build` limpos em `9b76633`. Cobrem: parsers DANFE/J&T/Correios,
comparação, schemas, busca/filtros, plano de atualização de situação,
vendedoras (nome, WhatsApp ativa/inativa, reativação, ausência de DELETE,
permissões Admin/Master via varredura estática, WhatsApp/round-robin filtrando
`active`), paginação do size-fit (1539 compat.), filtros >1000, `UNKNOWN`,
documentos ausentes, ordenação e conteúdo das migrations, e o importador
(CSV, regras de linha, relatório, idempotência, dry-run sem escrita, apply com
confirmação).

**Fora do repositório (scripts temporários; recriáveis com `@electric-sql/pglite`):**
Postgres em WASM com stubs do Supabase (`auth.uid()`, papéis, `storage`):
RLS/constraints do Faturamento (86/86), vendedoras (15/15), as 2 migrations
pendentes por cima do estado atual, 2x (46/46) e o **replay das consultas do
código atual de Production contra o banco já migrado (33/33)**. Docker Desktop
não sobe neste PC (WSL), por isso não há Supabase local completo.

**Reais (Production/Preview):** E2E do Faturamento (seção 9); testes públicos
com a chave `anon` (listar/ler/inserir/atualizar/baixar PDF/URL assinada: 12/12
negados); smoke tests de Production após cada merge.

**NÃO testado:** fluxo de vendedoras no Preview com login Admin e com a
migration aplicada; usuário autenticado **sem** Admin/Master no banco real (não
há conta assim; coberto só no Postgres isolado); Master no Faturamento;
leitura da etiqueta Correios **real** no Preview (PDFs reais ficam no Desktop,
fora da permissão de upload da sessão; coberta por teste local e fixture);
dry-run com o CSV real; apply do importador.

---

## 12. Decisões e pendências abertas

1. **Aplicar as 2 migrations** (seção 3) — aguardam aprovação do usuário.
2. **Ordem:** migrations primeiro, **depois** merge de `feature/gestao-vendedoras`.
3. **CSV real:** fornecer o arquivo e rodar o **dry-run** antes de qualquer
   decisão de regra (ano de 2 dígitos; células de entrega com textos fora de
   data/REENVIADO/ESTORNADO; UF por extenso; rastreio fora do padrão).
4. **Ex-vendedoras da planilha:** nomes não encontrados em `sellers` precisam ser
   cadastrados antes (NOVA VENDEDORA com "Ativa" desmarcada, sem WhatsApp —
   possível só depois da migration 1) — o importador **nunca cria** vendedora.
5. **Bruniani:** decisão do usuário se/quando desativar (hoje ativa).
6. `staging` está defasada (`2043c50`): realinhar ou abandonar o fluxo por
   staging nesses merges?
7. Escala das opções de filtro do Faturamento: hoje paginadas (várias
   requisições com dezenas de milhares de linhas); uma função SQL de valores
   distintos seria melhor (exigiria migration).
8. Endurecimento opcional: trigger bloqueando `DELETE` em `sellers` até para
   `service_role` — o usuário disse que **não** é necessário agora.
9. Fora de escopo declarado (futuro): página pública do cliente para
   acompanhar o envio e e-mail ao cliente.
10. Decididas (não reabrir): `UNKNOWN` para entrega em branco; "X" nunca é
    gravado; histórico sem PDFs sem path falso; vendedora e origem
    independentes; `sale_date` obrigatória; gestão de vendedoras só
    Admin/Master (app + banco).

---

## 13. O que NÃO deve ser alterado

- **Migrations já aplicadas** (inclusive `20261005120000`); mudanças de banco só
  em migration **nova, aditiva e aprovada**.
- Os **2 registros reais** do Faturamento e seus PDFs; as 4 vendedoras (não
  alterar/desativar sem pedido); `product_size_fit_compatibilities` e as
  numerações; o RPC de gravação de size-fit.
- Parsers DANFE/J&T/Correios e a regra "campo ausente = `null`".
- PDFs privados (bucket privado, sem URL pública); RLS do Faturamento;
  auditoria append-only.
- Módulos estabilizados (`docs/stable-modules.md`): cadastro/edição de
  produtos (`ProductForm`, `VariantBlock`, `save_product_with_variants`), preços
  (`pricing.ts`), mensagem de WhatsApp (`message-builder.ts`) e
  `resolve-seller.ts` (lógica de distribuição), Raio-X sequencial, seleção
  compartilhável.
- Nomenclatura técnica histórica: `/favoritos`, `FAVORITE_ADDED`,
  `FAVORITES_VIEW`, `FAVORITES_WHATSAPP_CLICK`, `PRODUCT_FLOW_STARTED`,
  chaves `mariaflor:*`, `session_id`.
- Fuso `America/Campo_Grande` fixo no Dashboard; `api.whatsapp.com/send` (não
  `wa.me`); paginação de `analytics_events`.
- Produtos, carrinho, Pixel/CAPI, analytics, Meta e catálogo **não** devem ser
  tocados por trabalhos de Faturamento/vendedoras.

---

## 14. Dívidas e itens planejados (herdados — não implementados)

- CRM/pré-atendimento (greenfield; só preparação de arquitetura), GA4
  (`NEXT_PUBLIC_GA4_MEASUREMENT_ID` reservada, sem código), banner/consentimento
  LGPD (`consent_records` sem uso; Pixel/CAPI carregam sem gate), Provador e
  Coleções (schema existe, nenhuma rota), `desire-score` (código morto), domínio
  fixo de staging, projeto Supabase separado para Preview (risco aceito da
  service role compartilhada).
- **Docs defasados** (`docs/architecture.md`, `analytics.md`, `business-rules.md`,
  `database.md`): descrevem o planejamento inicial (menção a middleware ausente,
  GA4 ativo, `cash_price` "futuro" etc.). Comentários de cabeçalho
  "PREPARADA, NÃO APLICADA" em migrations antigas e o comentário de
  `shared_selections` em `src/types/database.ts` estão **stale** — confirmar
  sempre no banco real.

---

## 15. Próximos passos exatos (em ordem; nada sem aprovação)

1. Usuário revisa e **aplica** no SQL Editor, como scripts únicos e nesta
   ordem: `20261005190000_...` e depois `20261005190100_...`.
2. Verificar no banco real (somente leitura): policies de `sellers`
   (`select/insert/update` só `is_admin`), colunas `record_source`,
   `import_batch`, `import_ref`, `whatsapp_number` anulável, as 4 vendedoras
   ainda ativas e os 2 registros reais intactos.
3. Testar o **Preview** da branch com login Admin (o usuário entra; o agente
   nunca digita senha): `/admin/vendedoras` (criar uma vendedora **inativa sem
   WhatsApp** só se o usuário autorizar, renomear/desativar/reativar com cuidado
   — **não mexer nas 4 reais**), Faturamento (listagem, detalhe, nova venda só com
   ativas).
4. Com aprovação, **merge** `feature/gestao-vendedoras` → `main` (`--no-ff`),
   push, acompanhar o deploy de Production até READY e fazer smoke test
   somente leitura (`/admin/vendedoras`, `/admin/faturamento-envios`, detalhe,
   VER DANFE/ETIQUETA).
5. Cadastrar (NOVA VENDEDORA, inativa) as ex-vendedoras que aparecerem na
   planilha.
6. Receber o **CSV real** e rodar o **dry-run** (offline com `--sellers` ou
   `--db` somente leitura). Revisar o relatório com o usuário: rejeitadas,
   vendedoras não reconhecidas, formatos de data, textos de entrega, duplicadas.
7. Só depois, ajustar regras do importador **se** o usuário decidir
   (ex.: aceitar ano de 2 dígitos) — com testes novos.
8. Com aprovação explícita, **apply** (`--apply --confirm <lote> --actor <uuid>`)
   e conferência pós-importação (contagens, ordem da listagem, opções de
   filtro, selo "Histórico"). Reversão por `import_batch`.

---

## 16. Regras para a próxima sessão

1. **Não refazer** o que está concluído; **não assumir** que o planejado existe.
2. **Banco compartilhado:** nunca `reset`/`truncate`/`drop`/seed destrutivo;
   migrations só aditivas e aprovadas; teste que muda dado real é revertido
   imediatamente (e só se o dado for seu). Não alterar dado criado pelo usuário.
3. **Fluxo:** branch → Preview → (staging) → main. Nunca commit direto em
   `main`/`staging`. Rodar `tsc --noEmit`, `eslint`, `npm test`, `next build`
   antes de cada Preview. **Merge/deploy só com autorização explícita.**
4. **Autenticação:** o agente **nunca digita senha** nem usa service role para
   "entrar como" alguém. Para testar no Preview/Production o **usuário** faz o
   login no Chrome (extensão `claude-in-chrome`); a sessão vale só para o host
   exato (alias da branch ≠ URL do deployment). Para o navegador embutido, usar
   `preview_start`.
5. **Dados pessoais:** nunca commitar PDFs/CPF/endereços reais; fixtures são
   **sintéticas**. PDFs reais ficam no Desktop do usuário (fora do alcance de
   `file_upload`; não copiar para o repositório).
6. **Teste com harness local:** páginas do harness vivem no layout público e
   geram `PAGE_VIEW` no banco real — apagar as linhas da própria sessão local
   (`analytics_events.session_id`) depois, e remover o harness antes do commit.
7. **Windows/shell:** heredocs com `\n` literais quebram no Git Bash; para
   escrever arquivos/patches use a ferramenta Write/Edit. Arquivos têm CRLF.
8. Mudanças consolidadas (poucos Previews), relatórios curtos e honestos, e
   **PARE** quando o usuário pedir.
