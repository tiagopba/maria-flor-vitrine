import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { CategoryInput } from "@/lib/validation/category";
import type { Database } from "@/types/database";

export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type CategoryWithProductCount = Category & { productCount: number };

/**
 * Todas as categorias (ativas e inativas), ordenadas para o painel, com a
 * contagem de produtos não arquivados de cada uma.
 *
 * Usa o client autenticado da sessão (não service role): a policy
 * "categories_admin_read_all" do RLS já garante que só admin/catalog_editor
 * conseguem ver categorias inativas — dupla proteção junto do requireAdmin()
 * na camada de página/action.
 */
export async function listCategoriesAdmin(): Promise<CategoryWithProductCount[]> {
  const supabase = await createClient();

  const [{ data: categories, error: categoriesError }, { data: products, error: productsError }] =
    await Promise.all([
      supabase.from("categories").select("*").order("position", { ascending: true }),
      supabase.from("products").select("category_id").neq("status", "ARCHIVED"),
    ]);

  if (categoriesError) throw new Error(categoriesError.message);
  if (productsError) throw new Error(productsError.message);

  const counts = new Map<string, number>();
  for (const product of products ?? []) {
    counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
  }

  return (categories ?? []).map((category) => ({
    ...category,
    productCount: counts.get(category.id) ?? 0,
  }));
}

export async function getCategoryByIdAdmin(id: string): Promise<Category | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Categorias ativas, ordenadas — para Home/navegação pública. */
export async function getActiveCategoriesPublic(): Promise<Category[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("active", true)
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCategoryBySlugPublic(slug: string): Promise<Category | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const supabase = await createClient();

  const { data: maxPositionRow } = await supabase
    .from("categories")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxPositionRow?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("categories")
    .insert({ ...input, position: nextPosition })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateCategory(id: string, input: CategoryInput): Promise<Category> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function setCategoryActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("categories").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Troca a posição da categoria com a vizinha imediata (acima ou abaixo).
 * Reordenação simples por botões — mais confiável no celular do que
 * drag-and-drop.
 */
export async function moveCategory(id: string, direction: "up" | "down"): Promise<void> {
  const supabase = await createClient();

  const { data: all, error } = await supabase
    .from("categories")
    .select("id, position")
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  if (!all) return;

  const index = all.findIndex((c) => c.id === id);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= all.length) return;

  const current = all[index];
  const target = all[targetIndex];

  const { error: error1 } = await supabase
    .from("categories")
    .update({ position: target.position })
    .eq("id", current.id);
  if (error1) throw new Error(error1.message);

  const { error: error2 } = await supabase
    .from("categories")
    .update({ position: current.position })
    .eq("id", target.id);
  if (error2) throw new Error(error2.message);
}
