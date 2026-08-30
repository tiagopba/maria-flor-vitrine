-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Amplia a tabela `leads` (já existente, desde o schema inicial) para o
-- módulo institucional — Grupo de Ofertas. Puramente aditiva: só
-- `add column if not exists`, nenhuma coluna/linha existente é alterada
-- ou removida.
--
-- Reaproveita a tabela `leads` já existente (com `name`, `whatsapp`,
-- `email`, `marketing_consent`, `whatsapp_consent`, `consent_timestamp`,
-- `consent_source`, `session_id`) em vez de criar uma base paralela —
-- ela já cobria a maior parte do que o formulário de Ofertas precisa.
--
-- Colunas novas:
--   whatsapp_normalized     — WhatsApp em formato internacional só dígitos
--                             (ex: 5567999999999), usado para deduplicar
--                             e para qualquer integração futura. `whatsapp`
--                             continua guardando o que a cliente digitou.
--   email_marketing_consent — consentimento específico de e-mail marketing
--                             (o checkbox único do formulário marca os
--                             três consentimentos — marketing_consent,
--                             whatsapp_consent e este — de uma vez, mas
--                             manter os três campos separados permite usar
--                             cada canal de forma independente no futuro).
--   privacy_policy_version  — qual versão da Política de Privacidade a
--                             cliente aceitou (rastreável mesmo se o texto
--                             mudar depois).
--   utm_source/medium/campaign/content, referrer — origem da cliente
--                             (Instagram Story, campanha, etc.), para medir
--                             campanhas futuramente.
--   updated_at               — quando o lead é atualizado em vez de
--                             duplicado (mesmo WhatsApp/e-mail já existente
--                             reenviando o formulário).
-- ============================================================================

alter table leads add column if not exists whatsapp_normalized text;
alter table leads add column if not exists email_marketing_consent boolean not null default false;
alter table leads add column if not exists privacy_policy_version text;
alter table leads add column if not exists utm_source text;
alter table leads add column if not exists utm_medium text;
alter table leads add column if not exists utm_campaign text;
alter table leads add column if not exists utm_content text;
alter table leads add column if not exists referrer text;
alter table leads add column if not exists updated_at timestamptz not null default now();

create index if not exists leads_whatsapp_normalized_idx on leads (whatsapp_normalized);
create index if not exists leads_email_idx on leads (email);
