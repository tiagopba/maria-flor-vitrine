import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Client Supabase para leituras públicas da vitrine (Home, busca,
 * categorias, produto). Usa só a anon key, sem ler cookies de sessão.
 *
 * Motivo de existir separado do client de `server.ts`: se essas consultas
 * usarem o client autenticado por cookie, uma sessão de admin inválida no
 * mesmo navegador (token expirado, chave de assinatura rotacionada etc.)
 * faz a query inteira falhar — e derruba a vitrine pública para quem só
 * está de olho na loja, mesmo a RLS permitindo leitura anônima dessas
 * tabelas. Foi exatamente isso que quebrou a Home localmente: o Postgrest
 * rejeitou o JWT da sessão (chave de assinatura fora de sincronia) e a
 * exceção subiu sem nenhuma proteção, num fluxo que nem usa autenticação.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
