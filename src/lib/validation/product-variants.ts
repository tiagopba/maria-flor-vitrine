import { z } from "zod";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const codePattern = /^[A-Za-z0-9-]+$/;

// ARCHIVED nunca é permitido por este fluxo — arquivar continua sendo só a
// ação separada (toggleArchiveProductAction), que sabe cuidar do
// archived_at corretamente. A RPC também recusa "ARCHIVED" como segunda
// camada de proteção.
const NON_ARCHIVED_STATUS_VALUES = ["ACTIVE", "LAST_UNITS", "CHECK_AVAILABILITY", "SOLD_OUT"] as const;

const variantImageSchema = z.object({
  id: z.string().uuid().nullable(),
  storage_path: z.string().trim().min(1),
  position: z.number().int().min(0),
});

const variantSchema = z.object({
  id: z.string().uuid().nullable(),
  code: z
    .string()
    .trim()
    .min(1, "Informe o código.")
    .max(40, "Código muito longo.")
    .regex(codePattern, "Use letras, números e hífen."),
  color_id: z.string().uuid().nullable(),
  status: z.enum(NON_ARCHIVED_STATUS_VALUES, { error: "Selecione um status válido." }),
  featured: z.boolean(),
  slug: z
    .string()
    .trim()
    .min(1, "Informe o slug.")
    .max(160, "Slug muito longo.")
    .regex(slugPattern, "Use apenas letras minúsculas, números e hífen."),
  sizes: z.array(z.string().trim().min(1).max(20)).max(20, "Muitos tamanhos selecionados."),
  images: z.array(variantImageSchema).max(30, "Muitas fotos."),
});

const sharedSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome.").max(140, "Nome muito longo."),
    description: z.string().trim().max(2000, "Descrição muito longa.").nullable(),
    category_id: z.string({ error: "Selecione uma categoria." }).uuid("Selecione uma categoria."),
    price: z.number({ error: "Informe um preço válido." }).positive("Preço deve ser maior que zero."),
    promotional_price: z.number().positive("Preço promocional inválido.").nullable(),
    cash_price: z.number().min(0, "Preço no Pix inválido.").nullable(),
    max_installments_override: z.number().int().positive("Número de parcelas inválido.").nullable(),
  })
  .refine((d) => d.promotional_price === null || d.promotional_price < d.price, {
    message: "O preço promocional deve ser menor que o preço normal.",
    path: ["promotional_price"],
  })
  .refine((d) => d.cash_price === null || d.cash_price <= d.price, {
    message: "O preço no Pix deve ser menor ou igual ao preço a prazo/cartão.",
    path: ["cash_price"],
  })
  .refine((d) => !(d.cash_price !== null && d.promotional_price !== null), {
    message: "Um produto não pode ter Preço no Pix e Preço promocional ao mesmo tempo nesta versão.",
    path: ["cash_price"],
  });

// root_product_id nunca é omitido do payload: null na criação, ou o id do
// produto que abriu a tela de edição. product_group_id NUNCA é enviado —
// a RPC redescobre o grupo real no banco a partir do root_product_id (ver
// migration save_product_with_variants_rpc.sql).
export const saveProductVariantsPayloadSchema = z
  .object({
    root_product_id: z.string().uuid().nullable(),
    removed_variant_ids: z.array(z.string().uuid()),
    shared: sharedSchema,
    variants: z.array(variantSchema).min(1, "Preencha os dados da peça antes de salvar."),
  })
  .refine((d) => d.variants.length === 1 || d.variants.every((v) => v.color_id !== null), {
    message: "Escolha a cor de cada peça antes de adicionar outra cor.",
    path: ["variants"],
  })
  .refine((d) => d.root_product_id === null || !d.removed_variant_ids.includes(d.root_product_id), {
    message: "Não é possível remover a peça que está sendo editada agora.",
    path: ["removed_variant_ids"],
  });

export type SaveProductVariantsPayload = z.infer<typeof saveProductVariantsPayloadSchema>;
export type VariantPayload = z.infer<typeof variantSchema>;
export type VariantImagePayload = z.infer<typeof variantImageSchema>;
