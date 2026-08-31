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
import { optionalFormValue } from "@/lib/utils";

export interface CategoryFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * `description`/`cover_image`/`icon_key` são opcionais no schema, mas um
 * chamador que nunca inclui esses campos no FormData (ex: o modal de
 * cadastro rápido, que só manda name/slug/icon_key) faz `formData.get()`
 * devolver `null` em vez de `undefined` — e `.optional()` do Zod só aceita
 * `undefined`. Sem essa normalização, o cadastro rápido falhava sempre com
 * "Invalid input: expected string, received null" (ver optionalFormValue).
 */
function parseCategoryFormData(formData: FormData) {
  return categorySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: optionalFormValue(formData, "description"),
    cover_image: optionalFormValue(formData, "cover_image"),
    icon_key: optionalFormValue(formData, "icon_key"),
  });
}

/**
 * Última rede de segurança: se algum caminho ainda deixar passar uma
 * mensagem padrão do Zod em vez da mensagem customizada do schema, troca
 * por um texto genérico — a admin nunca deve ver jargão de validação
 * técnica.
 */
function friendlyFieldMessage(message: string): string {
  return /^invalid /i.test(message) ? "Valor inválido." : message;
}

function fieldErrorsFrom(parsed: { success: false; error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } } }) {
  return Object.fromEntries(
    Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, friendlyFieldMessage(v?.[0] ?? "")])
  );
}

export async function createCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  await requireAdmin(["admin", "catalog_editor"]);

  const parsed = parseCategoryFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed) };
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
    return { fieldErrors: fieldErrorsFrom(parsed) };
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
    const fieldErrors = fieldErrorsFrom(parsed);
    // Mensagem principal é o primeiro erro específico (ex: "Informe o
    // nome.") — nunca só "Dados inválidos.", que não diz o que corrigir.
    const firstMessage = Object.values(fieldErrors).find(Boolean) ?? "Dados inválidos.";
    return { error: firstMessage, fieldErrors };
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
