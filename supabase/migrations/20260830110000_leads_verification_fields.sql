-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Amplia `leads` (aditiva, mesmo espírito da migration anterior de campos
-- de marketing) com os campos de verificação real de propriedade do
-- contato, o vínculo com `auth.users` e o contador usado pelo rate limit
-- de envio de OTP por e-mail.
--
--   whatsapp_verified_at    timestamptz null
--   email_verified_at       timestamptz null
--   auth_user_id            uuid null, references auth.users(id)
--   otp_email_send_count    int not null default 0
--   otp_email_last_sent_at  timestamptz null
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
-- com `role = 'admin'`/`'catalog_editor'`, que só é criada manualmente por
-- quem já é admin — ver policy `profiles_admin_insert`). Referencia
-- `auth.users(id)` com `on delete set null`: se o registro de auth algum
-- dia for removido, o lead em si (dado de marketing) não desaparece junto.
--
-- otp_email_send_count / otp_email_last_sent_at: usados só pelo rate limit
-- de envio de código por e-mail em `startEmailOtp` (server-side) — não
-- guardam o código em si, só quando/quantas vezes foi pedido.
-- ============================================================================

alter table leads add column if not exists whatsapp_verified_at timestamptz;
alter table leads add column if not exists email_verified_at timestamptz;
alter table leads add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table leads add column if not exists otp_email_send_count int not null default 0;
alter table leads add column if not exists otp_email_last_sent_at timestamptz;

create index if not exists leads_auth_user_id_idx on leads (auth_user_id);
