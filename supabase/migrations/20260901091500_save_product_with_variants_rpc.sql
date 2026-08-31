-- ============================================================================
-- save_product_with_variants: salvamento atômico de uma peça + suas cores
-- ============================================================================
-- Substitui, para o novo formulário multi-cor, o padrão anterior de
-- "validar tudo antes, depois escrever sequencialmente" por uma única
-- transação real: products, product_sizes, product_images, product_groups
-- e product_slug_redirects são todos escritos (ou nenhum é) dentro desta
-- function. Uploads de foto continuam acontecendo no Storage ANTES da
-- chamada (fora da transaction, que não tem como cobrir isso) — só os
-- registros no banco são atômicos.
--
-- Payload esperado, ver relatório entregue ao admin:
-- {
--   "root_product_id": uuid | null,        -- null na criação; id do
--                                           -- produto aberto na edição
--   "removed_variant_ids": [uuid, ...],
--   "shared": { name, description, category_id, price, promotional_price,
--               cash_price, max_installments_override },
--   "variants": [
--     { "id": uuid|null, "code", "color_id": uuid|null, "status", "featured",
--       "slug", "sizes": [text,...],
--       "images": [ { "id": uuid|null, "storage_path", "position" }, ... ] }
--   ]
-- }
--
-- product_group_id NUNCA vem do client — é sempre redescoberto no banco a
-- partir de root_product_id, pra um payload adulterado não conseguir mover
-- produtos entre grupos.

