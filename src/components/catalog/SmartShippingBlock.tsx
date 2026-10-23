"use client";

import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/components/ui/Price";
import { BRAZILIAN_STATES } from "@/lib/shipping/brazilian-states";
import { getSavedShippingState, saveShippingState } from "@/lib/shipping/state-storage";
import { formatPostalCodeInput } from "@/lib/shipping/postal-code";
import { getSavedPostalCode, saveShippingPostalCode } from "@/lib/shipping/postal-code-storage";
import { getSavedShippingCity, saveShippingCity, clearShippingCity } from "@/lib/shipping/city-storage";
import { lookupCep } from "@/lib/shipping/viacep";

interface PublicFreeShippingRule {
  stateCode: string;
  service: "PAC" | "SEDEX";
  minimumAmount: number;
}

/**
 * Cache em nível de módulo (não de componente) — sobrevive a remontagens
 * do SmartShippingBlock dentro da MESMA página. Necessário porque
 * FavoritesPageClient passa por um estado de loading (skeleton) a cada
 * adicionar/remover peça (novo fetch de /api/favoritos/produtos), o que
 * desmonta e remonta este componente; sem esse cache no módulo, cada
 * remontagem perderia o `rules` já buscado e refaria o GET
 * /api/frete-gratis, violando "no máximo 1 GET por carregamento". Um
 * `Promise` compartilhado garante isso mesmo com chamadas concorrentes —
 * e volta a zero no carregamento de página seguinte, já que módulos ES
 * reiniciam num hard reload/nova navegação.
 */
let rulesPromise: Promise<PublicFreeShippingRule[]> | null = null;

function fetchRulesOnce(): Promise<PublicFreeShippingRule[]> {
  if (!rulesPromise) {
    rulesPromise = fetch("/api/frete-gratis", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("bad status");
        return res.json() as Promise<PublicFreeShippingRule[]>;
      })
      .catch((err) => {
        rulesPromise = null; // permite tentar de novo numa próxima chamada
        throw err;
      });
  }
  return rulesPromise;
}

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

type CepStatus = "idle" | "loading" | "success" | "error";

/**
 * Bloco inteligente de frete de /favoritos. Fluxo principal: a cliente
 * informa o CEP, a gente consulta o ViaCEP só pra descobrir UF + cidade, e
 * essa UF alimenta EXATAMENTE a mesma regra de frete grátis de sempre
 * (`free_shipping_rules` via GET /api/frete-gratis — nunca duplicada
 * aqui). A consulta de CEP é só uma forma mais rápida de preencher a UF:
 * se falhar, der timeout ou o CEP não existir, a cliente sempre pode
 * escolher o estado manualmente — a venda nunca depende do ViaCEP.
 *
 * totalPix vem pronto do pai (FavoritesPageClient, que já tem os produtos
 * carregados) — nenhuma busca de produtos nova aqui, e o valor recalcula
 * sozinho a cada render porque o pai já re-renderiza a cada
 * adicionar/remover peça (mesmo evento FAVORITES_CHANGED_EVENT de sempre).
 */
export function SmartShippingBlock({ totalPix }: { totalPix: number }) {
  const [cepInput, setCepInput] = useState<string>(() => getSavedPostalCode() ?? "");
  const [resolvedCity, setResolvedCity] = useState<string | null>(() => getSavedShippingCity());
  const [selectedState, setSelectedState] = useState<string | null>(() => getSavedShippingState());
  const [cepStatus, setCepStatus] = useState<CepStatus>(() =>
    getSavedPostalCode() && getSavedShippingCity() ? "success" : "idle"
  );
  // Aberto de cara quando a última visita ficou no fallback manual (UF
  // salva sem cidade resolvida) — senão fica escondido atrás do link
  // discreto, já que o fluxo principal é o CEP.
  const [manualOpen, setManualOpen] = useState<boolean>(
    () => Boolean(getSavedShippingState() && !getSavedShippingCity())
  );
  const [rules, setRules] = useState<PublicFreeShippingRule[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Dígitos do último CEP que já foi consultado (sucesso ou erro) — evita
  // repetir a chamada ao ViaCEP pro mesmo valor (change + blur do mesmo
  // CEP completo), mas permite tentar de novo se a cliente apagar e
  // digitar os mesmos 8 dígitos outra vez (ver handleCepChange).
  const lastAttemptedDigitsRef = useRef<string | null>(cepStatus === "success" ? cepInput.replace(/\D/g, "") : null);

  const rulesLoading = selectedState !== null && rules === null && !loadError;

  function fetchRules() {
    fetchRulesOnce()
      .then((data) => {
        setRules(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }

  // Só busca ao montar quando já existe UF salva de uma visita anterior
  // (CEP resolvido ou fallback manual) — sem UF ainda, fica parado até o
  // CEP resolver ou a cliente escolher manualmente. Se este componente
  // remontar (ver comentário de rulesPromise acima), fetchRulesOnce()
  // reaproveita a promise já resolvida — nenhum novo GET.
  useEffect(() => {
    if (selectedState) fetchRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runLookup(digits: string) {
    if (lastAttemptedDigitsRef.current === digits) return;
    lastAttemptedDigitsRef.current = digits;
    setCepStatus("loading");

    const result = await lookupCep(digits);

    // O campo pode ter mudado de novo enquanto a consulta corria — só
    // aplica o resultado se os dígitos ainda forem os mesmos que pediram.
    if (lastAttemptedDigitsRef.current !== digits) return;

    if (!result) {
      setCepStatus("error");
      setManualOpen(true);
      return;
    }

    setCepStatus("success");
    setResolvedCity(result.city);
    saveShippingCity(result.city);
    setSelectedState(result.stateCode);
    saveShippingState(result.stateCode);
    setManualOpen(false);
    fetchRules();
  }

  function handleCepChange(raw: string) {
    const masked = formatPostalCodeInput(raw);
    setCepInput(masked);
    saveShippingPostalCode(masked);
    const digits = masked.replace(/\D/g, "");

    // Qualquer edição no CEP invalida a cidade resolvida anteriormente —
    // ela só volta a valer se a nova consulta confirmar o mesmo endereço.
    if (resolvedCity) {
      setResolvedCity(null);
      clearShippingCity();
    }

    if (digits.length === 8) {
      void runLookup(digits);
    } else {
      // Limpa a marca de "já tentei esses dígitos" — permite consultar de
      // novo se a cliente completar os mesmos 8 dígitos outra vez.
      lastAttemptedDigitsRef.current = null;
      if (cepStatus !== "idle") setCepStatus("idle");
    }
  }

  function handleCepBlur() {
    const digits = cepInput.replace(/\D/g, "");
    if (digits.length === 8) void runLookup(digits);
  }

  function handleManualSelectState(code: string) {
    if (!code) return;
    setSelectedState(code);
    saveShippingState(code);
    // Escolha manual nunca equivale a um CEP confirmado — nunca inventa
    // CEP/cidade pra mensagem de WhatsApp (ver favorites-click-action.ts).
    setResolvedCity(null);
    clearShippingCity();
    setCepStatus("idle");
    fetchRules();
  }

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
