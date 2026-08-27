import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DesireScoreWeights {
  view: number;
  favorite: number;
  size_selection: number;
  whatsapp_click: number;
}

const DEFAULT_WEIGHTS: DesireScoreWeights = {
  view: 1,
  favorite: 5,
  size_selection: 7,
  whatsapp_click: 10,
};

/**
 * Fórmula central do Índice de Desejo. Única fonte de verdade — nunca
 * duplicar esses pesos no frontend ou em queries soltas pelo código.
 *
 *   desire_score = views * peso_view
 *                + favorites * peso_favorite
 *                + size_selections * peso_size_selection
 *                + whatsapp_clicks * peso_whatsapp_click
 */
export function calculateDesireScore(
  counts: { views: number; favorites: number; sizeSelections: number; whatsappClicks: number },
  weights: DesireScoreWeights = DEFAULT_WEIGHTS
): number {
  return (
    counts.views * weights.view +
    counts.favorites * weights.favorite +
    counts.sizeSelections * weights.size_selection +
    counts.whatsappClicks * weights.whatsapp_click
  );
}

/**
 * Busca os pesos configurados em site_settings (chave DESIRE_SCORE_WEIGHTS),
 * com fallback para os pesos padrão do documento de negócio.
 */
export async function getDesireScoreWeights(): Promise<DesireScoreWeights> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "DESIRE_SCORE_WEIGHTS")
    .maybeSingle();

  return (data?.value as DesireScoreWeights | undefined) ?? DEFAULT_WEIGHTS;
}
