-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Bucket de Storage dedicado pra imagens institucionais (hoje: só a foto
-- da fachada da loja, usada em /quem-somos e editável em
-- /admin/configuracoes). Mesmo padrão já usado pelos buckets 'products' e
-- 'categories': público pra leitura, upload direto do navegador pro
-- Storage (nunca passa pelo body de uma Server Action/Vercel, que recusa
-- requisições > 4.5MB).
--
-- Diferença importante em relação a 'products'/'categories': lá a policy
-- de escrita usa is_catalog_editor_or_admin() — aqui usa só is_admin(),
-- porque só ADMIN pode editar Configurações do Site (mesma regra da
-- policy "site_settings_admin_all" já existente). Nenhuma policy usa
-- `to authenticated` nem qualquer regra genérica — todas checam
-- explicitamente is_admin(), a mesma função já usada no resto do projeto.
--
-- Puramente aditiva: não cria/altera/remove nenhuma tabela, não toca em
-- nenhum arquivo já existente em nenhum bucket, não tem DROP TABLE,
-- TRUNCATE nem DELETE em lugar nenhum. O bucket 'institutional' é novo —
-- não existe conflito com 'products'/'categories'.
--
-- Idempotente: pode rodar mais de uma vez sem erro. O insert do bucket já
-- usa `on conflict do nothing`; as policies usam `drop policy if exists`
-- antes de recriar (mesmo padrão já usado em
-- 20260827150100_fix_profiles_self_role_escalation.sql).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'institutional',
  'institutional',
  true,
  5242880, -- 5MB por arquivo — mesmo limite de 'products'/'categories', razoável pra uma foto de fachada
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Leitura pública, mas só dentro do bucket 'institutional' — que existe
-- só pra conteúdo que já é destinado a aparecer no site público (hoje: a
-- foto da fachada, mostrada em /quem-somos). Não expõe nada além disso.
drop policy if exists "institutional_bucket_public_read" on storage.objects;
create policy "institutional_bucket_public_read"
  on storage.objects for select
  using (bucket_id = 'institutional');

-- Escrita só pra ADMIN — catalog_editor não tem acesso aqui (diferente de
-- 'products'/'categories', que usam is_catalog_editor_or_admin()).
drop policy if exists "institutional_bucket_admin_insert" on storage.objects;
create policy "institutional_bucket_admin_insert" on storage.objects
  for insert
  with check (bucket_id = 'institutional' and is_admin());

drop policy if exists "institutional_bucket_admin_update" on storage.objects;
create policy "institutional_bucket_admin_update" on storage.objects
  for update
  using (bucket_id = 'institutional' and is_admin());

drop policy if exists "institutional_bucket_admin_delete" on storage.objects;
create policy "institutional_bucket_admin_delete" on storage.objects
  for delete
  using (bucket_id = 'institutional' and is_admin());
