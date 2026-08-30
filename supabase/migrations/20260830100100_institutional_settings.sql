-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Reaproveita `site_settings` (já existente, key/value) para os dados
-- institucionais — sem tabela nova. Puramente aditiva: apenas `insert ...
-- on conflict do nothing`, nenhuma linha existente (WHATSAPP_MODE,
-- DESIRE_SCORE_WEIGHTS) é tocada.
--
-- Um único registro `INSTITUTIONAL_INFO` (jsonb com todos os campos, no
-- mesmo espírito de DESIRE_SCORE_WEIGHTS já existente) em vez de uma linha
-- por campo — mais simples de ler de uma vez só nas páginas institucionais.
--
-- Só populei com dado real o que você já me deu (razão social, CNPJ,
-- cidade/UF) — tudo que eu não tenho valor real (endereço, telefone,
-- WhatsApp da loja, Instagram, links do Maps/Waze/grupo de ofertas, foto
-- da fachada) fica null de propósito, não inventado. O app já foi
-- construído para tratar cada campo ausente com um estado visual elegante
-- (ex: sem o link do Maps configurado, o botão "Abrir no Google Maps"
-- simplesmente não aparece, em vez de aparecer quebrado).
--
-- `site_settings` só é lido pelo client admin (service role) dentro de
-- Server Components/Actions — mesmo padrão já usado para `sellers` neste
-- projeto — então não precisa de nenhuma policy de leitura pública nova
-- (a tabela já tem RLS habilitada com policy só para admin).
--
-- Edite os valores null diretamente pela Table Editor do Supabase quando
-- tiver os dados reais — não criei uma tela de admin para isso agora
-- (fora do escopo pedido).
-- ============================================================================

insert into site_settings (key, value) values
  ('INSTITUTIONAL_INFO', jsonb_build_object(
    'legal_name', 'EC DOS SANTOS - ME',
    'cnpj', '24.383.529/0001-08',
    'trade_name', 'Maria Flor',
    'tagline', 'Moda feminina',
    'city', 'Paranaíba',
    'state', 'MS',
    'address', null,
    'phone', null,
    'whatsapp', null,
    'instagram_url', null,
    'google_maps_url', null,
    'waze_url', null,
    'offers_group_url', null,
    'facade_photo_url', null,
    'hours', null
  )),
  ('PRIVACY_POLICY_VERSION', '"2026-08-30"'::jsonb)
on conflict (key) do nothing;
