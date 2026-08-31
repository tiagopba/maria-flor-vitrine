"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { moveSizeOption, renameSizeOption, setSizeOptionActive, SizeLabelInUseError, type SizeOption } from "@/lib/db/sizes";
import { sizeOptionSchema } from "@/lib/validation/size";

export async function toggleSizeOptionActiveAction(id: string, active: boolean) {
  await requireAdmin(["admin", "catalog_editor"]);
  await setSizeOptionActive(id, active);
  revalidatePath("/admin/tamanhos");
}

export async function moveSizeOptionAction(id: string, direction: "up" | "down") {
  await requireAdmin(["admin", "catalog_editor"]);
  await moveSizeOption(id, direction);
  revalidatePath("/admin/tamanhos");
}

/**
 * Renomeia um tamanho — bloqueado (erro amigável, sem UPDATE em massa) se
 * o tamanho atual já estiver em uso em algum produto (product_sizes grava
 * o tamanho como texto solto, então renomear aqui não atualizaria o
 * histórico já gravado — orienta criar uma opção nova em vez disso).
 */
export async function renameSizeOptionAction(
  id: string,
  label: string
): Promise<{ size: SizeOption } | { error: string }> {
  await requireAdmin(["admin", "catalog_editor"]);

  const parsed = sizeOptionSchema.safeParse({ label });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const size = await renameSizeOption(id, parsed.data.label);
    revalidatePath("/admin/tamanhos");
    return { size };
  } catch (err) {
    if (err instanceof SizeLabelInUseError) return { error: err.message };
    const message = err instanceof Error ? err.message : "Não foi possível renomear o tamanho.";
    return { error: message.includes("size_options_label_key") ? "Já existe um tamanho com esse nome." : message };
  }
}
