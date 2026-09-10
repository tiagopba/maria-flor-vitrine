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
--       { "label_size": "P", "fit_sizes": [36, 38] },
--       { "label_size": "M", "fit_sizes": [38, 40] },
--       { "label_size": "G", "fit_sizes": [] }
--     ]
--   }
-- ]
--
-- "sizes" precisa ser o ESTADO COMPLETO daquele produto: o conjunto de
-- label_size enviado tem que ser EXATAMENTE igual (mesmo conjunto, ordem
-- não importa) ao conjunto atual de product_sizes.size daquele product_id —
-- nunca um patch parcial. G com fit_sizes:[] é válido (tamanho existe,
-- vestibilidade ainda pendente); G AUSENTE do payload quando ainda existe
-- em product_sizes é erro (incomplete_size_set), nunca silenciosamente
-- apagado.
--
-- Validação, em duas rodadas:
--
--   Passe 1 (estrutural, não depende de estado mutável do banco — falha
--   rápido antes de sequer tentar travar nada):
--     1) is_catalog_editor_or_admin() — mesma regra administrativa de sempre.
--     2) payload é array; cada product_id existe, é válido, e não se repete
--        no array principal (duplicate_product_id).
--     3) dentro de cada produto, label_size não pode se repetir
--        (duplicate_label_size) — nunca vira "última entrada ganha" nem
--        soma silenciosa.
--     4) fit_size: dígitos apenas, convertido via `numeric` (nunca `::int`
--        direto — evita "integer out of range" numa string gigantesca),
--        > 0 e <= 32767 (limite real do smallint da coluna). fit_sizes
--        repetidos DENTRO do mesmo label_size continuam sendo deduplicados
--        deterministicamente (`distinct`), isso não é erro estrutural.
--     5) (checagem rápida, não autoritativa) cada label_size existe em
--        product_sizes hoje — só pra falhar cedo em payload obviamente
--        errado; a checagem que realmente decide é a Passe 2, abaixo.
--
--   Trava (FOR UPDATE) as linhas de `products` de todos os product_ids
--   envolvidos, em ordem determinística de id — mesmo padrão já usado em
--   save_product_with_variants (que também trava a linha de `products`
--   antes de tocar em product_sizes). Como as duas functions travam a
--   MESMA linha antes de escrever product_sizes/esta tabela, elas nunca
--   correm em paralelo sobre o mesmo produto: uma espera a outra commitar.
--   Não foi criado nenhum advisory lock novo — o row lock existente já
--   resolve.
--
--   Passe 2 (autoritativa, roda DEPOIS da trava — por isso enxerga o
--   product_sizes mais atual possível, sem corrida com um
--   save_product_with_variants concorrente):
--     6) cada label_size do payload existe em product_sizes AGORA
--        (comparação exata, nunca normalizada — Único/Unico/UNICO
--        continuam textos diferentes aqui).
--     7) o conjunto é completo: nº de entradas em sizes[] == nº de linhas
--        atuais em product_sizes pra aquele produto. Como o passo 6 já
--        garante que todo label_size do payload existe em product_sizes
--        (é subconjunto) e o passo 3 já garante que o payload não tem
--        label_size repetido, bater a contagem prova que os dois conjuntos
--        são exatamente iguais — sem precisar comparar arrays elemento a
--        elemento. Se não bater: incomplete_size_set.
--
-- Escrita (Passe 3, só depois de TODA a validação acima): substituição
-- completa por produto (delete todas as linhas antigas do produto, insert
-- só o que veio validado no payload) — nunca update. label_size é
-- persistido exatamente como veio (já validado no passo 6 que é bit-a-bit
-- igual a um product_sizes.size existente). Sem ON CONFLICT DO NOTHING:
-- como product_id não se repete, label_size não se repete dentro de um
-- produto, e fit_size já vem deduplicado por label_size, a tripla
-- (product_id, label_size, fit_size) é estruturalmente única antes mesmo
-- do insert — inserted_count reflete exatamente o nº de linhas inseridas,
-- e qualquer colisão inesperada (bug em outro lugar) vira erro alto, nunca
-- escondida por um ON CONFLICT.
--
-- Nunca modifica product_sizes (só LÊ, nos passos de validação).
--
-- Se esta function falhar (qualquer exceção, em qualquer passo), toda a
-- transação dela é desfeita — nunca fica "P salvo, M salvo, G faltando" —
-- e nunca afeta um save_product_with_variants anterior, que já commitou
-- numa transação totalmente separada antes desta ser chamada.

