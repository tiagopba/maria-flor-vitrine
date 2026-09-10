-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- ============================================================================
-- save_product_size_fit_compatibilities: salvamento atômico e dedicado da
-- compatibilidade "tamanho da etiqueta → numerações que veste", SEPARADO
-- de save_product_with_variants (migration 20260901091500) — que continua
-- exatamente como está, nunca chamado nem alterado por esta function.
--
-- Payload esperado — array, um item por produto (cada cor/variante é seu
-- próprio product_id, ver product_group_id em products):
-- [
--   {
--     "product_id": uuid,
--     "sizes": [
--       { "label_size": "M", "fit_sizes": [38, 40] },
--       { "label_size": "G", "fit_sizes": [40, 42] }
--     ]
--   }
-- ]
--
-- Validação (tudo ANTES de escrever qualquer linha — uma entrada inválida
-- falha a chamada inteira, nunca grava parcialmente):
--   1) is_catalog_editor_or_admin() — mesma regra administrativa de sempre.
--   2) cada product_id precisa existir em products.
--   3) cada label_size precisa existir HOJE em product_sizes para aquele
--      product_id (comparação exata, nunca normalizada) — nunca aceita
--      compatibilidade pra um tamanho que a etiqueta não tem.
--   4) label_size é persistido exatamente como veio (já validado no passo
--      3 que é bit-a-bit igual a um product_sizes.size existente).
--
-- Escrita: substituição completa por produto (delete + insert, nunca
-- update) — mesmo padrão de product_sizes em save_product_with_variants.
-- Isso também é o que faz "remover tamanho da etiqueta" naturalmente
-- eliminar a compatibilidade correspondente: se um label_size deixou de
-- estar no payload (porque a admin não marcou mais aquele tamanho ou ele
-- não existe mais em product_sizes), a linha antiga dele é apagada e
-- nenhuma nova é criada pra ele.
--
-- fit_sizes duplicados no mesmo label_size dentro do payload nunca viram
-- erro — são apenas deduplicados (`distinct`) antes do insert.
--
-- Nunca modifica product_sizes (só LÊ, no passo de validação 3).
--
-- Se esta function falhar, a transação dela sozinha é desfeita — nunca
-- afeta um save_product_with_variants anterior, que já commitou numa
-- transação totalmente separada antes desta ser chamada.

create or replace function public.save_product_size_fit_compatibilities(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_product_id uuid;
  v_size_entry jsonb;
  v_label_size text;
  v_fit_sizes jsonb;
  v_fit_size_text text;
  v_fit_size int;
  v_product_ids uuid[] := '{}';
  v_inserted_count int := 0;
begin
  if not public.is_catalog_editor_or_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'invalid_payload';
  end if;

  -- ---- Passe 1: validação completa, nenhuma escrita ainda ----
  for v_entry in select * from jsonb_array_elements(payload) loop
    v_product_id := nullif(v_entry->>'product_id', '')::uuid;
    if v_product_id is null then
      raise exception 'missing_product_id';
    end if;

    if not exists (select 1 from public.products where id = v_product_id) then
      raise exception 'product_not_found:%', v_product_id;
    end if;

    v_product_ids := array_append(v_product_ids, v_product_id);

    for v_size_entry in select * from jsonb_array_elements(coalesce(v_entry->'sizes', '[]'::jsonb)) loop
      v_label_size := v_size_entry->>'label_size';
      if v_label_size is null or btrim(v_label_size) = '' then
        raise exception 'missing_label_size:%', v_product_id;
      end if;

      -- Comparação exata, byte a byte, contra product_sizes.size deste
      -- produto — nunca aceita um texto "parecido"/mal digitado nem
      -- normaliza (Único/Unico/UNICO continuam textos diferentes aqui).
      if not exists (
        select 1 from public.product_sizes ps
        where ps.product_id = v_product_id and ps.size = v_label_size
      ) then
        raise exception 'label_size_not_in_product_sizes:%:%', v_product_id, v_label_size;
      end if;

      v_fit_sizes := coalesce(v_size_entry->'fit_sizes', '[]'::jsonb);
      if jsonb_typeof(v_fit_sizes) is distinct from 'array' then
        raise exception 'invalid_fit_sizes:%:%', v_product_id, v_label_size;
      end if;

      -- Limite superior (999) é só uma trava de sanidade contra lixo/overflow
      -- — fit_size é smallint (máx. 32767) e nunca deveria receber algo fora
      -- de uma numeração de roupa real; isso garante que qualquer valor
      -- inválido falhe aqui, na Passe 1 (código:detalhe amigável), em vez de
      -- estourar como erro bruto de overflow do Postgres na hora do INSERT
      -- na Passe 2. Não é regra de negócio nenhuma (não infere P/M/G/etc.).
      for v_fit_size_text in select jsonb_array_elements_text(v_fit_sizes) loop
        if v_fit_size_text !~ '^[0-9]+$' or v_fit_size_text::int <= 0 or v_fit_size_text::int > 999 then
          raise exception 'invalid_fit_size_value:%', v_fit_size_text;
        end if;
      end loop;
    end loop;
  end loop;

  if array_length(v_product_ids, 1) is null then
    raise exception 'empty_payload';
  end if;

  -- Trava os produtos envolvidos em ordem determinística — evita deadlock
  -- entre chamadas concorrentes que tocam conjuntos de produtos diferentes
  -- (mesmo espírito dos advisory locks de slug em save_product_with_variants,
  -- só que aqui uma trava de linha simples já basta).
  perform 1 from public.products where id = any(v_product_ids) order by id for update;

  -- ---- Passe 2: substituição completa por produto ----
  delete from public.product_size_fit_compatibilities
  where product_id = any(v_product_ids);

  for v_entry in select * from jsonb_array_elements(payload) loop
    v_product_id := (v_entry->>'product_id')::uuid;

    for v_size_entry in select * from jsonb_array_elements(coalesce(v_entry->'sizes', '[]'::jsonb)) loop
      v_label_size := v_size_entry->>'label_size';

      for v_fit_size in
        select distinct jsonb_array_elements_text(coalesce(v_size_entry->'fit_sizes', '[]'::jsonb))::int
      loop
        insert into public.product_size_fit_compatibilities (product_id, label_size, fit_size)
        values (v_product_id, v_label_size, v_fit_size)
        on conflict (product_id, label_size, fit_size) do nothing;
        v_inserted_count := v_inserted_count + 1;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('product_ids', to_jsonb(v_product_ids), 'inserted_count', v_inserted_count);
end;
$$;

revoke all on function public.save_product_size_fit_compatibilities(jsonb) from public;
revoke all on function public.save_product_size_fit_compatibilities(jsonb) from anon;
grant execute on function public.save_product_size_fit_compatibilities(jsonb) to authenticated;
