import { z } from "zod";

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

export const colorSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da cor.").max(60, "Nome muito longo."),
  hex_color: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || hexColorPattern.test(v), "Use um código de cor válido (ex: #D6217D)."),
});

export type ColorInput = z.infer<typeof colorSchema>;
