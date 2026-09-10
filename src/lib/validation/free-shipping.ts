import { z } from "zod";
import { isValidStateCode } from "@/lib/shipping/brazilian-states";

export const freeShippingRuleSchema = z.object({
  state_code: z.string().refine(isValidStateCode, { message: "Estado inválido." }),
  service: z.enum(["PAC", "SEDEX"]),
  minimum_amount: z.number().positive({ message: "Valor precisa ser maior que zero." }),
  active: z.boolean(),
});

export type FreeShippingRuleInput = z.infer<typeof freeShippingRuleSchema>;