create or replace function public.save_product_with_variants(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root_id uuid;
  v_group_id uuid;
  v_is_new_group boolean := false;
  v_variant_ids uuid[];
  v_removed_ids uuid[];
  v_current_members uuid[];
  v_member uuid;
  v_owner_group uuid;
  v_final_variant_count int;
  v_lock_slugs text[];
  v_lock_slug text;

  v_variant jsonb;
  v_product_id uuid;
  v_existing_slug text;
  v_new_slug text;
  v_status text;
  v_size text;
  v_position int;
  v_image jsonb;
  v_image_id uuid;
  v_kept_image_ids uuid[];
  v_removed_paths jsonb := '[]'::jsonb;
  v_variant_removed jsonb;
  v_remaining_count int;
  v_result jsonb := '[]'::jsonb;
  v_shared jsonb := payload->'shared';
begin
  if not public.is_catalog_editor_or_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_final_variant_count := jsonb_array_length(payload->'variants');
  if v_final_variant_count = 0 then
    raise exception 'no_variants';
  end if;

  -- Regra da peça principal: com 2+ variantes, todas precisam ter cor
  -- definida (nunca mistura "Sem cor" com cores reais no mesmo conjunto).
  -- O formulário já bloqueia isso na UI antes de liberar "+ Adicionar outra
  -- cor"; aqui é a segunda camada, caso o payload chegue adulterado ou
  -- desatualizado.
  if v_final_variant_count > 1 and exists (
    select 1 from jsonb_array_elements(payload->'variants') v
    where nullif(v->>'color_id', '') is null
  ) then
    raise exception 'color_required_for_multi_variant';
  end if;

  v_root_id := nullif(payload->>'root_product_id', '')::uuid;

  v_removed_ids := coalesce(
    array(select (jsonb_array_elements_text(coalesce(payload->'removed_variant_ids', '[]'::jsonb)))::uuid),
    '{}'
  );

  select coalesce(array_agg((v->>'id')::uuid), '{}') into v_variant_ids
  from jsonb_array_elements(payload->'variants') as v
  where v->>'id' is not null and v->>'id' <> '';

  if exists (select 1 from unnest(v_variant_ids) x where x = any(v_removed_ids)) then
    raise exception 'variant_in_both_lists';
  end if;

  -- A peça que abriu a tela de edição nunca pode ser removida do conjunto
  -- nesta chamada (evitaria a própria página que está sendo editada deixar
  -- de pertencer ao grupo de forma inesperada). Remover justamente essa
  -- cor exigiria primeiro trocar qual peça é "principal" — fora de escopo
  -- desta versão.
  if v_root_id is not null and v_root_id = any(v_removed_ids) then
    raise exception 'cannot_remove_root_variant';
  end if;

  -- Trava a linha raiz (se houver) já aqui, serializando edições
  -- concorrentes do mesmo conjunto de cores, e descobre o grupo REAL --
  -- nunca confia em product_group_id vindo do client.
  if v_root_id is not null then
    select product_group_id into v_group_id from public.products where id = v_root_id for update;
    if not found then
      raise exception 'root_product_not_found';
    end if;
  end if;

  if v_group_id is null and v_final_variant_count > 1 then
    insert into public.product_groups default values returning id into v_group_id;
    v_is_new_group := true;
  end if;

  if v_group_id is not null and not v_is_new_group then
    -- Trava os demais membros atuais do grupo (o root já foi travado
    -- acima) em ordem determinística de id, pra serializar edições
    -- concorrentes do mesmo conjunto antes de ler quem realmente pertence
    -- a ele agora.
    perform 1 from public.products
    where product_group_id = v_group_id and id is distinct from v_root_id
    order by id
    for update;

    select coalesce(array_agg(id), '{}') into v_current_members
    from public.products where product_group_id = v_group_id;

    -- Reconciliação completa: todo membro atual precisa estar em
    -- variants[] OU em removed_variant_ids. Se algum ficou de fora — seja
    -- por bug de frontend, seja porque outra sessão alterou o conjunto
    -- nesse meio tempo — a trava acima já garante que este estado é o mais
    -- atual, então o erro abaixo é sempre o real motivo, nunca uma corrida.
    foreach v_member in array v_current_members loop
      if not (v_member = any(v_variant_ids) or v_member = any(v_removed_ids)) then
        raise exception 'group_members_incomplete';
      end if;
    end loop;
  end if;

  -- Valida propriedade de cada id real em variants[]: só pode ser (a) o
  -- próprio root ainda sem grupo (primeiras cores) ou (b) já pertencer ao
  -- grupo real encontrado acima. Nunca incorpora um id arbitrário.
  foreach v_member in array v_variant_ids loop
    select product_group_id into v_owner_group from public.products where id = v_member;
    if not found then
      raise exception 'variant_not_found:%', v_member;
    end if;
    if not (
      (v_group_id is not null and v_owner_group is not distinct from v_group_id)
      or (v_member = v_root_id and v_owner_group is null)
    ) then
      raise exception 'variant_not_in_group';
    end if;
  end loop;

  foreach v_member in array v_removed_ids loop
    if not exists (
      select 1 from public.products where id = v_member and product_group_id is not distinct from v_group_id
    ) then
      raise exception 'variant_not_in_group';
    end if;
  end loop;

  -- Advisory lock transacional determinístico pra cada slug que será
  -- lido/gravado nesta chamada (novo slug de cada variante + slug atual de
  -- quem estiver mudando de slug, que virará redirect). products.slug e
  -- product_slug_redirects.old_slug são tabelas diferentes sem constraint
  -- cruzada — sem isso, duas transações concorrentes poderiam validar o
  -- mesmo slug antes de qualquer uma comitar. Ordena os slugs em ordem
  -- determinística antes de travar, pra nunca haver deadlock entre
  -- chamadas concorrentes que envolvem conjuntos de slugs diferentes.
  select coalesce(array_agg(distinct s order by s), '{}') into v_lock_slugs
  from (
    select v->>'slug' as s
    from jsonb_array_elements(payload->'variants') as v
    union
    select p.slug as s
    from jsonb_array_elements(payload->'variants') as v
    join public.products p on p.id = nullif(v->>'id', '')::uuid
    where p.slug is distinct from v->>'slug'
  ) x
  where s is not null;

  foreach v_lock_slug in array v_lock_slugs loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_slug, 0));
  end loop;

  -- Desvincula as cores removidas — nunca apaga produto nem fotos.
  foreach v_member in array v_removed_ids loop
    update public.products set product_group_id = null where id = v_member;
  end loop;

  for v_variant in select * from jsonb_array_elements(payload->'variants') loop
    v_product_id := nullif(v_variant->>'id', '')::uuid;
    v_new_slug := v_variant->>'slug';
    v_status := v_variant->>'status';

    if v_status = 'ARCHIVED' then
      raise exception 'status_archived_not_allowed';
    end if;

    -- Checagem de slug agora protegida pelos advisory locks acima: nenhuma
    -- outra transação concorrente pode estar validando o mesmo texto de
    -- slug ao mesmo tempo.
    if exists (
      select 1 from public.products where slug = v_new_slug and id is distinct from v_product_id
    ) then
      raise exception 'slug_taken:%', v_new_slug;
    end if;
    if exists (
      select 1 from public.product_slug_redirects
      where old_slug = v_new_slug and product_id is distinct from v_product_id
    ) then
      raise exception 'slug_reserved:%', v_new_slug;
    end if;

    if v_product_id is not null then
      select slug into v_existing_slug from public.products where id = v_product_id;

      update public.products set
        code = v_variant->>'code',
        name = v_shared->>'name',
        slug = v_new_slug,
        description = nullif(v_shared->>'description', ''),
        price = (v_shared->>'price')::numeric,
        promotional_price = nullif(v_shared->>'promotional_price', '')::numeric,
        cash_price = nullif(v_shared->>'cash_price', '')::numeric,
        max_installments_override = nullif(v_shared->>'max_installments_override', '')::int,
        category_id = (v_shared->>'category_id')::uuid,
        status = v_status::public.product_status,
        featured = (v_variant->>'featured')::boolean,
        color_id = nullif(v_variant->>'color_id', '')::uuid,
        product_group_id = v_group_id
      where id = v_product_id;
      -- published_at/archived_at propositalmente fora deste SET — igual ao
      -- updateProduct atual, que nunca toca nos dois.

      -- O "on conflict do nothing" abaixo só é alcançado depois de provar
      -- que qualquer redirect pré-existente pra este old_slug já pertence
      -- a este MESMO product_id (idempotente) — nunca a outro (isso já
      -- teria disparado slug_reserved acima, antes de qualquer escrita), e
      -- já protegido pelo advisory lock deste slug adquirido acima.
      if v_existing_slug is distinct from v_new_slug then
        delete from public.product_slug_redirects where old_slug = v_new_slug and product_id = v_product_id;
        insert into public.product_slug_redirects (product_id, old_slug)
        values (v_product_id, v_existing_slug)
        on conflict (old_slug) do nothing;
      end if;

    else
      insert into public.products (
        code, name, slug, description, price, promotional_price, cash_price,
        max_installments_override, category_id, status, featured, color_id,
        product_group_id, published_at
      ) values (
        v_variant->>'code', v_shared->>'name', v_new_slug,
        nullif(v_shared->>'description', ''), (v_shared->>'price')::numeric,
        nullif(v_shared->>'promotional_price', '')::numeric, nullif(v_shared->>'cash_price', '')::numeric,
        nullif(v_shared->>'max_installments_override', '')::int, (v_shared->>'category_id')::uuid,
        v_status::public.product_status, (v_variant->>'featured')::boolean,
        nullif(v_variant->>'color_id', '')::uuid, v_group_id, now()
      ) returning id into v_product_id;
    end if;

    -- Tamanhos: apaga e regrava (mesmo padrão do updateProduct atual).
    delete from public.product_sizes where product_id = v_product_id;
    v_position := 0;
    for v_size in select jsonb_array_elements_text(v_variant->'sizes') loop
      insert into public.product_sizes (product_id, size, position) values (v_product_id, v_size, v_position);
      v_position := v_position + 1;
    end loop;

    -- Fotos: reconcilia com o estado final enviado. Imagem existente
    -- precisa comprovadamente pertencer a esta variante (id + product_id)
    -- — senão erro controlado, nunca vira insert silencioso. Só position é
    -- atualizado; storage_path de imagem existente nunca é reescrito pelo
    -- client. Arquivo físico não é apagado aqui — só devolvido em
    -- removed_image_paths pra aplicação limpar depois do commit.
    v_kept_image_ids := '{}';
    for v_image in select * from jsonb_array_elements(coalesce(v_variant->'images', '[]'::jsonb)) loop
      v_image_id := nullif(v_image->>'id', '')::uuid;

      if v_image_id is not null then
        if not exists (
          select 1 from public.product_images where id = v_image_id and product_id = v_product_id
        ) then
          raise exception 'image_not_owned_by_variant';
        end if;
        update public.product_images set position = (v_image->>'position')::int where id = v_image_id;
      else
        if nullif(v_image->>'storage_path', '') is null then
          raise exception 'image_storage_path_required';
        end if;
        insert into public.product_images (product_id, storage_path, position)
        values (v_product_id, v_image->>'storage_path', (v_image->>'position')::int)
        returning id into v_image_id;
      end if;

      v_kept_image_ids := array_append(v_kept_image_ids, v_image_id);
    end loop;

    select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into v_variant_removed
    from public.product_images
    where product_id = v_product_id and not (id = any(v_kept_image_ids));

    v_removed_paths := v_removed_paths || v_variant_removed;

    delete from public.product_images
    where product_id = v_product_id and not (id = any(v_kept_image_ids));

    v_result := v_result || jsonb_build_object('id', v_product_id, 'code', v_variant->>'code', 'slug', v_new_slug);
  end loop;

  -- Se o grupo ficou com 1 membro só (por causa de remoções), desfaz o
  -- grupo — não faz sentido manter conjunto de peça única.
  if v_group_id is not null then
    select count(*) into v_remaining_count from public.products where product_group_id = v_group_id;
    if v_remaining_count <= 1 then
      update public.products set product_group_id = null where product_group_id = v_group_id;
      delete from public.product_groups
      where id = v_group_id
        and not exists (select 1 from public.products where product_group_id = v_group_id);
      v_group_id := null;
    end if;
  end if;

  return jsonb_build_object('group_id', v_group_id, 'variants', v_result, 'removed_image_paths', v_removed_paths);
end;
$$;

revoke all on function public.save_product_with_variants(jsonb) from public;
revoke all on function public.save_product_with_variants(jsonb) from anon;
grant execute on function public.save_product_with_variants(jsonb) to authenticated;
