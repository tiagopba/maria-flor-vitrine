import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export interface ResolvedSeller {
  id: string | null;
  whatsapp_number: string;
}

export type SelectionMode = "manual" | "round_robin";

/**
 * Resolve a vendedora para QUALQUER fluxo que abra WhatsApp (produto
 * individual ou seleção de favoritos) — mesma regra nos dois, extraída
 * aqui para não duplicar o round-robin em dois lugares.
 *
 * Prioridade: escolha manual (se ainda ativa) → round-robin simples entre
 * ativas que participam do rodízio → número padrão da loja
 * (NEXT_PUBLIC_WHATSAPP_DEFAULT_NUMBER) → null (nenhuma opção — quem chama
 * decide a mensagem de erro).
 */
export async function resolveSeller(
  supabase: SupabaseClient<Database>,
  sellerId: string | null
): Promise<{ seller: ResolvedSeller | null; selectionMode: SelectionMode }> {
  const selectionMode: SelectionMode = sellerId ? "manual" : "round_robin";
  let seller: ResolvedSeller | null = null;

  if (sellerId) {
    const { data } = await supabase
      .from("sellers")
      .select("id, whatsapp_number")
      .eq("id", sellerId)
      .eq("active", true)
      .maybeSingle();

    seller = data ?? null;
  } else {
    const { data: candidates } = await supabase
      .from("sellers")
      .select("id, whatsapp_number")
      .eq("active", true)
      .eq("round_robin", true)
      .order("order_priority", { ascending: true });

    if (candidates && candidates.length > 0) {
      // Distribuição simples por tempo — suficiente para o volume do MVP;
      // uma rotação mais precisa (contagem real de cliques) fica para depois.
      const index = Math.floor(Date.now() / 1000) % candidates.length;
      seller = candidates[index];
    }
  }

  if (!seller) {
    const fallbackNumber = process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT_NUMBER;
    if (fallbackNumber) seller = { id: null, whatsapp_number: fallbackNumber };
  }

  return { seller, selectionMode };
}
