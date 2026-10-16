-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário.
--
-- Exceção pontual e auditável para vendas antigas cujo XML da NF-e não
-- incluía o frete da mesma forma que a venda — só pra elas, nunca uma
-- mudança permanente da regra de conferência. Hoje a única candidata real
-- é a intake e3eefc98-46d0-4e6a-b261-d48f47dac11f (STI3 23771, Tatiane):
-- conferida manualmente, diferença de R$34,00 entre NF-e (R$139,99) e
-- venda (R$173,99) — valor plausível de frete legado. As outras 3 vendas
-- não encerradas da mesma leva (STI3 23716/23739/23751) foram conferidas
-- manualmente e NÃO têm divergência de valor — não recebem override.
--
-- IMPORTANTE: a constraint de `fulfillment_intake_audit_logs.action` abaixo
-- foi reconstruída a partir do valor REAL hoje em Production (12 ações,
-- incluindo INTAKE_EDITED — aplicado numa migration de outra branch ainda
-- não mergeada neste repositório, mas já aplicada no banco real), não a
-- partir do que src/types/database.ts descreve nesta branch (que está
-- desatualizado em 1 valor). Reaplicar com só os 11 valores que este
-- repositório "conhece" apagaria silenciosamente o INTAKE_EDITED já em
-- produção — por isso os 12 valores atuais + o novo, nunca menos.

-- 1) Tabela do override — mesmo padrão de fulfillment_intake_edit_history
--    (append-only, RLS só leitura admin, escrita só pela RPC abaixo).
create table fulfillment_intake_legacy_overrides (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references fulfillment_intakes(id) on delete cascade,
  override_type text not null check (override_type = 'LEGACY_FREIGHT_VALUE_OVERRIDE'),
  reason_code text not null check (reason_code = 'LEGACY_FREIGHT_NOT_INCLUDED_IN_NFE'),
  actor_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_by uuid null references profiles(id)
);

-- Só 1 override ATIVO por intake (permite revogar + reaplicar no futuro,
-- nunca duplica um ativo) — a "proteção contra override ativo duplicado"
-- pedida é garantida no banco, não só na aplicação.
create unique index fulfillment_intake_legacy_overrides_active_idx
  on fulfillment_intake_legacy_overrides (intake_id, override_type)
  where revoked_at is null;

create index fulfillment_intake_legacy_overrides_intake_idx
  on fulfillment_intake_legacy_overrides (intake_id);

alter table fulfillment_intake_legacy_overrides enable row level security;

revoke all on fulfillment_intake_legacy_overrides from public;
revoke all on fulfillment_intake_legacy_overrides from anon;
revoke all on fulfillment_intake_legacy_overrides from authenticated;
grant select on fulfillment_intake_legacy_overrides to authenticated;

drop policy if exists "legacy_overrides_admin_read" on fulfillment_intake_legacy_overrides;
create policy "legacy_overrides_admin_read" on fulfillment_intake_legacy_overrides
  for select using (is_admin());

comment on table fulfillment_intake_legacy_overrides is
  'Exceção explícita e auditável, só para intakes antigos selecionados manualmente — nunca uma regra automática por data. Hoje só a Tatiane/STI3 23771 é candidata real.';

-- 2) Amplia a constraint de ação do audit log existente (12 valores reais
--    de Production + o novo) — nunca recriar com menos do que já está lá.
alter table fulfillment_intake_audit_logs
  drop constraint fulfillment_intake_audit_logs_action_check,
  add constraint fulfillment_intake_audit_logs_action_check
    check (action = any (array[
      'INTAKE_CREATED',
      'INTAKE_LINK_OPENED',
      'INTAKE_DATA_RECEIVED',
      'INTAKE_LINK_REOPENED',
      'INTAKE_CHECK_STARTED',
      'INTAKE_BLOCKED',
      'INTAKE_CHECK_RESTARTED',
      'INTAKE_REVIEW_COMPLETED',
      'INTAKE_APPROVED',
      'FULFILLMENT_CREATED',
      'INTAKE_CANCELLED',
      'INTAKE_EDITED',
      'LEGACY_FREIGHT_OVERRIDE_APPLIED'
    ]));

-- 3) RPC SECURITY DEFINER: valida quem chama, grava o override e o audit
--    log NA MESMA transação (ou os dois, ou nenhum). Duas formas de chamar:
--      a) sessão autenticada do Admin/Master (futura tela do Admin) — exige
--         is_admin() via auth.uid(), igual a toda outra RPC deste módulo;
--      b) o script de regularização, com a service role key (sem sessão,
--         auth.uid() é null) — nesse caso confia em quem já tem a service
--         role key (mesmo nível de confiança do importador histórico,
--         scripts/import-fulfillment-history.mts, que já grava direto nas
--         tabelas com a mesma chave) e exige que o `p_actor` informado seja
--         de fato um perfil admin/master — nunca aceita um ator qualquer.
create or replace function public.apply_legacy_freight_override(
  p_intake uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intake fulfillment_intakes%rowtype;
  v_actor uuid;
  v_override_id uuid;
begin
  if auth.uid() is not null then
    if not is_admin() then
      raise exception 'sem permissão para aplicar o override' using errcode = '42501';
    end if;
    v_actor := auth.uid();
  else
    if not exists (select 1 from profiles where id = p_actor and role in ('admin', 'master')) then
      raise exception 'ator informado não é admin/master' using errcode = '42501';
    end if;
    v_actor := p_actor;
  end if;

  select * into v_intake from fulfillment_intakes where id = p_intake for update;
  if not found then
    raise exception 'intake não encontrado';
  end if;
  if v_intake.status in ('APPROVED', 'CANCELLED') then
    raise exception 'intake já encerrado (status %) — override não se aplica mais', v_intake.status;
  end if;

  if exists (
    select 1 from fulfillment_intake_legacy_overrides
    where intake_id = p_intake and override_type = 'LEGACY_FREIGHT_VALUE_OVERRIDE' and revoked_at is null
  ) then
    raise exception 'já existe override de frete legado ativo para este intake';
  end if;

  insert into fulfillment_intake_legacy_overrides (intake_id, override_type, reason_code, actor_id)
  values (p_intake, 'LEGACY_FREIGHT_VALUE_OVERRIDE', 'LEGACY_FREIGHT_NOT_INCLUDED_IN_NFE', v_actor)
  returning id into v_override_id;

  insert into fulfillment_intake_audit_logs (intake_id, action, actor_id, details)
  values (
    p_intake,
    'LEGACY_FREIGHT_OVERRIDE_APPLIED',
    v_actor,
    jsonb_build_object('override_type', 'LEGACY_FREIGHT_VALUE_OVERRIDE', 'reason_code', 'LEGACY_FREIGHT_NOT_INCLUDED_IN_NFE')
  );

  return v_override_id;
end;
$$;

revoke all on function public.apply_legacy_freight_override(uuid, uuid) from public;
revoke all on function public.apply_legacy_freight_override(uuid, uuid) from anon;
grant execute on function public.apply_legacy_freight_override(uuid, uuid) to authenticated;
grant execute on function public.apply_legacy_freight_override(uuid, uuid) to service_role;
