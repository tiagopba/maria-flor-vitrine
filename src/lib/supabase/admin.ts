import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabaseServiceRoleKey, supabaseUrl } from "./env";

/**
 * Client Supabase com service role — ignora RLS.
 *
 * REGRA DE OURO: só pode ser importado em código que roda exclusivamente no
 * servidor (route handlers em app/api/**, server actions, admin de upload).
 * O pacote "server-only" garante um erro de build se algum componente de
 * cliente tentar importar este arquivo por engano.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
