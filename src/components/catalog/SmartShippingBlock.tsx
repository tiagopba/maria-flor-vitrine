"use client";

import { formatBRL } from "@/components/ui/Price";
import { BRAZILIAN_STATES } from "@/lib/shipping/brazilian-states";
import type { CepShipping } from "./useCepShipping";

const inputClass =
  "h-10 w-40 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40";
const selectClass =
  "h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40";

function StateSelect({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (code: string) => void;
  placeholder: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      <option value="">{placeholder}</option>
      {BRAZILIAN_STATES.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name} ({s.code})
        </option>
      ))}
    </select>
  );
}

/**
 * Bloco inteligente de frete de /favoritos. Fluxo principal: a cliente
 * informa o CEP, a gente consulta o ViaCEP só pra descobrir UF + cidade, e
 * essa UF alimenta EXATAMENTE a mesma regra de frete grátis de sempre
 * (`free_shipping_rules` via GET /api/frete-gratis — nunca duplicada
 * aqui). A consulta de CEP é só uma forma mais rápida de preencher a UF:
 * se falhar, der timeout ou o CEP não existir, a cliente sempre pode
 * escolher o estado manualmente — a venda nunca depende do ViaCEP.
 *
 * `shipping` vem de useCepShipping(), chamado no PAI (FavoritesPageClient)
 * — este componente é só apresentação, sem estado de CEP/cidade próprio
 * (ver comentário em useCepShipping.ts sobre por que o estado mora lá).
 *
 * totalPix vem pronto do pai, que já tem os produtos carregados — nenhuma
 * busca de produtos nova aqui, e o valor recalcula sozinho a cada render
 * porque o pai já re-renderiza a cada adicionar/remover peça (mesmo
 * evento FAVORITES_CHANGED_EVENT de sempre).
 */
export function SmartShippingBlock({ totalPix, shipping }: { totalPix: number; shipping: CepShipping }) {
  const {
    cepInput,
    resolvedCity,
    selectedState,
    cepStatus,
    manualOpen,
    rules,
    loadError,
    rulesLoading,
    setManualOpen,
    handleCepChange,
    handleCepBlur,
    handleManualSelectState,
  } = shipping;

  const rulesForState = selectedState && rules ? rules.filter((r) => r.stateCode === selectedState) : [];
  const stateName = selectedState ? BRAZILIAN_STATES.find((s) => s.code === selectedState)?.name : undefined;

  const unlocked = rulesForState.filter((r) => totalPix >= r.minimumAmount).sort((a, b) => a.minimumAmount - b.minimumAmount);
  const locked = rulesForState.filter((r) => totalPix < r.minimumAmount).sort((a, b) => a.minimumAmount - b.minimumAmount);

  function renderFreeShippingMessage() {
    if (!selectedState) return null;

    if (rulesLoading) {
      return <p className="text-sm text-text-muted">Calculando o frete para {stateName}...</p>;
    }

    if (loadError) {
      return (
        <p className="text-sm text-text-muted">
          Não foi possível calcular o frete agora. Fale com uma vendedora.
        </p>
      );
    }

    if (rules === null) return null;

    if (rulesForState.length === 0) {
      return (
        <p className="text-sm text-text-muted">
          Sem regra de frete grátis cadastrada para {stateName} no momento.
        </p>
      );
    }

    if (unlocked.length === 0) {
      // Ainda não bateu nenhum mínimo — mostra o progresso até a regra
      // mais próxima (menor mínimo entre as travadas).
      const target = locked[0];
      const missing = Math.max(0, Math.round((target.minimumAmount - totalPix) * 100) / 100);
      return (
        <>
          <p className="text-[15px] font-semibold leading-snug text-text">🎁 VOCÊ ESTÁ QUASE LÁ!</p>
          <p className="text-sm text-text-muted">
            Faltam <span className="font-semibold text-text">{formatBRL(missing)}</span> para liberar seu{" "}
            <span className="font-semibold text-text">FRETE GRÁTIS</span>
          </p>
          <p className="text-sm text-text-muted">
            {target.service} grátis para {stateName}
          </p>
        </>
      );
    }

    // Pelo menos uma modalidade já liberada.
    return (
      <>
        <p className="text-[15px] font-semibold leading-snug text-text">🎉 FRETE GRÁTIS LIBERADO!</p>
        {locked.length === 0 ? (
          rulesForState.length === 1 ? (
            <p className="text-sm text-text-muted">
              {unlocked[0].service} grátis para {stateName}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-sm text-text-muted">
              {unlocked.map((r) => (
                <li key={r.service}>{r.service} GRÁTIS liberado</li>
              ))}
            </ul>
          )
        ) : (
          <>
            <p className="text-sm text-text-muted">{unlocked[0].service} GRÁTIS liberado</p>
            <p className="text-sm text-text-muted">
              Faltam{" "}
              <span className="font-semibold text-text">
                {formatBRL(Math.max(0, Math.round((locked[0].minimumAmount - totalPix) * 100) / 100))}
              </span>{" "}
              para liberar também {locked[0].service} GRÁTIS
            </p>
          </>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3.5">
      <p className="text-[15px] font-semibold leading-snug text-text">🚚 Informe seu CEP para o frete</p>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-muted">CEP</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="00000-000"
          value={cepInput}
          onChange={(e) => handleCepChange(e.target.value)}
          onBlur={handleCepBlur}
          className={inputClass}
        />
      </label>

      {cepStatus === "loading" && <p className="text-sm text-text-muted">Consultando CEP...</p>}

      {cepStatus === "success" && resolvedCity && selectedState && (
        <p className="text-sm font-medium text-text">
          ✓ {resolvedCity} - {selectedState}
        </p>
      )}

      {cepStatus === "error" && (
        <p className="text-sm text-text-muted">
          Não conseguimos consultar esse CEP. Você pode escolher seu estado abaixo.
        </p>
      )}

      {manualOpen ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">Estado (UF)</span>
          <StateSelect value={selectedState ?? ""} onChange={handleManualSelectState} placeholder="Selecionar estado" />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="self-start text-xs text-text-muted underline underline-offset-2 hover:text-text"
        >
          Não sabe seu CEP ou não conseguiu consultar? Escolher estado
        </button>
      )}

      {renderFreeShippingMessage()}
    </div>
  );
}
