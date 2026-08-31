import { z } from "zod";
import { CATEGORY_ICON_KEYS } from "@/lib/catalog/category-icons";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(80, "Nome muito longo."),
  slug: z
    .string()
    .trim()
    .min(1, "Informe o slug.")
    .max(80, "Slug muito longo.")
    .regex(slugPattern, "Use apenas letras minúsculas, números e hífen."),
  description: z
    .string()
    .trim()
    .max(280, "Descrição muito longa.")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  cover_image: z.string().trim().url().optional().or(z.literal("")).transform((v) => (v ? v : null)),
  icon_key: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (CATEGORY_ICON_KEYS as readonly string[]).includes(v), "Ícone inválido."),
});

export type CategoryInput = z.infer<typeof categorySchema>;
