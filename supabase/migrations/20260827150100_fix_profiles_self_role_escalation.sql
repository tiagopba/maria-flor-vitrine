-- ============================================================================
-- Corrige brecha de escalonamento de privilégio em `profiles`.
--
-- A policy original ("profiles_update_own_or_admin") só tinha USING,
-- sem WITH CHECK explícito. Em UPDATE, quando não há WITH CHECK, o
-- Postgres reaproveita a expressão do USING também para validar a
-- linha NOVA. Como "id = auth.uid()" continua verdadeiro depois do
-- update (o id não muda), qualquer usuária autenticada podia rodar:
--
--   update profiles set role = 'admin' where id = auth.uid();
--
-- e a policy deixava passar. Esta migration adiciona um WITH CHECK que
-- só permite a própria usuária alterar sua linha se o campo `role`
-- permanecer o mesmo — trocar o próprio papel continua exigindo is_admin().
-- ============================================================================

drop policy if exists "profiles_update_own_or_admin" on profiles;

create policy "profiles_update_own_or_admin" on profiles
  for update
  using (id = auth.uid() or is_admin())
  with check (
    is_admin()
    or (id = auth.uid() and role = (select p.role from profiles p where p.id = auth.uid()))
  );
