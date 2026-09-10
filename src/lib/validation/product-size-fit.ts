import { z } from "zod";

const sizeFitEntrySchema = z.object({
  label_size: z.string().trim().min(1, "Tamanho da etiqueta ausente."),
  fit_sizes: z.array(z.number().int().positive()).max(30, "Muitas numerações selecionadas."),
});

const productSizeFitSchema = z.object({
  product_id: z.string().uuid(),
  sizes: z.array(sizeFitEntrySchema).max(20, "Muitos tamanhos."),
});

/** Payload de save_product_size_fit_compatibilities — um item por produto
 * (cada cor/variante já salva é seu próprio product_id). Array vazio não é
 * aceito aqui: quem chama sempre sabe pelo menos os produtos que acabou de
 * salvar. */
export const saveProductSizeFitPayloadSchema = z
  .array(productSizeFitSchema)
  .min(1, "Nenhum produto informado.");

export type SaveProductSizeFitPayload = z.infer<typeof saveProductSizeFitPayloadSchema>;
export type ProductSizeFitEntry = z.infer<typeof productSizeFitSchema>;
