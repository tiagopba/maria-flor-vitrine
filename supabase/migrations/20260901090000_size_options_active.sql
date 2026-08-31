-- ============================================================================
-- SIZE_OPTIONS: catálogo central de tamanhos reutilizáveis (admin/tamanhos)
-- ============================================================================
-- size_options já existe desde a migration inicial (label unique, position).
-- Nunca foi usada de fato — SizeSelector usava listas fixas no código.
-- Aqui só adicionamos "active" (pra permitir desativar sem apagar histórico
-- de tamanhos já usados em product_sizes) e um índice de listagem, mais um
-- seed idempotente com os tamanhos realmente em uso hoje em product_sizes.
-- Nada aqui altera product_sizes (que continua guardando o tamanho como
-- texto livre, independente de qualquer rename futuro em size_options).

alter table size_options
  add column if not exists active boolean not null default true;

create index if not exists size_options_active_position_idx on size_options (active, position);

-- "Unico" mantido sem acento de propósito — é exatamente o valor gravado
-- hoje em product_sizes para peças de tamanho único. Não normalizar para
-- "ÚNICO" aqui; isso alteraria silenciosamente um dado histórico.
insert into size_options (label, position) values
  ('PP', 0), ('P', 10), ('M', 20), ('G', 30), ('GG', 40),
  ('34', 50), ('36', 60), ('38', 70), ('40', 80), ('42', 90), ('44', 100), ('46', 110),
  ('Unico', 120)
on conflict (label) do nothing;
