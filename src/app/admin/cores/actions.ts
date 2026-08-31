"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { updateColor, setColorActive, type Color } from "@/lib/db/colors";
import { colorSchema } from "@/lib/validation/color";

export async function toggleColorActiveAction(id: string, active: boolean) {
  await requireAdmin(["admin", "catalog_editor"]);
  await setColorActive(id, active);
  revalidatePath("/admin/cores");
}

export async function updateColorAction(
  id: string,
  name: string,
  hexColor: string | null
): Promise<{ color: Color } | { error: string }> {
  await requireAdmin(["admin", "catalog_editor"]);

  const parsed = colorSchema.safeParse({ name, hex_color: hexColor ?? undefined });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const color = await updateColor(id, parsed.data);
    revalidatePath("/admin/cores");
    return { color };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível salvar a cor.";
    return { error: message.includes("colors_slug_key") ? "Já existe uma cor com esse nome." : message };
  }
}
