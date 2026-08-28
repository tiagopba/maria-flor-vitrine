import { z } from "zod";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const codePattern = /^[A-Za-z0-9-]+$/;

export const PRODUCT_STATUS_VALUES = [
  "ACTIVE",
  "LAST_UNITS",
  "CHECK_AVAILABILITY",
  "SOLD_OUT",
  "ARCHIVED",
] as const;

export const productSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Informe o código.")
      .max(40, "Código muito longo.")
      .regex(codePattern, "Use letras, números e hífen."),
    name: z.string().trim().min(1, "Informe o nome.").max(140, "Nome muito longo."),
    slug: z
      .string()
      .trim()
      .min(1, "Informe o slug.")
      .max(160, "Slug muito longo.")
      .regex(slugPattern, "Use apenas letras minúsculas, números e hífen."),
    description: z
      .string()
      .trim()
      .max(2000, "Descrição muito longa.")
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    price: z.coerce.number({ error: "Informe um preço válido." }).positive("Preço deve ser maior que zero."),
    promotional_price: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .refine((v) => v === null || (Number.isFinite(v) && v > 0), "Preço promocional inválido."),
    category_id: z.string({ error: "Selecione uma categoria." }).uuid("Selecione uma categoria."),
    status: z.enum(PRODUCT_STATUS_VALUES),
    featured: z.boolean(),
  })
  .refine((data) => data.promotional_price === null || data.promotional_price < data.price, {
    message: "O preço promocional deve ser menor que o preço normal.",
    path: ["promotional_price"],
  });

export type ProductInput = z.infer<typeof productSchema>;

export const productSizesSchema = z
  .array(z.string().trim().min(1).max(20))
  .max(20, "Muitos tamanhos selecionados.");
