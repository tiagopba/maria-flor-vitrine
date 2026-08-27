import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { UserRole } from "@/types/database";

export interface CurrentAdmin {
  id: string;
  name: string;
  role: UserRole;
}

/**
 * Carrega a usuária autenticada + seu papel (profiles.role).
 * Retorna null se não houver sessão válida.
 */
export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return profile;
}

/**
 * Usar no topo de páginas/route handlers administrativos.
 * Redireciona para o login se não houver sessão, e opcionalmente restringe
 * por papel (ex: só ADMIN pode acessar Configurações/Vendedoras).
 */
export async function requireAdmin(allowedRoles?: UserRole[]): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  if (allowedRoles && !allowedRoles.includes(admin.role)) {
    redirect("/admin");
  }

  return admin;
}
