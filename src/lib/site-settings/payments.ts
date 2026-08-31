import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Configurações de pagamento (Pix/parcelamento) — reaproveita `site_settings`
 * numa chave própria `PAYMENT_SETTINGS`, separada de `INSTITUTIONAL_INFO`
 * (mesmo espírito de `WHATSAPP_MODE`/`DESIRE_SCORE_WEIGHTS`: um assunto, uma
 * chave). Lido só no servidor via client admin, mesmo padrão de
 * institutional.ts — `site_settings` não tem policy de leitura pública.
 */
export interface PaymentSettings {
  defaultMaxInstallments: number;
  minInstallmentValue: number;
  cashPriceEnabled: boolean;
  installmentsEnabled: boolean;
}

// Fallback só para o caso defensivo da chave não existir no banco (não
// deveria acontecer — a migration semeia essa linha). Deliberadamente "tudo
// desligado" em vez de chutar um número de parcelas ou valor mínimo — na
// ausência de configuração real, o site não deve inventar uma regra de
// pagamento que a loja nunca definiu.
const DEFAULTS: PaymentSettings = {
  defaultMaxInstallments: 1,
  minInstallmentValue: 0,
  cashPriceEnabled: false,
  installmentsEnabled: false,
};

function readNumber(value: Record<string, unknown>, key: string, fallback: number): number {
  const raw = value[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function readBoolean(value: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const raw = value[key];
  return typeof raw === "boolean" ? raw : fallback;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "PAYMENT_SETTINGS")
    .maybeSingle();

  if (error || !data || typeof data.value !== "object" || data.value === null) {
    return DEFAULTS;
  }

  const value = data.value as Record<string, unknown>;

  return {
    defaultMaxInstallments: readNumber(value, "default_max_installments", DEFAULTS.defaultMaxInstallments),
    minInstallmentValue: readNumber(value, "min_installment_value", DEFAULTS.minInstallmentValue),
    cashPriceEnabled: readBoolean(value, "cash_price_enabled", DEFAULTS.cashPriceEnabled),
    installmentsEnabled: readBoolean(value, "installments_enabled", DEFAULTS.installmentsEnabled),
  };
}

/**
 * Grava o objeto inteiro de uma vez (mesmo motivo de institutional.ts —
 * evita merge/race entre edições parciais). Usa o client de sessão: a
 * policy `site_settings_admin_all` exige `is_admin()`, dupla proteção em
 * cima do `requireAdmin(["admin"])` da Server Action.
 */
export async function updatePaymentSettings(settings: PaymentSettings): Promise<void> {
  const supabase = await createClient();

  const value = {
    default_max_installments: settings.defaultMaxInstallments,
    min_installment_value: settings.minInstallmentValue,
    cash_price_enabled: settings.cashPriceEnabled,
    installments_enabled: settings.installmentsEnabled,
  };

  const { error } = await supabase.from("site_settings").upsert({ key: "PAYMENT_SETTINGS", value });

  if (error) {
    throw new Error(`Não foi possível salvar as configurações de pagamento: ${error.message}`);
  }
}
