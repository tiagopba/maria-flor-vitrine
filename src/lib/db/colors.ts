import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { slugify } from "@/lib/utils";
import type { Database } from "@/types/database";

export type Color = Database["public"]["Tables"]["colors"]["Row"];

/**
 * Anexa nome/hex da cor a qualquer lista de linhas com `color_id` — usado
 * por toda listagem pública/admin de produtos (ver attachCategoryAndMainImage
 * em lib/db/products.ts). Uma única consulta em lote, nunca uma por linha.
 * Como usa o `supabase` client de quem chama, a visibilidade de cor inativa
 * segue a mesma RLS de sempre (client público só vê active=true — mesma
 * regra já usada pelos swatches "Outras cores disponíveis"; client
 * autenticado/admin vê todas).
 */
export async function attachColorInfo<T extends { color_id: string | null }>(
  supabase: SupabaseClient<Database>,
  rows: T[]
): Promise<(T & { colorName: string | null; colorHex: string | null })[]> {
  const colorIds = [...new Set(rows.map((r) => r.color_id).filter((id): id is string => id != null))];
  if (colorIds.length === 0) return rows.map((r) => ({ ...r, colorName: null, colorHex: null }));

  const { data, error } = await supabase.from("colors").select("id, name, hex_color").in("id", colorIds);
  if (error) throw new Error(error.message);

  const byId = new Map((data ?? []).map((c) => [c.id, c]));
  return rows.map((r) => {
    const color = r.color_id ? byId.get(r.color_id) : undefined;
    return { ...r, colorName: color?.name ?? null, colorHex: color?.hex_color ?? null };
  });
}

/**
 * Mapa id -> nome, sem filtro de `active` (usa o client de quem chama —
 * nas Server Actions de WhatsApp isso é sempre o client admin/service role,
 * porque a mensagem precisa mostrar o nome da cor de verdade mesmo que ela
 * tenha sido desativada depois da compra ter sido cogitada).
 */
export async function getColorNamesByIds(
  supabase: SupabaseClient<Database>,
  colorIds: string[]
): Promise<Map<string, string>> {
  if (colorIds.length === 0) return new Map();
  const { data, error } = await supabase.from("colors").select("id, name").in("id", colorIds);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((c) => [c.id, c.name]));
}

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

/** Todas as cores (ativas e inativas), ordenadas por nome — para o painel /admin/cores. */
export async function listColorsAdmin(): Promise<Color[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("colors").select("*").order("name");
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

export async function updateColor(id: string, input: CreateColorInput): Promise<Color> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colors")
    .update({ name: input.name, slug: slugify(input.name), hex_color: input.hex_color })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function setColorActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("colors").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
}
