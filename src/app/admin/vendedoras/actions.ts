"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import {
  createSeller,
  getSellerByIdAdmin,
  listSellersAdmin,
  moveSeller,
  reactivateSellerWithWhatsapp,
  renameSeller,
  setSellerActive,
  updateSellerContact,
} from "@/lib/db/sellers";
import { describeNameConflict, findNameConflict } from "@/lib/sellers/management";
import {
  sellerContactSchemaFor,
  sellerNameSchema,
  sellerReactivationSchema,
  sellerSchema,
} from "@/lib/validation/seller";

// Gestão de vendedoras: SÓ Admin/Master (catalog_editor não entra). Não existe
// nenhuma action de excluir vendedora — o histórico depende do seller_id.
const ALLOWED_ROLES = ["admin", "master"] as const;

export interface SellerFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrorsFrom(parsed: {
  success: false;
  error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } };
}) {
  return Object.fromEntries(
    Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""])
  );
}

/** NOVA VENDEDORA — sempre um novo registro (novo id). */
export async function createSellerAction(_prevState: SellerFormState, formData: FormData): Promise<SellerFormState> {
  await requireAdmin([...ALLOWED_ROLES]);

  const parsed = sellerSchema.safeParse({
    name: formData.get("name"),
    whatsapp_number: formData.get("whatsapp_number"),
    phone: formData.get("phone"),
    active: formData.get("active") === "on",
    round_robin: formData.get("round_robin") === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed) };

  const conflict = findNameConflict(parsed.data.name, await listSellersAdmin());
  if (conflict) return { fieldErrors: { name: describeNameConflict(conflict) } };

  try {
    await createSeller(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível criar a vendedora." };
  }

  revalidatePath("/admin/vendedoras");
  redirect(`/admin/vendedoras?sucesso=${encodeURIComponent("Vendedora criada com sucesso.")}`);
}

/** EDITAR NOME — só corrige a grafia da MESMA pessoa (mesmo id, vínculos antigos intactos). */
export async function renameSellerAction(
  id: string,
  _prevState: SellerFormState,
  formData: FormData
): Promise<SellerFormState> {
  await requireAdmin([...ALLOWED_ROLES]);

  const parsed = sellerNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed) };

  const conflict = findNameConflict(parsed.data.name, await listSellersAdmin(), id);
  if (conflict) return { fieldErrors: { name: describeNameConflict(conflict) } };

  try {
    await renameSeller(id, parsed.data.name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível salvar o nome." };
  }

  revalidatePath("/admin/vendedoras");
  redirect(`/admin/vendedoras?sucesso=${encodeURIComponent("Nome corrigido.")}`);
}

/** CONTATO — WhatsApp, telefone e rodízio. Nunca nome nem ativa/inativa. */
export async function updateSellerContactAction(
  id: string,
  _prevState: SellerFormState,
  formData: FormData
): Promise<SellerFormState> {
  await requireAdmin([...ALLOWED_ROLES]);

  const seller = await getSellerByIdAdmin(id);
  if (!seller) return { error: "Vendedora não encontrada." };

  // Ativa: WhatsApp obrigatório. Inativa (ex-funcionária): pode ficar sem número.
  const parsed = sellerContactSchemaFor(seller.active).safeParse({
    whatsapp_number: formData.get("whatsapp_number") ?? "",
    phone: formData.get("phone"),
    round_robin: formData.get("round_robin") === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed) };

  try {
    await updateSellerContact(id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível salvar o contato." };
  }

  revalidatePath("/admin/vendedoras");
  redirect(`/admin/vendedoras?sucesso=${encodeURIComponent("Contato atualizado.")}`);
}

/** REATIVAR uma vendedora SEM WhatsApp: exige informar um número válido (nunca inventado). */
export async function reactivateSellerAction(
  id: string,
  _prevState: SellerFormState,
  formData: FormData
): Promise<SellerFormState> {
  await requireAdmin([...ALLOWED_ROLES]);

  const parsed = sellerReactivationSchema.safeParse({ whatsapp_number: formData.get("whatsapp_number") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed) };

  try {
    await reactivateSellerWithWhatsapp(id, parsed.data.whatsapp_number);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível reativar." };
  }

  revalidatePath("/admin/vendedoras");
  revalidatePath("/admin/faturamento-envios");
  redirect(`/admin/vendedoras?sucesso=${encodeURIComponent("Vendedora reativada.")}`);
}

/** DESATIVAR (active = false) / REATIVAR (active = true) de quem já tem WhatsApp. Nunca apaga. */
export async function toggleSellerActiveAction(id: string, active: boolean) {
  await requireAdmin([...ALLOWED_ROLES]);

  if (active) {
    // Reativar exige WhatsApp. A tela já mostra o formulário certo; esta é a trava no servidor.
    const seller = await getSellerByIdAdmin(id);
    if (!seller?.whatsapp_number) {
      redirect(`/admin/vendedoras?erro=${encodeURIComponent("Informe um WhatsApp válido para reativar esta vendedora.")}`);
    }
  }

  await setSellerActive(id, active);
  revalidatePath("/admin/vendedoras");
  revalidatePath("/admin/faturamento-envios");
}

export async function moveSellerAction(id: string, direction: "up" | "down") {
  await requireAdmin([...ALLOWED_ROLES]);
  await moveSeller(id, direction);
  revalidatePath("/admin/vendedoras");
}
