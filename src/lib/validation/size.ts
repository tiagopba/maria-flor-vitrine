import { z } from "zod";

export const sizeOptionSchema = z.object({
  label: z.string().trim().min(1, "Informe o tamanho.").max(20, "Tamanho muito longo."),
});

export type SizeOptionInput = z.infer<typeof sizeOptionSchema>;
