-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- ============================================================================
-- product_size_fit_compatibilities: numerações que cada tamanho da
-- etiqueta realmente veste, por produto — informação NOVA e independente,
-- nunca uma reinterpretação de product_sizes.
--
-- "Tamanho da etiqueta" (product_sizes.size — Único, P, M, G, GG, 36, 38...)
-- continua sendo, sozinho, a fonte de verdade pra estoque lógico, seleção
-- da peça, Minhas Roupas, mensagem da vendedora e analytics (SIZE_SELECTED)
-- — nada disso muda. Esta tabela só ACRESCENTA, por etiqueta, quais
-- numerações (34, 36, 38...) aquela modelagem específica veste — dado que
-- varia peça a peça, nunca presumido globalmente (Único não é sempre
-- 36–42; P não é sempre 36/38).
--
-- Por que NÃO referencia product_sizes.id (FK direta na linha):
-- save_product_with_variants (migration 20260901091500) apaga e regrava
-- TODAS as linhas de product_sizes do produto em TODO salvamento, mesmo
-- quando os tamanhos em si não mudam (delete + insert, nunca update — ver
-- linhas 275-281 daquela function). Um FK em product_sizes.id, mesmo com
-- "on delete cascade", perderia toda a compatibilidade cadastrada a cada
-- edição de produto (preço, nome, foto — qualquer campo), porque o
-- product_sizes.id antigo deixa de existir e um novo id (mesmo texto de
-- tamanho) é criado em seguida. Uma FK composta em (product_id, size) teria
-- o mesmo problema — o DELETE ainda dispara o cascade antes do INSERT
-- recriar a linha. Por isso a chave estável aqui é o TEXTO do tamanho
-- (product_id + label_size), exatamente como product_sizes.size já é
-- tratado hoje (texto livre, nunca um id relacional) — e a limpeza de
-- linhas órfãs (tamanho removido do produto) fica a cargo da RPC dedicada
-- da Fase 3, que já vai receber o conjunto atual de tamanhos a cada
-- chamada, nunca de um ON DELETE CASCADE. A policy pública abaixo também
-- garante, na leitura, que nenhuma linha órfã (label_size que não existe
-- mais em product_sizes) fica visível — mesmo que a limpeza da Fase 3
-- ainda não tenha rodado ou falhe.
--
-- fit_size é smallint (não text): "numeração que veste" é sempre um número
-- nesta modelagem (34, 36, 38...) — nunca "Único"/"P"/"M" (isso é sempre
-- label_size). Tipar como smallint impede gravar um valor não numérico por
-- engano e já deixa o futuro filtro público por numeração pronto pra
-- comparação/faixa numérica direta, sem parsing de texto.
--
-- Aditiva: nenhuma coluna/tabela existente é alterada, renomeada ou tem
-- dado convertido. product_sizes permanece exatamente como é.

create table if not exists product_size_fit_compatibilities (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  -- Texto exatamente como cadastrado em product_sizes.size para este
  -- produto (Único, P, M, G, GG, 36...) — nunca normalizado/reescrito aqui;
  -- normalização (Único/Unico/UNICO) é só para comparação em memória na
  -- aplicação, nunca persistida. btrim() aqui só rejeita "só espaços",
  -- nunca reescreve o valor gravado.
  label_size text not null check (btrim(label_size) <> ''),
  -- Numeração que a modelagem daquele label_size veste (34, 36, 38...).
  fit_size smallint not null,
  created_at timestamptz not null default now(),
  unique (product_id, label_size, fit_size)
);

comment on table product_size_fit_compatibilities is
  'Numerações que cada tamanho de etiqueta de um produto realmente veste — aditiva, independente de product_sizes. Configurável por produto; nunca presumida globalmente (Único/P/M/G não têm faixa fixa).';
comment on column product_size_fit_compatibilities.label_size is
  'Tamanho da etiqueta (mesmo texto de product_sizes.size para este produto) — sem FK direta: ver nota acima sobre save_product_with_variants apagar/regravar product_sizes a cada save.';
comment on column product_size_fit_compatibilities.fit_size is
  'Numeração que esse tamanho de etiqueta veste nesta modelagem específica (ex: 34, 36, 38...).';

-- Único índice extra necessário: a UNIQUE (product_id, label_size, fit_size)
-- acima já cria um índice cuja coluna líder é product_id, então "toda a
-- compatibilidade de um produto" (página do produto, admin, WhatsApp,
-- /selecao/[token]) já é atendido por ela — não precisa de outro índice só
-- de product_id. Este aqui é para o futuro filtro público por numeração
-- ("Qual numeração você veste?", NÃO ativado nesta fase): fit_size líder
-- atende "todo produto cuja compatibilidade contém X"; product_id junto
-- evita um lookup extra pra resolver o produto de cada linha encontrada.
create index if not exists product_size_fit_compatibilities_fit_product_idx
  on product_size_fit_compatibilities (fit_size, product_id);

-- ============================================================================
-- ROW LEVEL SECURITY — mesmo padrão de product_sizes (ver init_schema.sql)
-- ============================================================================
alter table product_size_fit_compatibilities enable row level security;

-- Leitura pública só da compatibilidade de produtos realmente visíveis —
-- primeiro exists idêntico a product_sizes_public_read, nunca expõe
-- compatibilidade de rascunho/arquivado/despublicado.
--
-- Segundo exists: só é pública a linha cujo label_size ainda existe DE
-- VERDADE em product_sizes para este produto agora. Sem isso, uma
-- compatibilidade órfã (tamanho removido da etiqueta depois de já ter
-- compatibilidade cadastrada, mas ainda não limpa pela RPC da Fase 3)
-- ficaria publicamente visível até a limpeza acontecer — esta segunda
-- condição fecha essa janela na própria RLS, não depende de nenhuma
-- limpeza assíncrona ter rodado. Comparação sempre exata (=), nunca
-- case-insensitive — mesma regra de nunca normalizar texto histórico:
-- label_size tem que bater com product_sizes.size byte a byte.
create policy "product_size_fit_compatibilities_public_read"
  on product_size_fit_compatibilities
  for select
  using (
    exists (
      select 1
      from products p
      where p.id = product_size_fit_compatibilities.product_id
        and p.status <> 'ARCHIVED'
        and p.published_at is not null
        and p.published_at <= now()
    )
    and exists (
      select 1
      from product_sizes ps
      where ps.product_id = product_size_fit_compatibilities.product_id
        and ps.size = product_size_fit_compatibilities.label_size
    )
  );

-- Gravação só por quem já pode editar produto hoje (admin/catalog_editor/
-- master, via is_catalog_editor_or_admin() — a mesma function usada por
-- product_sizes_admin_all) — nunca amplia o acesso de seller, que não tem
-- policy nenhuma aqui, exatamente como já não tem em product_sizes. Sem o
-- segundo exists da policy pública: a tela admin de revisão precisa
-- enxergar/gerenciar linhas órfãs também, não só as válidas.
create policy "product_size_fit_compatibilities_admin_all"
  on product_size_fit_compatibilities
  for all
  using (is_catalog_editor_or_admin())
  with check (is_catalog_editor_or_admin());
