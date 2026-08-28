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
  redirect("/admin/categorias");
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
  redirect("/admin/categorias");
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
