-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Amplia `leads` (aditiva, mesmo espírito da migration anterior de campos
-- de marketing) com duas colunas de verificação real de propriedade do
-- contato:
--
--   whatsapp_verified_at timestamptz null
--   email_verified_at    timestamptz null
--
-- Nenhuma das duas é preenchida só por enviar o formulário — só recebem
-- timestamp depois de uma confirmação de verdade:
--   - email_verified_at: gravado pelo servidor (Server Action
--     `confirmEmailOtp`, client admin) só depois do Supabase Auth
--     confirmar o código de 6 dígitos enviado ao e-mail. O frontend nunca
--     grava essa coluna diretamente — só o servidor, e só após validar o
--     código com o próprio Supabase Auth.
--   - whatsapp_verified_at: coluna preparada agora, mas ainda SEM nenhum
--     código que a preencha — a confirmação real por WhatsApp depende da
--     escolha de um provedor (Twilio, WhatsApp Cloud API ou equivalente),
--     que ainda não foi decidida nem aprovada. Ver relatório de opções
--     técnicas entregue junto com esta migration.
-- ============================================================================

alter table leads add column if not exists whatsapp_verified_at timestamptz;
alter table leads add column if not exists email_verified_at timestamptz;
