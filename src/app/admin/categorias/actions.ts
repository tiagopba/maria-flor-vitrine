"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import {
  createCategory,
  getCategoryByIdAdmin,
  moveCategory,
  setCategoryActive,
  updateCategory,
  type Category,
} from "@/lib/db/categories";
import { categorySchema } from "@/lib/validation/category";

export interface CategoryFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseCategoryFormData(formData: FormData) {
  return categorySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    cover_image: formData.get("cover_image"),
    icon_key: formData.get("icon_key"),
  });
}

export async function createCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  await requireAdmin(["admin", "catalog_editor"]);

  const parsed = parseCategoryFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""])
    ) };
  }

  try {
    await createCategory(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível criar a categoria." };
  }

  revalidatePath("/admin/categorias");
  redirect(`/admin/categorias?sucesso=${encodeURIComponent("Categoria criada com sucesso.")}`);
}

export async function updateCategoryAction(
  id: string,
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  await requireAdmin(["admin", "catalog_editor"]);

  const parsed = parseCategoryFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""])
    ) };
  }

  const existing = await getCategoryByIdAdmin(id);
  if (!existing) {
    return { error: "Categoria não encontrada." };
  }

  try {
    await updateCategory(id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível salvar a categoria." };
  }

  revalidatePath("/admin/categorias");
  revalidatePath(`/categoria/${existing.slug}`);
  if (existing.slug !== parsed.data.slug) revalidatePath(`/categoria/${parsed.data.slug}`);
  redirect(`/admin/categorias?sucesso=${encodeURIComponent("Alterações salvas com sucesso.")}`);
}

export async function toggleCategoryActiveAction(id: string, active: boolean) {
  await requireAdmin(["admin", "catalog_editor"]);
  await setCategoryActive(id, active);

  const category = await getCategoryByIdAdmin(id);
  revalidatePath("/admin/categorias");
  if (category) revalidatePath(`/categoria/${category.slug}`);
}

export async function moveCategoryAction(id: string, direction: "up" | "down") {
  await requireAdmin(["admin", "catalog_editor"]);
  await moveCategory(id, direction);
  revalidatePath("/admin/categorias");
}

/**
 * Cria uma categoria sem sair do formulário de produto — usada pelo modal
 * "+" ao lado do select de categoria. Reaproveita categorySchema/
 * createCategory (mesma validação e gravação de /admin/categorias),
 * só devolve a categoria criada em vez de redirecionar, já que quem
 * chama é um modal dentro de outra página.
 */
export async function createCategoryQuickAction(
  formData: FormData
): Promise<{ category: Category } | { error: string; fieldErrors?: Record<string, string> }> {
  await requireAdmin(["admin", "catalog_editor"]);

  const parsed = parseCategoryFormData(formData);
  if (!parsed.success) {
    return {
      error: "Dados inválidos.",
      fieldErrors: Object.fromEntries(
        Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""])
      ),
    };
  }

  try {
    const category = await createCategory(parsed.data);
    revalidatePath("/admin/produtos/novo");
    return { category };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível criar a categoria.";
    return { error: message.includes("categories_slug_key") ? "Já existe uma categoria com esse nome." : message };
  }
}
