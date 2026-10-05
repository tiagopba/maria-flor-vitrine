import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Grava o WhatsApp já normalizado (55 + DDD + celular). Chamar só depois da validação. */
export async function updateCustomerWhatsapp(recordId: string, value: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("fulfillment_records")
    .update({ customer_whatsapp: value })
    .eq("id", recordId);
  if (error) throw new Error(error.message);
}
