import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { slugify } from "@/lib/utils";
import type { Database } from "@/types/database";

export type Color = Database["public"]["Tables"]["colors"]["Row"];

/** Todas as cores ativas, ordenadas por nome — usado no chip-select do admin. */
export async function listActiveColorsAdmin(): Promise<Color[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("colors").select("*").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Mesma lista, lado público — usada na página do produto pra resolver nome/swatch das cores irmãs. */
export async function listActiveColorsPublic(): Promise<Color[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("colors").select("*").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface CreateColorInput {
  name: string;
  hex_color: string | null;
}

/**
 * Cria uma cor nova — slug gerado a partir do nome, mesma função
 * slugify() do resto do catálogo. Sem verificação extra de unicidade
 * manual: colors.slug é UNIQUE no banco, e uma colisão aqui (duas cores
 * com nome idêntico) é rara o bastante pra só devolver o erro amigável
 * já tratado por quem chama (ver admin/produtos/actions.ts).
 */
export async function createColor(input: CreateColorInput): Promise<Color> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colors")
    .insert({ name: input.name, slug: slugify(input.name), hex_color: input.hex_color })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
