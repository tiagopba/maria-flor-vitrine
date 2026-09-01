# Módulos estáveis

Este arquivo lista módulos do projeto declarados **estáveis** — já
validados em produção, com regras de negócio aprovadas e confirmadas por
teste. Módulos aqui não devem ser alterados por acaso: features novas
(dashboard, analytics, Meta Pixel, CRM, Kanban, relatórios, marketing, ou
qualquer outra) devem apenas **consumir** os dados desses módulos, nunca
modificar sua lógica, formulário ou persistência.

Só alterar um módulo estável quando:

1. houver bug real reproduzido; ou
2. houver solicitação explícita do usuário.

Se uma implementação futura parecer exigir alteração estrutural num módulo
listado aqui, **parar e pedir autorização antes** de mexer. Não fazer
refatorações preventivas, reorganizações ou "melhorias" não solicitadas
nesses módulos.

---

## Módulo: Cadastro/Edição de Produtos — ESTÁVEL

Estabilizado em 2026-09-02, após a correção do bug de validação de cor em
produto com variante única (client bloqueava "Sem cor" mesmo com 1 única
variante, mais restritivo que a regra já aprovada no schema/RPC).

Cobertos por esta estabilização:

- `ProductForm` ([src/app/admin/produtos/ProductForm.tsx](../src/app/admin/produtos/ProductForm.tsx))
- `VariantBlock` ([src/app/admin/produtos/VariantBlock.tsx](../src/app/admin/produtos/VariantBlock.tsx))
- Cadastro e edição de produtos
- Variantes por cor
- Regra "Sem cor" (`color_id = null` válido com 1 única variante; 2+
  variantes exigem cor real em todas)
- Tamanhos
- Upload, remoção, foto principal e ordenação de fotos
- Código do produto
- Slug e redirects de slug
- Agrupamento de variantes (`product_group_id`)
- `featured`
- `status`
- `save_product_with_variants` (RPC) e demais RPCs relacionadas ao
  salvamento de produtos

### Regra para futuras features

Dashboard, Analytics, Meta Pixel, CRM, Kanban, relatórios, marketing ou
qualquer outro módulo futuro devem apenas **consumir** dados de produtos
(leitura). Não devem modificar regras, formulário ou persistência deste
módulo.
