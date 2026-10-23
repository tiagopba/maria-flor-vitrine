"use client";

import { useEffect, useRef, useState } from "react";
import { getSavedShippingState, saveShippingState } from "@/lib/shipping/state-storage";
import { formatPostalCodeInput } from "@/lib/shipping/postal-code";
import { lookupCep } from "@/lib/shipping/viacep";

export interface PublicFreeShippingRule {
  stateCode: string;
  service: "PAC" | "SEDEX";
  minimumAmount: number;
}

export type CepStatus = "idle" | "loading" | "success" | "error";

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

/**
 * Estado do bloco de frete de /favoritos, levantado pro componente PAI
 * (FavoritesPageClient) em vez de morar dentro do SmartShippingBlock: o
 * pai nunca desmonta ao adicionar/remover peça do carrinho — só o
 * SmartShippingBlock desmonta, via o skeleton de loading que troca a
 * peça de lugar (ver fetch de /api/favoritos/produtos em
 * FavoritesPageClient). CEP e cidade são DE PROPÓSITO só estado de
 * página (useState, nunca localStorage): não sobrevivem a um reload nem
 * ficam visíveis pra outra pessoa num aparelho compartilhado — só
 * precisam estar disponíveis enquanto a cliente monta o pedido nesta
 * mesma visita, pra entrar na mensagem de WhatsApp ao clicar em
 * FINALIZAR PEDIDO. A UF, diferente disso, continua em state-storage.ts
 * (preferência que já existia antes desta feature, intocada) — é o que
 * faz a UF sobreviver ao próprio remount do SmartShippingBlock acima sem
 * precisar levantar CEP/cidade só pra isso.
 */
export function useCepShipping() {
  const [cepInput, setCepInput] = useState("");
  const [resolvedCity, setResolvedCity] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(() => getSavedShippingState());
  const [cepStatus, setCepStatus] = useState<CepStatus>("idle");
  const [manualOpen, setManualOpen] = useState(false);
  const [rules, setRules] = useState<PublicFreeShippingRule[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Dígitos do último CEP já consultado (sucesso ou erro) — evita repetir
  // a chamada ao ViaCEP pro mesmo valor (change + blur do mesmo CEP
  // completo), mas permite tentar de novo se a cliente apagar e digitar
  // os mesmos 8 dígitos outra vez (ver handleCepChange).
  const lastAttemptedDigitsRef = useRef<string | null>(null);

  const rulesLoading = selectedState !== null && rules === null && !loadError;

  function fetchRules() {
    fetchRulesOnce()
      .then((data) => {
        setRules(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }

  // Só busca ao montar quando já existe UF salva de uma visita anterior —
  // sem UF ainda, fica parado até o CEP resolver ou a cliente escolher
  // manualmente. Se este componente remontar (ver comentário de
  // rulesPromise acima), fetchRulesOnce() reaproveita a promise já
  // resolvida — nenhum novo GET.
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
    setSelectedState(result.stateCode);
    saveShippingState(result.stateCode);
    setManualOpen(false);
    fetchRules();
  }

  function handleCepChange(raw: string) {
    const masked = formatPostalCodeInput(raw);
    setCepInput(masked);
    const digits = masked.replace(/\D/g, "");

    // Qualquer edição no CEP invalida a cidade resolvida anteriormente —
    // ela só volta a valer se a nova consulta confirmar o mesmo endereço.
    if (resolvedCity) setResolvedCity(null);

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
    setCepStatus("idle");
    fetchRules();
  }

  return {
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
  };
}

export type CepShipping = ReturnType<typeof useCepShipping>;
