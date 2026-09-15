"use client";

import { useEffect, useState } from "react";
import { formatBRL } from "@/components/ui/Price";
import { BRAZILIAN_STATES } from "@/lib/shipping/brazilian-states";
import { getSavedShippingState, saveShippingState } from "@/lib/shipping/state-storage";
import { formatPostalCodeInput } from "@/lib/shipping/postal-code";
import { getSavedPostalCode, saveShippingPostalCode } from "@/lib/shipping/postal-code-storage";

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
 * Bloco inteligente de frete de /favoritos — calcula o benefício de frete
 * grátis com base no total Pix/à vista das peças DISPONÍVEIS atualmente
 * na seleção (nunca o preço do cartão) contra `free_shipping_rules`
 * (mesma regra PAC/SEDEX do Admin, via GET /api/frete-gratis).
 *
 * Reaproveita a UF salva em mariaflor:shipping-state:v1 (mesma chave do
 * antigo FreeShippingAccordion — que continua intocado, usado só na
 * página de produto) e o mesmo endpoint público, que devolve TODAS as
 * regras ativas de uma vez — por isso no máximo 1 GET por visita: a
 * primeira UF escolhida (ou já salva) dispara a única busca; trocar de UF
 * depois só refiltra a lista em memória, sem nova requisição.
 *
 * totalPix vem pronto do pai (FavoritesPageClient, que já tem os produtos
 * carregados) — nenhuma busca de produtos nova aqui, e o valor recalcula
 * sozinho a cada render porque o pai já re-renderiza a cada
 * adicionar/remover peça (mesmo evento FAVORITES_CHANGED_EVENT de sempre).
 */
export function SmartShippingBlock({ totalPix }: { totalPix: number }) {
  const [selectedState, setSelectedState] = useState<string | null>(() => getSavedShippingState());
  const [rules, setRules] = useState<PublicFreeShippingRule[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [postalCode, setPostalCode] = useState<string>(() => getSavedPostalCode() ?? "");
  // Derivado (nunca setState síncrono dentro do efeito de montagem abaixo):
  // "carregando" é só "tem UF, ainda sem regras, sem erro" — nada a
  // despachar antes do fetch resolver.
  const loading = selectedState !== null && rules === null && !loadError;

  function fetchRules() {
    fetchRulesOnce()
      .then((data) => {
        setRules(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }

  // Só dispara ao montar quando já existe UF salva de uma visita anterior
  // — sem UF, fica parado até a cliente escolher (handleSelectState). Se
  // este componente remontar (ver comentário de rulesPromise acima),
  // fetchRulesOnce() reaproveita a promise já resolvida — nenhum novo GET.
  useEffect(() => {
    if (selectedState) fetchRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectState(code: string) {
    if (!code) return;
    setSelectedState(code);
    saveShippingState(code);
    fetchRules();
  }

  function handlePostalCodeChange(raw: string) {
    const masked = formatPostalCodeInput(raw);
    setPostalCode(masked);
    saveShippingPostalCode(masked);
  }

  const rulesForState = selectedState && rules ? rules.filter((r) => r.stateCode === selectedState) : [];
  const stateName = selectedState ? BRAZILIAN_STATES.find((s) => s.code === selectedState)?.name : undefined;

  const unlocked = rulesForState.filter((r) => totalPix >= r.minimumAmount).sort((a, b) => a.minimumAmount - b.minimumAmount);
  const locked = rulesForState.filter((r) => totalPix < r.minimumAmount).sort((a, b) => a.minimumAmount - b.minimumAmount);

  function renderContent() {
    if (!selectedState) {
      return (
        <>
          <p className="text-[15px] font-semibold leading-snug text-text">🚚 Confira suas condições de frete</p>
          <StateSelect value="" onChange={handleSelectState} placeholder="Selecionar estado" />
        </>
      );
    }

    if (loading) {
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
        <>
          <p className="text-[15px] font-semibold leading-snug text-text">
            🚚 Vamos calcular a melhor opção de frete para você
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">Informe seu CEP para a vendedora calcular:</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="00000-000"
              value={postalCode}
              onChange={(e) => handlePostalCodeChange(e.target.value)}
              className="h-10 w-40 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </>
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
      {renderContent()}

      {selectedState && !loading && (
        <label className="flex flex-col gap-1 pt-1">
          <span className="text-xs text-text-muted">Trocar estado</span>
          <StateSelect value={selectedState} onChange={handleSelectState} placeholder="Selecionar estado" />
        </label>
      )}
    </div>
  );
}
