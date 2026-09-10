import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Módulo isolado pra condições de frete grátis — geridas 100% pelo Admin
 * (Configurações → Frete grátis), nunca hardcoded no código. Estado sem
 * nenhuma linha aqui = sem promoção configurada, não é erro.
 */
export type ShippingService = "PAC" | "SEDEX";

export interface FreeShippingRule {
  id: string;
  stateCode: string;
  service: ShippingService;
  minimumAmount: number;
  active: boolean;
}

export interface PublicFreeShippingRule {
  stateCode: string;
  service: ShippingService;
  minimumAmount: number;
}

/**
 * Só regras ATIVAS, só os campos que o público precisa (nunca id/created_at/
 * updated_at) — usado pelo Route Handler público /api/frete-gratis. Client
 * admin (mesmo padrão de getPaymentSettings/getInstitutionalInfo): a tabela
 * não tem policy de leitura pública, então lê no servidor e devolve só o
 * necessário.
 */
export async function listActiveFreeShippingRulesPublic(): Promise<PublicFreeShippingRule[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("free_shipping_rules")
    .select("state_code, service, minimum_amount")
    .eq("active", true)
    .order("state_code", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    stateCode: r.state_code,
    service: r.service as ShippingService,
    minimumAmount: Number(r.minimum_amount),
  }));
}

/** Todas as regras (ativas e inativas) — tela Configurações → Frete grátis. */
export async function listFreeShippingRulesAdmin(): Promise<FreeShippingRule[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("free_shipping_rules")
    .select("id, state_code, service, minimum_amount, active")
    .order("state_code", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    stateCode: r.state_code,
    service: r.service as ShippingService,
    minimumAmount: Number(r.minimum_amount),
    active: r.active,
  }));
}

/**
 * Cria ou atualiza a regra daquele (state_code, service) — client de
 * sessão, RLS (is_admin()) como segunda trava. Devolve o id real da linha
 * (nova ou existente) — o Admin precisa dele pra habilitar ativar/desativar
 * e remover essa regra sem recarregar a página.
 */
export async function upsertFreeShippingRule(input: {
  stateCode: string;
  service: ShippingService;
  minimumAmount: number;
  active: boolean;
}): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("free_shipping_rules")
    .upsert(
      {
        state_code: input.stateCode,
        service: input.service,
        minimum_amount: input.minimumAmount,
        active: input.active,
      },
      { onConflict: "state_code,service" }
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

export async function setFreeShippingRuleActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("free_shipping_rules").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFreeShippingRule(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("free_shipping_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
