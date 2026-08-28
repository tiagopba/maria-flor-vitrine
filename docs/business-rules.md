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

## Evolução futura planejada — preço à vista / a prazo

**Não implementar agora.** Registrado aqui só para orientar quando isso for
priorizado.

Hoje `products` tem `price` e `promotional_price`. No futuro, a loja quer
diferenciar **condição de pagamento** (à vista vs. a prazo), o que é
conceitualmente diferente de **promoção**:

- `promotional_price` continua existindo e continua significando promoção —
  **nunca reaproveitar esse campo para representar preço à vista**.
- A evolução prevista é acrescentar `cash_price` (preço à vista) e
  `installment_price` (preço a prazo) via **migration aditiva**, sem alterar
  ou remover colunas existentes.
- Ao aplicar essa migration, os produtos já cadastrados devem ser
  preenchidos automaticamente a partir do `price` atual (ex:
  `cash_price = price`, `installment_price = price`), para nenhum produto
  existente ficar com o campo vazio ou quebrar a exibição.
- Vitrine passaria a mostrar algo como "R$ 149,99 à vista" / "R$ 169,99 a
  prazo" — sem exigir recadastro de produtos, categorias, fotos ou mudança
  na estrutura do site.

## Fórmula do Índice de Desejo

Única fonte de verdade: [`src/lib/desire-score/calculate.ts`](../src/lib/desire-score/calculate.ts).
Pesos configuráveis via `site_settings.DESIRE_SCORE_WEIGHTS` (padrão:
visualização=1, favorito=5, seleção de tamanho=7, clique WhatsApp=10).
Nunca duplicar essa fórmula em outro lugar do código.