create or replace function public.save_product_size_fit_compatibilities(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_product_id uuid;
  v_product_ids uuid[] := '{}';
  v_size_entry jsonb;
  v_label_size text;
  v_seen_label_sizes text[];
  v_fit_sizes jsonb;
  v_fit_size_text text;
  v_fit_size_numeric numeric;
  v_fit_size int;
  v_current_size_count int;
  v_payload_size_count int;
  v_inserted_count int := 0;
begin
  if not public.is_catalog_editor_or_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'invalid_payload';
  end if;

  -- ---- Passe 1: validação estrutural, nenhuma escrita, nenhuma trava ----
  for v_entry in select * from jsonb_array_elements(payload) loop
    v_product_id := nullif(v_entry->>'product_id', '')::uuid;
    if v_product_id is null then
      raise exception 'missing_product_id';
    end if;

    if v_product_id = any(v_product_ids) then
      raise exception 'duplicate_product_id:%', v_product_id;
    end if;

    if not exists (select 1 from public.products where id = v_product_id) then
      raise exception 'product_not_found:%', v_product_id;
    end if;

    v_product_ids := array_append(v_product_ids, v_product_id);
    v_seen_label_sizes := '{}';

    for v_size_entry in select * from jsonb_array_elements(coalesce(v_entry->'sizes', '[]'::jsonb)) loop
      v_label_size := v_size_entry->>'label_size';
      if v_label_size is null or btrim(v_label_size) = '' then
        raise exception 'missing_label_size:%', v_product_id;
      end if;

      if v_label_size = any(v_seen_label_sizes) then
        raise exception 'duplicate_label_size:%:%', v_product_id, v_label_size;
      end if;
      v_seen_label_sizes := array_append(v_seen_label_sizes, v_label_size);

      -- Checagem rápida (não autoritativa) — só pra falhar cedo antes de
      -- travar; a Passe 2, depois do lock, é quem realmente decide isso.
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

      -- Regex garante só dígitos antes de qualquer cast numérico. Cast pra
      -- `numeric` (nunca `::int` direto) porque `numeric` não estoura pra
      -- uma string de dígitos absurdamente grande — o "integer out of
      -- range" só apareceria tarde, na tentativa de converter pra int/
      -- smallint, e aqui a checagem de intervalo (> 0 e <= 32767, o teto
      -- real da coluna smallint) já roda ANTES dessa conversão final.
      for v_fit_size_text in select jsonb_array_elements_text(v_fit_sizes) loop
        if v_fit_size_text !~ '^[0-9]+$' then
          raise exception 'invalid_fit_size_value:%', v_fit_size_text;
        end if;
        v_fit_size_numeric := v_fit_size_text::numeric;
        if v_fit_size_numeric <= 0 or v_fit_size_numeric > 32767 then
          raise exception 'invalid_fit_size_value:%', v_fit_size_text;
        end if;
      end loop;
    end loop;
  end loop;

  if array_length(v_product_ids, 1) is null then
    raise exception 'empty_payload';
  end if;

  -- Trava os produtos envolvidos em ordem determinística de id — evita
  -- deadlock entre chamadas concorrentes que tocam conjuntos de produtos
  -- diferentes, e serializa esta function contra save_product_with_variants
  -- (que trava a mesma linha de `products` antes de reescrever
  -- product_sizes): uma sempre espera a outra terminar antes de prosseguir.
  perform 1 from public.products where id = any(v_product_ids) order by id for update;

  -- ---- Passe 2: validação final, AGORA travada — decide de verdade ----
  for v_entry in select * from jsonb_array_elements(payload) loop
    v_product_id := (v_entry->>'product_id')::uuid;

    for v_size_entry in select * from jsonb_array_elements(coalesce(v_entry->'sizes', '[]'::jsonb)) loop
      v_label_size := v_size_entry->>'label_size';
      if not exists (
        select 1 from public.product_sizes ps
        where ps.product_id = v_product_id and ps.size = v_label_size
      ) then
        raise exception 'label_size_not_in_product_sizes:%:%', v_product_id, v_label_size;
      end if;
    end loop;

    select count(*) into v_current_size_count
    from public.product_sizes ps
    where ps.product_id = v_product_id;

    v_payload_size_count := jsonb_array_length(coalesce(v_entry->'sizes', '[]'::jsonb));

    -- payload já provado subconjunto (loop acima) e sem label_size repetido
    -- (Passe 1) — bater a contagem com o total atual prova conjunto igual,
    -- sem precisar comparar array a array.
    if v_payload_size_count <> v_current_size_count then
      raise exception 'incomplete_size_set:%', v_product_id;
    end if;
  end loop;

  -- ---- Passe 3: substituição completa por produto ----
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
        values (v_product_id, v_label_size, v_fit_size);
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
