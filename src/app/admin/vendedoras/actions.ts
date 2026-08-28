"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import { createSeller, moveSeller, setSellerActive, updateSeller } from "@/lib/db/sellers";
import { sellerSchema } from "@/lib/validation/seller";

export interface SellerFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseSellerFormData(formData: FormData) {
  return sellerSchema.safeParse({
    name: formData.get("name"),
    whatsapp_number: formData.get("whatsapp_number"),
    phone: formData.get("phone"),
    active: formData.get("active") === "on",
    round_robin: formData.get("round_robin") === "on",
  });
}

function fieldErrorsFrom(parsed: {
  success: false;
  error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } };
}) {
  return Object.fromEntries(
    Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""])
  );
}

export async function createSellerAction(
  _prevState: SellerFormState,
  formData: FormData
): Promise<SellerFormState> {
  await requireAdmin(["admin", "catalog_editor"]);

  const parsed = parseSellerFormData(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed) };

  try {
    await createSeller(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível criar a vendedora." };
  }

  revalidatePath("/admin/vendedoras");
  redirect(`/admin/vendedoras?sucesso=${encodeURIComponent("Vendedora criada com sucesso.")}`);
}

export async function updateSellerAction(
  id: string,
  _prevState: SellerFormState,
  formData: FormData
): Promise<SellerFormState> {
  await requireAdmin(["admin", "catalog_editor"]);

  const parsed = parseSellerFormData(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed) };

  try {
    await updateSeller(id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível salvar a vendedora." };
  }

  revalidatePath("/admin/vendedoras");
  redirect(`/admin/vendedoras?sucesso=${encodeURIComponent("Alterações salvas com sucesso.")}`);
}

export async function toggleSellerActiveAction(id: string, active: boolean) {
  await requireAdmin(["admin", "catalog_editor"]);
  await setSellerActive(id, active);
  revalidatePath("/admin/vendedoras");
}

export async function moveSellerAction(id: string, direction: "up" | "down") {
  await requireAdmin(["admin", "catalog_editor"]);
  await moveSeller(id, direction);
  revalidatePath("/admin/vendedoras");
}
