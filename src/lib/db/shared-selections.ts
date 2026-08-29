import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSelectionToken } from "@/lib/selections/token";

export interface SharedSelectionItem {
  product_id: string;
  selected_size: string | null;
}

const EXPIRES_IN_DAYS = 30;

/**
 * Cria uma seleção compartilhável (só product_id + tamanho — nunca nome,
 * preço ou foto: isso é sempre resolvido ao vivo por getProductsByIdsPublic
 * quando a página /selecao/[token] carrega). Retorna null se a gravação
 * falhar — ex: enquanto a migration da tabela não for aprovada e aplicada
 * — sem lançar, porque quem chama (o envio da seleção pro WhatsApp) nunca
 * pode ficar bloqueado por causa disso; a mensagem simplesmente sai sem o
 * link de fotos até a tabela existir.
 */
export async function createSharedSelection(
  items: SharedSelectionItem[],
  sessionId: string | null
): Promise<string | null> {
  if (items.length === 0) return null;

  const supabase = createAdminClient();
  const token = generateSelectionToken();
  const expiresAt = new Date(Date.now() + EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("shared_selections").insert({
    token,
    items,
    session_id: sessionId,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("[createSharedSelection] falha ao criar seleção compartilhável:", error.message);
    return null;
  }

  return token;
}

export interface SharedSelectionRow {
  token: string;
  items: SharedSelectionItem[];
  expires_at: string;
}

/**
 * null cobre "token não existe" e "expirou" com o mesmo tratamento — quem
 * chama mostra o mesmo estado elegante de "não disponível" nos dois casos.
 */
export async function getSharedSelection(token: string): Promise<SharedSelectionRow | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("shared_selections")
    .select("token, items, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  return data;
}
