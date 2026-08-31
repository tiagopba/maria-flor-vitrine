import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type SizeOption = Database["public"]["Tables"]["size_options"]["Row"];

/** Erro amigável — renomear um tamanho já usado em produtos alteraria o texto histórico gravado em product_sizes. */
export class SizeLabelInUseError extends Error {
  constructor() {
    super("Este tamanho já está em uso em algum produto. Crie uma nova opção em vez de renomear.");
  }
}

/** Todos os tamanhos (ativos e inativos), ordenados por posição — para o painel /admin/tamanhos. */
export async function listSizeOptionsAdmin(): Promise<SizeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("size_options").select("*").order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Tamanhos ativos, ordenados — usado no cadastro normal de produto. */
export async function listActiveSizeOptionsAdmin(): Promise<SizeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("size_options")
    .select("*")
    .eq("active", true)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Tamanhos ativos + qualquer tamanho já usado nesta variante mesmo que hoje
 * esteja inativo (item 11 aprovado) — senão um tamanho desativado depois de
 * cadastrado desapareceria do formulário e seria removido do produto sem
 * intenção ao salvar. Tamanhos usados que nunca existiram em size_options
 * (texto livre histórico) também são preservados, no fim da lista.
 */
export async function listSizeOptionsForVariantEdit(usedSizes: string[]): Promise<SizeOption[]> {
  const active = await listActiveSizeOptionsAdmin();
  if (usedSizes.length === 0) return active;

  const supabase = await createClient();
  const { data: usedRows, error } = await supabase
    .from("size_options")
    .select("*")
    .in("label", usedSizes)
    .eq("active", false);
  if (error) throw new Error(error.message);

  const byLabel = new Map(active.map((s) => [s.label, s]));
  for (const row of usedRows ?? []) byLabel.set(row.label, row);

  const knownLabels = new Set(byLabel.keys());
  const unknownLabels = usedSizes.filter((s) => !knownLabels.has(s));

  return [
    ...[...byLabel.values()].sort((a, b) => a.position - b.position),
    ...unknownLabels.map((label, i) => ({
      id: `unknown-${label}`,
      label,
      position: 100000 + i,
      active: true,
    })),
  ];
}

export async function isSizeLabelInUse(label: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_sizes").select("id").eq("size", label).limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function createSizeOption(label: string): Promise<SizeOption> {
  const supabase = await createClient();

  const { data: maxPositionRow } = await supabase
    .from("size_options")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxPositionRow?.position ?? -1) + 10;

  const { data, error } = await supabase
    .from("size_options")
    .insert({ label, position: nextPosition, active: true })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Bloqueia a renomeação se o tamanho já estiver em uso — nunca faz UPDATE em massa em product_sizes. */
export async function renameSizeOption(id: string, newLabel: string): Promise<SizeOption> {
  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from("size_options")
    .select("label")
    .eq("id", id)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!current) throw new Error("Tamanho não encontrado.");

  if (current.label !== newLabel && (await isSizeLabelInUse(current.label))) {
    throw new SizeLabelInUseError();
  }

  const { data, error } = await supabase
    .from("size_options")
    .update({ label: newLabel })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function setSizeOptionActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("size_options").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Troca a posição do tamanho com a vizinha imediata (acima ou abaixo) — mesmo padrão de moveCategory. */
export async function moveSizeOption(id: string, direction: "up" | "down"): Promise<void> {
  const supabase = await createClient();

  const { data: all, error } = await supabase
    .from("size_options")
    .select("id, position")
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  if (!all) return;

  const index = all.findIndex((s) => s.id === id);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= all.length) return;

  const current = all[index];
  const target = all[targetIndex];

  const { error: error1 } = await supabase
    .from("size_options")
    .update({ position: target.position })
    .eq("id", current.id);
  if (error1) throw new Error(error1.message);

  const { error: error2 } = await supabase
    .from("size_options")
    .update({ position: current.position })
    .eq("id", target.id);
  if (error2) throw new Error(error2.message);
}
