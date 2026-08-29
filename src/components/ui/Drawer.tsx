"use client";

import { useEffect } from "react";

/**
 * Comportamento comum a qualquer drawer/modal: fecha no ESC, trava o
 * scroll do body enquanto aberto (sempre destravando de volta ao fechar,
 * mesmo se o componente desmontar). Compartilhado entre este bottom sheet
 * e o painel lateral do menu (CategoryMenuDrawer) para não duplicar os
 * mesmos 10 efeitos colaterais em dois componentes.
 */
export function useDrawerBehavior(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);
}

/**
 * Bottom sheet no celular (sobe da base da tela), modal centralizado a
 * partir de `sm:`. Sem lib externa — só CSS/transição simples.
 *
 * `max-height` + `overflow-y-auto` no corpo (bug real encontrado em
 * iPhone físico no CategoryMenuDrawer, que não usa mais este componente:
 * sem limite de altura, conteúdo mais alto que a tela empurrava o próprio
 * título/botão de fechar para fora da viewport, porque o container não
 * tinha como rolar). Mantido aqui também porque qualquer novo uso deste
 * Drawer com uma lista longa teria o mesmo problema.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useDrawerBehavior(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        className="relative flex max-h-[85vh] max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between p-5 pb-3">
          {title && <h2 className="font-display text-lg text-text">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-muted"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
