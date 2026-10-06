"use client";

import { useEffect, useState } from "react";

export function Toast({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text shadow-[0_8px_24px_-12px_rgba(45,38,41,0.25)]"
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      {message}
    </div>
  );
}
