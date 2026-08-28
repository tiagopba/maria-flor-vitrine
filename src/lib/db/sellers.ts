import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SellerInput } from "@/lib/validation/seller";
import type { Database } from "@/types/database";

export type Seller = Database["public"]["Tables"]["sellers"]["Row"];

// ── Admin (client da própria sessão — RLS de sellers_admin_all decide) ──────

export async function listSellersAdmin(): Promise<Seller[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sellers").select("*").order("order_priority");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSellerByIdAdmin(id: string): Promise<Seller | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sellers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createSeller(input: SellerInput): Promise<Seller> {
  const supabase = await createClient();

  const { data: maxPositionRow } = await supabase
    .from("sellers")
    .select("order_priority")
    .order("order_priority", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxPositionRow?.order_priority ?? -1) + 1;

  const { data, error } = await supabase
    .from("sellers")
    .insert({ ...input, order_priority: nextPosition })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateSeller(id: string, input: SellerInput): Promise<Seller> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sellers").update(input).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setSellerActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sellers").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function moveSeller(id: string, direction: "up" | "down"): Promise<void> {
  const supabase = await createClient();

  const { data: all, error } = await supabase
    .from("sellers")
    .select("id, order_priority")
    .order("order_priority", { ascending: true });

  if (error) throw new Error(error.message);
  if (!all) return;

  const index = all.findIndex((s) => s.id === id);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= all.length) return;

  const current = all[index];
  const target = all[targetIndex];

  const { error: error1 } = await supabase
    .from("sellers")
    .update({ order_priority: target.order_priority })
    .eq("id", current.id);
  if (error1) throw new Error(error1.message);

  const { error: error2 } = await supabase
    .from("sellers")
    .update({ order_priority: current.order_priority })
    .eq("id", target.id);
  if (error2) throw new Error(error2.message);
}

// ── Público (client admin/service role — sellers não tem policy pública;
// a lista aqui só expõe nome/id, nunca chega no navegador o service role) ──

export interface PublicSeller {
  id: string;
  name: string;
}

/** Nomes das vendedoras ativas, para o modal de escolha na página do produto. */
export async function getActiveSellersForModal(): Promise<PublicSeller[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sellers")
    .select("id, name")
    .eq("active", true)
    .order("order_priority");

  if (error) throw new Error(error.message);
  return data ?? [];
}
