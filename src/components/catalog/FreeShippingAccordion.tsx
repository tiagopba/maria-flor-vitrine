"use client";

import { useRef, useState } from "react";
import { BRAZILIAN_STATES } from "@/lib/shipping/brazilian-states";
import { getSavedShippingState, saveShippingState } from "@/lib/shipping/state-storage";

interface PublicFreeShippingRule {
  stateCode: string;
  service: "PAC" | "SEDEX";
  minimumAmount: number;
}

const formatPrice = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Bloco compacto e opcional de "condições de frete grátis" em /favoritos —
 * fechado por padrão, ZERO requisições enquanto fechado. O único fetch
 * (GET /api/frete-gratis) só dispara no primeiro clique de abrir, e só uma
 * vez por visita (fetchedRef); reabrir depois de fechar reaproveita o que
 * já veio. Nunca bloqueia a lista de peças nem o botão de WhatsApp — os
 * dois vivem inteiramente fora deste componente, no FavoritesPageClient.
 *
 * A UF escolhida é lida direto do localStorage por quem monta a mensagem
 * do WhatsApp (getSavedShippingState em favorites-click-action/FavoritesPageClient)
 * — este componente não precisa expor nenhum estado pro pai pra isso.
 */
export function FreeShippingAccordion() {
  const [open, setOpen] = useState(false);
  const [selectedState, setSelectedState] = useState<string | null>(() => getSavedShippingState());
  const [rules, setRules] = useState<PublicFreeShippingRule[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const fetchedRef = useRef(false);

  function handleOpen() {
    setOpen(true);
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setLoadError(false);

    fetch("/api/frete-gratis", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("bad status");
        return res.json() as Promise<PublicFreeShippingRule[]>;
      })
      .then((data) => setRules(data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  function handleSelectState(code: string) {
    setSelectedState(code || null);
    if (code) saveShippingState(code);
  }

  const rulesForState = selectedState ? (rules ?? []).filter((r) => r.stateCode === selectedState) : [];

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center justify-between rounded-xl border border-dashed border-border px-3.5 py-2.5 text-left text-sm text-text-muted hover:border-primary/40 hover:text-text"
      >
        <span>Consulte as condições de 🚚 FRETE GRÁTIS</span>
        <span aria-hidden="true">▾</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3.5">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="flex w-full items-center justify-between text-left text-sm font-medium text-text"
      >
        <span>🚚 Frete grátis</span>
        <span aria-hidden="true">▴</span>
      </button>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-muted">Para qual estado será o envio?</span>
        <select
          value={selectedState ?? ""}
          onChange={(e) => handleSelectState(e.target.value)}
          className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Selecione seu estado</option>
          {BRAZILIAN_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>
      </label>

      {selectedState && (
        <div className="text-sm text-text">
          {loading && <p className="text-text-muted">Consultando...</p>}
          {!loading && loadError && (
            <p className="text-text-muted">
              Não foi possível consultar as condições agora. Fale com uma vendedora.
            </p>
          )}
          {!loading &&
            !loadError &&
            rules !== null &&
            (rulesForState.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {rulesForState.map((r) => (
                  <li key={r.service}>
                    {r.service} grátis acima de {formatPrice(r.minimumAmount)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-text-muted">Consulte as opções de frete com uma vendedora.</p>
            ))}
        </div>
      )}
    </div>
  );
}
