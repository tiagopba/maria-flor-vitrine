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

/** Conteúdo (loading/erro/regras) compartilhado pelas duas variantes —
 * só o texto muda de tamanho conforme o `className` do container em volta;
 * a lógica de qual mensagem mostrar é sempre a mesma. */
function ShippingRulesStatus({
  loading,
  loadError,
  rules,
  rulesForState,
}: {
  loading: boolean;
  loadError: boolean;
  rules: PublicFreeShippingRule[] | null;
  rulesForState: PublicFreeShippingRule[];
}) {
  if (loading) return <p className="text-text-muted">Consultando...</p>;
  if (loadError) {
    return <p className="text-text-muted">Não foi possível consultar as condições agora. Fale com uma vendedora.</p>;
  }
  if (rules === null) return null;
  if (rulesForState.length === 0) {
    return <p className="text-text-muted">Consulte as opções de frete com uma vendedora.</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {rulesForState.map((r) => (
        <li key={r.service}>
          {r.service} grátis acima de {formatPrice(r.minimumAmount)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Bloco opcional de "condições de frete grátis" — fechado por padrão, ZERO
 * requisições enquanto fechado. O único fetch (GET /api/frete-gratis) só
 * dispara no primeiro clique de abrir, e só uma vez por visita
 * (fetchedRef); reabrir depois de fechar reaproveita o que já veio. Nunca
 * bloqueia o resto da página (lista de peças em /favoritos, CTA "Quero essa
 * peça" na página de produto) — os dois vivem inteiramente fora deste
 * componente.
 *
 * A UF escolhida é lida direto do localStorage por quem monta a mensagem
 * do WhatsApp (getSavedShippingState em favorites-click-action/
 * FavoritesPageClient) — este componente não precisa expor nenhum estado
 * pro pai pra isso.
 *
 * O gatilho fechado ("🚚 Enviamos para todo o Brasil • Confira as
 * condições de FRETE GRÁTIS" + "Consultar condições") é IGUAL nas duas
 * variantes — mesmo texto, mesma tipografia, em /favoritos e na página de
 * produto (pedido explícito: um único padrão visual nos dois lugares).
 * `variant` só diferencia o PAINEL ABERTO: "default" é a caixa com borda
 * usada em /favoritos; "compact" é o painel mais enxuto (sem borda ao
 * redor, texto menor) usado na página de produto, pra não virar um banner
 * ali.
 */
export function FreeShippingAccordion({ variant = "default" }: { variant?: "default" | "compact" } = {}) {
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
      <div className="flex flex-col items-start gap-1">
        <p className="text-base font-semibold leading-snug text-text">
          🚚 Enviamos para todo o Brasil • Confira as condições de FRETE GRÁTIS
        </p>
        <button
          type="button"
          onClick={handleOpen}
          className="-mx-1 -my-1 rounded-md px-1 py-2 text-left text-[15px] font-semibold text-primary hover:underline"
        >
          Consultar condições
        </button>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex flex-col gap-2 border-t border-border pt-2.5 text-xs">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex w-full items-center justify-between text-left font-medium text-text"
        >
          <span>🚚 Frete grátis</span>
          <span aria-hidden="true">▴</span>
        </button>

        <label className="flex flex-col gap-1">
          <span className="text-text-muted">Para qual estado será o envio?</span>
          <select
            value={selectedState ?? ""}
            onChange={(e) => handleSelectState(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
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
          <div className="text-text">
            <ShippingRulesStatus loading={loading} loadError={loadError} rules={rules} rulesForState={rulesForState} />
          </div>
        )}
      </div>
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
          <ShippingRulesStatus loading={loading} loadError={loadError} rules={rules} rulesForState={rulesForState} />
        </div>
      )}
    </div>
  );
}
