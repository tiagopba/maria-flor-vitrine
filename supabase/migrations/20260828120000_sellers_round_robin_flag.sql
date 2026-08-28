-- ============================================================================
-- Vendedoras: campo para participar (ou não) da distribuição round-robin
-- (tabela `sellers` já existia desde a fundação — só estendendo)
-- ============================================================================

alter table sellers
  add column if not exists round_robin boolean not null default true;
