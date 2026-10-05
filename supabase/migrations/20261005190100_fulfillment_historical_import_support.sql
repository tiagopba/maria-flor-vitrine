-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: Preview e Production compartilham o mesmo banco).
-- ============================================================================
-- fulfillment_records: suporte a registros HISTÓRICOS (planilha antiga), que
-- não têm DANFE nem etiqueta em PDF.
--
-- NÃO edita a migration 20261005120000 (já aplicada): só ADICIONA colunas e
-- AFROUXA/SUBSTITUI constraints por versões equivalentes ou mais amplas, de
-- forma que todo registro existente continua válido (o registro real atual
-- vira PDF_UPLOAD pelo default). Nunca cria caminho de PDF falso.
--
--   record_source   PDF_UPLOAD (default) | HISTORICAL_IMPORT
--   import_batch    lote da importação (arquivo) — permite desfazer um lote
--   import_ref      chave ESTÁVEL da linha na importação (índice único parcial):
--                   reimportar o mesmo arquivo não duplica, e duas linhas
--                   idênticas em posições diferentes continuam distintas
--                   (a posição original da linha faz parte da chave)
--
-- Regras no banco:
--   - PDF_UPLOAD continua exigindo DANFE + etiqueta;
--   - HISTORICAL_IMPORT pode não ter documentos;
--   - histórico exige import_batch + import_ref; upload por PDF não os tem;
--   - delivery_status ganha UNKNOWN ("Situação não informada"), e UNKNOWN só
--     pode existir em registro HISTORICAL_IMPORT (nunca usar PENDING para
--     vendas antigas sem informação).
--
-- Idempotente. Sem DROP de dado, sem UPDATE/DELETE de linhas.
-- ============================================================================

alter table public.fulfillment_records
  add column if not exists record_source text not null default 'PDF_UPLOAD',
  add column if not exists import_batch text,
  add column if not exists import_ref text;

alter table public.fulfillment_records drop constraint if exists fulfillment_records_record_source_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_record_source_check
  check (record_source in ('PDF_UPLOAD', 'HISTORICAL_IMPORT'));

-- Caminhos dos PDFs passam a ser opcionais NO NÍVEL DA COLUNA; quem exige é a
-- constraint por origem logo abaixo.
alter table public.fulfillment_records alter column danfe_file_path drop not null;
alter table public.fulfillment_records alter column label_file_path drop not null;

alter table public.fulfillment_records drop constraint if exists fulfillment_records_files_by_source_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_files_by_source_check
  check (
    record_source = 'HISTORICAL_IMPORT'
    or (danfe_file_path is not null and label_file_path is not null)
  );

alter table public.fulfillment_records drop constraint if exists fulfillment_records_import_fields_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_import_fields_check
  check (
    (record_source = 'HISTORICAL_IMPORT' and import_batch is not null and import_ref is not null)
    or (record_source = 'PDF_UPLOAD' and import_batch is null and import_ref is null)
  );

-- Status logístico: os 6 de antes + UNKNOWN (superconjunto — nenhuma linha atual quebra).
alter table public.fulfillment_records drop constraint if exists fulfillment_records_delivery_status_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_delivery_status_check
  check (delivery_status in ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'RESENT', 'REFUNDED', 'DELIVERY_ISSUE', 'UNKNOWN'));

alter table public.fulfillment_records drop constraint if exists fulfillment_records_unknown_only_historical_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_unknown_only_historical_check
  check (delivery_status <> 'UNKNOWN' or record_source = 'HISTORICAL_IMPORT');

-- Idempotência da importação: uma linha da planilha só entra uma vez.
create unique index if not exists fulfillment_records_import_ref_uniq
  on public.fulfillment_records (import_ref)
  where import_ref is not null;

create index if not exists fulfillment_records_import_batch_idx
  on public.fulfillment_records (import_batch)
  where import_batch is not null;

-- Listagem ordenada por data da venda (e depois criação): importar hoje uma
-- venda antiga não a joga para o topo.
create index if not exists fulfillment_records_sale_created_idx
  on public.fulfillment_records (sale_date desc, created_at desc, id);
