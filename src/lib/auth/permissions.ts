import "server-only";
import { cache } from "react";
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
 *
 * `cache()` (React, nativo do App Router) deduplica chamadas idênticas
 * (sem argumentos aqui, então é sempre a mesma chave) SÓ dentro da mesma
 * request/renderização — layout.tsx e a page de cada rota podem chamar
 * isso independentemente sem repetir `auth.getUser()` + a consulta em
 * `profiles`. Nunca é cache entre usuárias nem persistente: o cache do
 * React vive só pela duração de uma renderização de servidor e é
 * recriado a cada request nova. `requireAdmin()` (abaixo) continua
 * chamando isto normalmente — a checagem de sessão/papel não muda em
 * nada, só deixa de repetir a MESMA consulta duas ou três vezes na
 * mesma request.
 */
export const getCurrentAdmin = cache(async (): Promise<CurrentAdmin | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();

  // getUser() pode lançar (refresh token expirado/inválido) em vez de só
  // devolver user: null — tratamos como "sem sessão", nunca derrubando a
  // página com um 500.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    console.error("[getCurrentAdmin] falha ao validar sessão:", error);
    return null;
  }

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return profile;
});

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
