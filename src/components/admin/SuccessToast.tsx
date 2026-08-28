"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Toast } from "@/components/ui/Toast";

/**
 * Mostra um toast de sucesso vindo de `?sucesso=mensagem` na URL (setado
 * pelo redirect() da server action após criar/editar) e limpa o parâmetro
 * da URL logo em seguida, para não reaparecer num refresh ou "voltar".
 */
export function SuccessToast({ queryParam = "sucesso" }: { queryParam?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Lê uma vez, na primeira renderização — nunca dentro de um efeito.
  const [message, setMessage] = useState<string | null>(() => searchParams.get(queryParam));

  useEffect(() => {
    if (!message) return;
    const params = new URLSearchParams(searchParams);
    params.delete(queryParam);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // Só na montagem: sincroniza a URL uma vez com a mensagem já capturada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!message) return null;
  return <Toast message={message} onDismiss={() => setMessage(null)} />;
}
