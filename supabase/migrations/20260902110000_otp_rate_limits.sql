-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Rate limit atômico genérico para fluxos de OTP por e-mail, no mesmo
-- espírito de `try_claim_email_otp_send` (migration
-- 20260830110000_leads_verification_fields.sql) — mesma técnica (UPDATE
-- único com a checagem de cooldown/janela/limite no próprio WHERE, pra
-- duas requisições concorrentes nunca passarem do limite juntas), só que
-- reaproveitável por QUALQUER fluxo (uma linha por `key` livre, em vez de
-- ficar preso a `leads.id`) — usado agora pelo login master
-- (app/admin/login/master/actions.ts), mas serve pra qualquer OTP futuro
-- sem precisar de tabela nova.
--
-- Duas frentes:
--   send_count/last_sent_at     — quantos códigos foram pedidos (cooldown
--                                 entre pedidos + limite por janela).
--   attempt_count/last_attempt_at — quantas tentativas de VERIFICAR um
--                                 código (sem cooldown entre tentativas,
--                                 só um teto por janela — impede
--                                 força-bruta no código de 8 dígitos).
-- ============================================================================

create table if not exists otp_rate_limits (
  key text primary key,
  send_count int not null default 0,
  last_sent_at timestamptz,
  attempt_count int not null default 0,
  last_attempt_at timestamptz
);

alter table otp_rate_limits enable row level security;
-- Sem policy nenhuma de propósito (mesmo padrão de shared_selections/
-- analytics_events): só o service_role, dentro de Server Actions, lê ou
-- escreve aqui — nunca exposto a anon/authenticated via REST direto.

create or replace function try_claim_otp_send(
  p_key text,
  p_cooldown_seconds int,
  p_window_seconds int,
  p_max_per_window int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  insert into otp_rate_limits (key) values (p_key) on conflict (key) do nothing;

  update otp_rate_limits
  set
    send_count = case
      when last_sent_at is null
        or last_sent_at < now() - make_interval(secs => p_window_seconds)
        then 1
      else send_count + 1
    end,
    last_sent_at = now()
  where key = p_key
    and (
      last_sent_at is null
      or last_sent_at < now() - make_interval(secs => p_cooldown_seconds)
    )
    and (
      last_sent_at is null
      or last_sent_at < now() - make_interval(secs => p_window_seconds)
      or send_count < p_max_per_window
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function try_claim_otp_verify_attempt(
  p_key text,
  p_window_seconds int,
  p_max_attempts int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  insert into otp_rate_limits (key) values (p_key) on conflict (key) do nothing;

  update otp_rate_limits
  set
    attempt_count = case
      when last_attempt_at is null
        or last_attempt_at < now() - make_interval(secs => p_window_seconds)
        then 1
      else attempt_count + 1
    end,
    last_attempt_at = now()
  where key = p_key
    and (
      last_attempt_at is null
      or last_attempt_at < now() - make_interval(secs => p_window_seconds)
      or attempt_count < p_max_attempts
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke execute on function try_claim_otp_send(text, int, int, int) from public, anon, authenticated;
grant execute on function try_claim_otp_send(text, int, int, int) to service_role;

revoke execute on function try_claim_otp_verify_attempt(text, int, int) from public, anon, authenticated;
grant execute on function try_claim_otp_verify_attempt(text, int, int) to service_role;
