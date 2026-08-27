# Regras de negócio — Maria Flor Vitrine

Estas regras são a fonte de verdade do produto. Qualquer mudança futura de
código deve respeitá-las; se uma feature nova conflitar com alguma delas, a
decisão de mudar a regra é do negócio, não do código.

1. **O site não garante estoque.** Nenhum status de produto (nem `ACTIVE`) é
   promessa contratual de disponibilidade. Toda venda depende de confirmação
   humana pela vendedora.
2. **A venda é sempre finalizada por uma vendedora**, fora da plataforma
   (WhatsApp). Não há checkout, carrinho, pagamento online ou emissão fiscal
   no MVP.
3. **O clique no WhatsApp (`WHATSAPP_CLICK`) é a conversão principal** do
   produto. Todo o resto (visualização, favorito, seleção de tamanho) é
   sinal de interesse que alimenta o Índice de Desejo, mas a métrica-chave é
   essa.
4. **Produtos não são deletados, são arquivados** (`status = ARCHIVED`).
   Isso preserva analytics, histórico e relacionamentos (looks, coleções).
5. **A cliente nunca precisa criar conta** para navegar, buscar, favoritar,
   selecionar tamanho ou clicar no WhatsApp. Captura de lead é sempre
   opcional e contextual.
6. **Analytics é parte do produto, não um extra.** Todo evento relevante
   (`analytics_events`) deve registrar sessão anônima, UTM e contexto
   (produto/categoria/provador/coleção/vendedora) sempre que fizer sentido.
7. **O cadastro de produto precisa ser rapidíssimo.** Qualquer decisão de UX
   no admin passa pelo teste: "isso ajuda ou atrapalha uma funcionária
   cadastrando 20 peças pelo celular?". Se atrapalhar, simplifica.
8. **O MVP não tem checkout.** Nada de carrinho, gateway de pagamento,
   reserva ou baixa automática de estoque, frete ou ERP nesta fase.

## Papéis administrativos

- `admin`: acesso total, incluindo configurações e vendedoras.
- `catalog_editor`: produtos, fotos, categorias, provadores, coleções.
- `seller`: papel preparado no schema para uso futuro (CRM/atribuição de
  leads), sem tela própria no MVP.

## Fórmula do Índice de Desejo

Única fonte de verdade: [`src/lib/desire-score/calculate.ts`](../src/lib/desire-score/calculate.ts).
Pesos configuráveis via `site_settings.DESIRE_SCORE_WEIGHTS` (padrão:
visualização=1, favorito=5, seleção de tamanho=7, clique WhatsApp=10).
Nunca duplicar essa fórmula em outro lugar do código.
