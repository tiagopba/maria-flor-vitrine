-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: Preview e Production compartilham o mesmo banco).
-- ============================================================================
-- Módulo "Faturamento e Envios": identificação única de cliente por CPF.
--
-- Aditiva e isolada: cria só objetos NOVOS (1 tabela, 1 função, 1 coluna em
-- fulfillment_records). Não altera, não remove e não sobrescreve nenhum dado
-- existente — customer_id nasce NULL em todo registro atual e só é
-- preenchido pelo backfill abaixo, nunca inventando CPF ou nome.
--
-- Cliente sem CPF com dígito verificador válido (nunca teve, ou tem só
-- formato-válido por erro de digitação no cadastro manual — ver
-- diagnóstico desta fase) NUNCA ganha customer_id, de propósito: a FK é
-- nullable e todo o resto do módulo continua funcionando exatamente como
-- hoje para essas vendas, sem exigir vínculo.
--
-- Diagnóstico read-only rodado antes desta migration (39 vendas em
-- fulfillment_records, produção): 0 sem CPF, 0 com CNPJ, 0 com CPF
-- formato-válido mas dígito verificador inválido, 35 clientes distintos,
-- 2 CPFs repetidos (6 vendas no total), as 2 com nome grafado diferente
-- entre vendas — por isso display_name nasce do nome mais RECENTE
-- (sale_date desc), e o nome de cada venda continua intacto em
-- fulfillment_records.customer_name (nunca sobrescrito).
-- ============================================================================

-- Transação explícita: todo o arquivo aplica tudo-ou-nada (Postgres suporta
-- DDL transacional) — se qualquer instrução abaixo falhar, nada deste
-- arquivo fica meio-aplicado.
begin;

-- ── Função utilitária: valida dígito verificador de CPF.
-- Replica fielmente o algoritmo de src/lib/intake/cpf.ts (isValidCpf) — se
-- aquele algoritmo mudar um dia, atualizar os dois juntos. Usada só aqui
-- (backfill/constraint de customers); nunca substitui a validação do
-- formulário (zod, no app).
create or replace function public.is_valid_cpf(digits text)
returns boolean
language plpgsql
immutable
as $$
declare
  i int;
  sum9 int := 0;
  sum10 int := 0;
  rest9 int;
  rest10 int;
begin
  if digits !~ '^[0-9]{11}$' then
    return false;
  end if;
  -- Mesma checagem de "todos os dígitos iguais" do isValidCpf em TS, mas sem
  -- backreference de regex (\1) nem \d — nenhuma outra CHECK deste projeto
  -- usa esses recursos; enumerar os 10 casos é só tão correto e fica óbvio
  -- de revisar.
  if digits in (
    '00000000000', '11111111111', '22222222222', '33333333333', '44444444444',
    '55555555555', '66666666666', '77777777777', '88888888888', '99999999999'
  ) then
    return false;
  end if;

  for i in 0..8 loop
    sum9 := sum9 + (substr(digits, i + 1, 1)::int) * (10 - i);
  end loop;
  rest9 := (sum9 * 10) % 11;
  if rest9 = 10 then rest9 := 0; end if;
  if rest9 <> substr(digits, 10, 1)::int then
    return false;
  end if;

  for i in 0..9 loop
    sum10 := sum10 + (substr(digits, i + 1, 1)::int) * (11 - i);
  end loop;
  rest10 := (sum10 * 10) % 11;
  if rest10 = 10 then rest10 := 0; end if;
  if rest10 <> substr(digits, 11, 1)::int then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.is_valid_cpf(text) from public, anon, authenticated;

-- ── Tabela de clientes: cpf_digits é a chave de negócio (única), nunca o nome.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  cpf_digits text not null unique check (cpf_digits ~ '^[0-9]{11}$' and public.is_valid_cpf(cpf_digits)),
  -- Nome de exibição = o mais recente informado. Nomes anteriores da mesma
  -- cliente continuam intactos em cada fulfillment_records.customer_name —
  -- nunca apagados, só não são mais o "nome atual" mostrado aqui.
  display_name text not null check (length(btrim(display_name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sem índice extra em cpf_digits: o `unique` acima já cria o índice btree
-- correspondente sozinho — um `create index` adicional na mesma coluna só
-- duplicaria o trabalho em todo insert/update, sem ganho nenhum de leitura.

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
revoke all on table public.customers from anon;

drop policy if exists "customers_admin_all" on public.customers;
create policy "customers_admin_all" on public.customers
  for all using (is_admin()) with check (is_admin());

revoke all privileges on table public.customers from anon, authenticated, public;
grant select, insert, update on table public.customers to authenticated;

-- ── fulfillment_records ganha o vínculo opcional.
alter table public.fulfillment_records
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists fulfillment_records_customer_id_idx
  on public.fulfillment_records (customer_id);

-- ── Backfill 1/2: 1 customer por CPF válido, nome = o da venda mais recente.
insert into public.customers (cpf_digits, display_name)
select distinct on (r.customer_cpf)
  r.customer_cpf,
  r.customer_name
from public.fulfillment_records r
where r.customer_cpf ~ '^[0-9]{11}$'
  and public.is_valid_cpf(r.customer_cpf)
order by r.customer_cpf, r.sale_date desc, r.created_at desc
on conflict (cpf_digits) do nothing;

-- ── Backfill 2/2: liga cada venda existente ao customer correspondente.
-- Idempotente — só preenche onde ainda está NULL.
update public.fulfillment_records r
   set customer_id = c.id
  from public.customers c
 where r.customer_cpf = c.cpf_digits
   and r.customer_id is null;

commit;
