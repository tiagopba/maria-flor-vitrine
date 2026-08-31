import { z } from "zod";

export const paymentSettingsSchema = z.object({
  defaultMaxInstallments: z.coerce
    .number({ error: "Informe o número máximo de parcelas." })
    .int("Use um número inteiro.")
    .min(1, "Mínimo de 1 parcela.")
    .max(24, "Máximo de 24 parcelas."),
  minInstallmentValue: z.coerce
    .number({ error: "Informe o valor mínimo da parcela." })
    .min(0, "O valor mínimo não pode ser negativo."),
  cashPriceEnabled: z.boolean(),
  installmentsEnabled: z.boolean(),
});

export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;
