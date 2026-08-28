import type { ProductStatus } from "@/types/database";

/**
 * Única fonte de verdade para os rótulos de status — nunca duplicar essas
 * strings em componentes individuais.
 */
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: "Disponível para consulta",
  LAST_UNITS: "Últimas peças",
  CHECK_AVAILABILITY: "Consulte disponibilidade",
  SOLD_OUT: "Esgotado",
  ARCHIVED: "Arquivado",
};

/**
 * ACTIVE não recebe badge no público (é o estado "normal"). ARCHIVED nunca
 * aparece publicamente. Os demais mostram um selo discreto.
 */
export function publicStatusBadge(status: ProductStatus): string | null {
  if (status === "ACTIVE" || status === "ARCHIVED") return null;
  return PRODUCT_STATUS_LABELS[status];
}
