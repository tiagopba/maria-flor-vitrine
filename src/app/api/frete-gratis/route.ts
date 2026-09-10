import { NextResponse } from "next/server";
import { listActiveFreeShippingRulesPublic } from "@/lib/db/shipping";

/**
 * Regras de frete grátis pro seletor de estado em /favoritos — Route
 * Handler (não Server Action, mesmo motivo já auditado em
 * /api/favoritos/produtos: uma Server Action chamada pelo client entraria
 * na fila de despacho do App Router). Só chamada sob demanda, no primeiro
 * clique de abrir o accordion — nunca no carregamento inicial da página.
 *
 * Pequena de propósito: devolve só as linhas ATIVAS, só os 3 campos que o
 * seletor precisa (nunca id/timestamps). Uma única query, sem N+1 — o
 * client filtra pela UF escolhida em memória, nunca uma chamada por estado.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const rules = await listActiveFreeShippingRulesPublic();
  return NextResponse.json(rules, { headers: { "Cache-Control": "no-store" } });
}
