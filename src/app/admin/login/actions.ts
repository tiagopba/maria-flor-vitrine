"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MASTER_EMAIL } from "@/lib/auth/master";

export interface LoginState {
  error?: string;
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  // A conta master nunca loga por senha — mesmo que uma senha exista de
  // alguma forma nesse registro do Supabase Auth (ex: definida sem querer
  // pelo painel do Supabase), este caminho recusa antes de sequer tentar
  // autenticar. O único jeito de entrar como master é /admin/login/master
  // (código por e-mail, sem senha nenhuma envolvida).
  if (email.toLowerCase() === MASTER_EMAIL) {
    return { error: "Esta conta usa login por código enviado por e-mail — acesse /admin/login/master." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }

  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
