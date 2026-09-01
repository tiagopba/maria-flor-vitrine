"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { clearFavorites } from "@/lib/favorites/storage";
import { clearJustContactedSeller, hasJustContactedSeller } from "@/lib/favorites/post-contact";

/**
 * Pergunta mostrada quando a cliente volta ao site depois de ter tocado em
 * "Falar com uma vendedora" (ver post-contact.ts) — nunca ao abrir o site
 * do zero sem ter passado por esse fluxo. Montado uma única vez no layout
 * público (não por página), então navegação client-side normal dentro do
 * site nunca reabre a pergunta; só um retorno real (troca de app/aba, ou
 * o navegador restaurando a página do cache) dispara a checagem.
 */
export function PostContactPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function check() {
      if (document.visibilityState !== "visible") return;
      if (hasJustContactedSeller()) setOpen(true);
    }

    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  function handleKeep() {
    clearJustContactedSeller();
    setOpen(false);
  }

  function handleStartNew() {
    clearJustContactedSeller();
    clearFavorites();
    setOpen(false);
  }

  return (
    <Drawer open={open} onClose={handleKeep} title="Quer começar uma nova seleção?">
      <div className="flex flex-col gap-4 pb-1">
        <p className="text-sm text-text-muted">
          As peças que você enviou para a vendedora continuarão disponíveis no link enviado.
        </p>
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={handleKeep} className="h-12">
            Manter minha seleção
          </Button>
          <Button type="button" variant="secondary" onClick={handleStartNew} className="h-12">
            Começar nova seleção
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
