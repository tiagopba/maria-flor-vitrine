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
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-text px-4 py-2.5 text-sm font-medium text-background shadow-lg"
    >
      {message}
    </div>
  );
}
