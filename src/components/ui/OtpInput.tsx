"use client";

import { useEffect, useRef } from "react";

interface OtpInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

/**
 * Um campo por dígito, com foco avançando sozinho ao digitar, Backspace
 * voltando pro campo anterior e colar o código inteiro preenchendo todos
 * de uma vez. Controlado por uma única string (`value`) — o componente pai
 * não precisa saber que por trás são N inputs.
 */
export function OtpInput({ length, value, onChange, disabled, hasError }: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (value === "") inputsRef.current[0]?.focus();
  }, [value]);

  function commit(nextDigits: string[]) {
    onChange(nextDigits.join(""));
  }

  function handleChange(index: number, raw: string) {
    const onlyDigits = raw.replace(/\D/g, "");

    if (!onlyDigits) {
      const next = digits.slice();
      next[index] = "";
      commit(next);
      return;
    }

    // Alguns teclados/gerenciadores de senha preenchem mais de um caractere
    // de uma vez num campo só — distribui a partir daqui pros próximos.
    const next = digits.slice();
    let cursor = index;
    for (const char of onlyDigits) {
      if (cursor >= length) break;
      next[cursor] = char;
      cursor++;
    }
    commit(next);
    inputsRef.current[Math.min(cursor, length - 1)]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = digits.slice();
      if (next[index]) {
        next[index] = "";
        commit(next);
        return;
      }
      if (index > 0) {
        next[index - 1] = "";
        commit(next);
        inputsRef.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const onlyDigits = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!onlyDigits) return;
    e.preventDefault();

    const chars = onlyDigits.slice(0, length).split("");
    const next = Array.from({ length }, () => "");
    chars.forEach((char, i) => {
      next[i] = char;
    });
    commit(next);
    inputsRef.current[Math.min(chars.length, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Código de confirmação">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          aria-label={`Dígito ${i + 1} de ${length}`}
          className={`h-12 w-9 rounded-lg border bg-white text-center text-lg font-semibold text-text outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-50 sm:w-10 ${
            hasError ? "border-red-400" : "border-border"
          }`}
        />
      ))}
    </div>
  );
}
