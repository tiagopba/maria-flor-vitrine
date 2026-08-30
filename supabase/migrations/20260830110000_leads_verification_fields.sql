-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Amplia `leads` (aditiva) com os campos de verificação real de
-- propriedade do contato, o vínculo com `auth.users`, o token opaco de
-- retomada de progresso e o contador usado pelo rate limit de envio de
-- OTP por e-mail. Cria também uma função (RPC) pra tornar o rate limit
-- atômico.
--
--   whatsapp_verified_at       timestamptz null
--   email_verified_at          timestamptz null
--   auth_user_id                uuid null, references auth.users(id)
--   auth_user_id_conflict_at    timestamptz null
--   resume_token_hash           text null (único quando preenchido)
--   resume_token_expires_at     timestamptz null
--   otp_email_send_count        int not null default 0
--   otp_email_last_sent_at      timestamptz null
--
-- Nenhum dos dois campos de verificação é preenchido só por enviar o
-- formulário — só recebem timestamp depois de uma confirmação de verdade:
--   - email_verified_at: gravado pelo servidor (Server Action
--     `confirmEmailOtp`, client admin) só depois do Supabase Auth
--     confirmar o código de 6 dígitos enviado ao e-mail. O frontend nunca
--     grava essa coluna diretamente — só o servidor, e só após validar o
--     código com o próprio Supabase Auth.
--   - whatsapp_verified_at: coluna preparada agora, mas ainda SEM nenhum
--     código que a preencha — a confirmação real por WhatsApp depende da
--     integração com Twilio Verify, ainda não contratada/ativada.
--
-- auth_user_id: vem do próprio retorno de `verifyOtp()` (data.user.id) já
-- confirmado pelo Supabase — nunca aceito vindo do frontend. Serve pra
-- preparar uma conta de cliente/e-commerce futura; não concede nenhum
-- papel administrativo (isso continua exigindo uma linha em `profiles`
-- com `role = 'admin'`/`'catalog_editor'`, criada manualmente por quem já
-- é admin — ver policy `profiles_admin_insert`). Referencia
-- `auth.users(id)` com `on delete set null`: se o registro de auth algum
-- dia for removido, o lead em si (dado de marketing) não desaparece junto.
--
-- auth_user_id_conflict_at: se um e-mail já confirmado uma vez (com um
-- auth_user_id A) for confirmado de novo mas o Supabase devolver um
-- auth_user_id B diferente, NÃO sobrescrevemos A silenciosamente — só
-- marcamos aqui quando isso foi detectado, pra qualquer conversão futura
-- desse lead em conta de cliente exigir investigação manual antes.
--
-- resume_token_hash / resume_token_expires_at: recuperação de progresso
-- sem guardar e-mail/WhatsApp/nome no navegador. O navegador guarda só um
-- token aleatório opaco (32 bytes, gerado com crypto.randomBytes — 256
-- bits de entropia); gravamos aqui só o HASH SHA-256 dele, nunca o token
-- em texto puro (mesmo padrão de "nunca guardar segredo em claro" já
-- usado pro próprio código OTP, que fica só no Supabase Auth). TTL de 48h
-- checado tanto no servidor (resume_token_expires_at) quanto no cliente.
--
-- otp_email_send_count / otp_email_last_sent_at: usados pelo rate limit de
-- envio de código por e-mail, agora aplicado de forma ATÔMICA pela função
-- try_claim_email_otp_send abaixo — uma única instrução UPDATE por
-- chamada, com a checagem de cooldown/janela/limite no próprio WHERE, pra
-- duas requisições concorrentes não conseguirem passar do limite (o
-- UPDATE trava a linha; a segunda chamada só é avaliada depois que a
-- primeira já commitou sua contagem).
-- ============================================================================

alter table leads add column if not exists whatsapp_verified_at timestamptz;
alter table leads add column if not exists email_verified_at timestamptz;
alter table leads add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table leads add column if not exists auth_user_id_conflict_at timestamptz;
alter table leads add column if not exists resume_token_hash text;
alter table leads add column if not exists resume_token_expires_at timestamptz;
alter table leads add column if not exists otp_email_send_count int not null default 0;
alter table leads add column if not exists otp_email_last_sent_at timestamptz;

create index if not exists leads_auth_user_id_idx on leads (auth_user_id);

-- Único só quando preenchido — permite muitos leads com resume_token_hash
-- null (nunca geraram token, ou já expirou/foi limpo) sem violar unicidade.
create unique index if not exists leads_resume_token_hash_idx
  on leads (resume_token_hash) where resume_token_hash is not null;

-- ── Rate limit atômico de envio de OTP por e-mail ───────────────────────
-- Faz a checagem de cooldown (p_cooldown_seconds) + limite por janela
-- (p_max_per_window a cada p_window_seconds) e o incremento numa única
-- instrução UPDATE — não em "ler contador, decidir em JS, gravar depois",
-- que teria race condition sob concorrência. Retorna true só se o envio
-- foi liberado (e, nesse caso, já grava a tentativa); false se bloqueado
-- por cooldown ou limite — nesse caso não atualiza nada.
create or replace function try_claim_email_otp_send(
  p_lead_id uuid,
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
  update leads
  set
    otp_email_send_count = case
      when otp_email_last_sent_at is null
        or otp_email_last_sent_at < now() - make_interval(secs => p_window_seconds)
        then 1
      else otp_email_send_count + 1
    end,
    otp_email_last_sent_at = now()
  where id = p_lead_id
    and (
      otp_email_last_sent_at is null
      or otp_email_last_sent_at < now() - make_interval(secs => p_cooldown_seconds)
    )
    and (
      otp_email_last_sent_at is null
      or otp_email_last_sent_at < now() - make_interval(secs => p_window_seconds)
      or otp_email_send_count < p_max_per_window
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

-- Só o service role (usado pelas Server Actions) deve poder chamar isso —
-- não expor via RPC pública pra anon/authenticated poderem manipular o
-- contador de rate limit de um lead à vontade.
revoke execute on function try_claim_email_otp_send(uuid, int, int, int) from public;
revoke execute on function try_claim_email_otp_send(uuid, int, int, int) from anon;
revoke execute on function try_claim_email_otp_send(uuid, int, int, int) from authenticated;
grant execute on function try_claim_email_otp_send(uuid, int, int, int) to service_role;
