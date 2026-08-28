# Deploy — Maria Flor Vitrine

Stack de produção: **Next.js na Vercel** (build padrão, zero config) +
**Supabase Cloud** (o mesmo projeto já usado em desenvolvimento — não há
migração nem self-host). Nenhuma arquitetura de código muda para viabilizar
o deploy; só configuração de ambiente.

## Fluxos

- **Produção**: branch `main`/`master` → deploy automático na Vercel, URL
  estável (domínio da Vercel até um domínio próprio ser configurado).
- **Preview**: qualquer outra branch ou Pull Request → a Vercel gera uma URL
  de preview isolada automaticamente. É o comportamento padrão do
  GitHub↔Vercel, nada precisa ser configurado à mão.

## 1. Variáveis de ambiente

Nenhum valor real deve ser commitado — `.env.local` está no `.gitignore`.
Todas essas variáveis precisam ser cadastradas em **Vercel → Project
Settings → Environment Variables**, tanto para `Production` quanto para
`Preview` (os mesmos valores podem servir para os dois, já que é o mesmo
projeto Supabase).

### Client-safe (prefixo `NEXT_PUBLIC_`, vão para o bundle do navegador)

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave `anon`/`publishable` — respeita RLS, segura para o navegador |
| `NEXT_PUBLIC_SITE_URL` | URL pública do site (na Vercel: a URL `https://<projeto>.vercel.app` até o domínio próprio ser apontado) |
| `NEXT_PUBLIC_SITE_NAME` | Nome exibido (ex: `Maria Flor`) |
| `NEXT_PUBLIC_WHATSAPP_DEFAULT_NUMBER` | Número padrão de WhatsApp (usado quando o módulo WhatsApp for implementado) |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | Reservada para o módulo de analytics (ainda não implementado) |
| `NEXT_PUBLIC_META_PIXEL_ID` | Reservada para o módulo de analytics (ainda não implementado) |

### Server-only (nunca chegam ao navegador)

| Variável | Descrição |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Chave `service_role`/`secret` — ignora RLS. Usada hoje só em `lib/desire-score` e `lib/whatsapp/resolve-number.ts` (módulos ainda não expostos publicamente); upload de imagem **não** usa mais essa chave (ver `docs/architecture.md`) |
| `META_CONVERSIONS_API_TOKEN` | Reservada para o módulo de analytics (ainda não implementado) |

Verificação de que nenhuma variável server-only vaza para o client: no
Next.js, só variáveis com prefixo `NEXT_PUBLIC_` são inlinadas no bundle do
navegador — `SUPABASE_SERVICE_ROLE_KEY` e `META_CONVERSIONS_API_TOKEN` só
existem em código que roda no servidor (`server-only` no topo de
`lib/supabase/admin.ts` faz o build falhar se algum Client Component tentar
importar esse módulo por engano).

## 2. GitHub

```bash
git remote add origin <url-do-repositorio-no-github>
git push -u origin master
```

(O repositório local já existe com todo o histórico de commits — só falta
criar o repositório vazio no GitHub e apontar o remote.)

## 3. Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → **Import Git
   Repository** → selecionar o repositório no GitHub (autoriza a Vercel a
   acessá-lo via GitHub App).
2. Framework Preset: **Next.js** (detectado automaticamente — não alterar
   build command, output directory nem install command).
3. Colar as variáveis de ambiente da seção 1 (Production **e** Preview).
4. **Deploy**.

Isso já entrega os dois fluxos pedidos: todo push em `main`/`master` gera
produção; toda branch/PR gera preview automaticamente.

## 4. Supabase Auth — ajustar depois do primeiro deploy

Assim que a URL da Vercel existir (ex: `https://maria-flor-vitrine.vercel.app`),
no dashboard do Supabase → **Authentication → URL Configuration**:

- **Site URL**: a URL de produção da Vercel.
- **Redirect URLs**: adicionar a URL de produção **e** um wildcard de
  preview, algo como `https://*-<seu-usuario-ou-time>.vercel.app/**`, para
  que os deploys de preview também consigam autenticar. (O login
  admin/senha atual não depende de redirect OAuth, mas deixar configurado
  evita retrabalho quando entrarem outros métodos de login no futuro.)

Sem isso, login/logout no `/admin` continuam funcionando normalmente na URL
de produção (a autenticação atual é email/senha direta via
`supabase.auth.signInWithPassword`, que não depende de redirect URL) — o
ajuste acima é mais importante para o dia em que login social/magic link
forem adicionados.

## 5. Depois do deploy — o que testar manualmente

- Login/logout em `/admin`.
- Cadastrar categoria e produto (com upload de foto real — JPEG, PNG, WebP,
  arquivo > 5MB deve ser rejeitado, tipo inválido deve ser rejeitado).
- Produto aparecendo em `/novidades`, na categoria e na página individual.
- Reordenar e remover imagem.
- Confirmar no Network do navegador que nenhuma chamada expõe
  `SUPABASE_SERVICE_ROLE_KEY`.

## 6. Domínio próprio

Não configurar ainda. Quando o domínio for definido, o passo é: Vercel →
Project Settings → Domains → adicionar o domínio e seguir as instruções de
DNS; depois atualizar `NEXT_PUBLIC_SITE_URL` e o Site URL/Redirect URLs no
Supabase Auth para o domínio final.
