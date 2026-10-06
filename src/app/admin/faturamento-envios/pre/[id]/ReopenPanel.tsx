"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/app/admin/faturamento-envios/[id]/CopyButton";
import { buildIntakeLinkMessage } from "@/lib/intake/messages";
import { reopenIntakeAction } from "../actions";

export function ReopenPanel({
  intakeId,
  customerName,
  customerWhatsapp,
  canReopen,
}: {
  intakeId: string;
  customerName: string;
  customerWhatsapp: string | null;
  canReopen: boolean;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const reopen = () => {
    if (!window.confirm("Gerar um novo link? O link anterior deixa de funcionar imediatamente.")) return;
    setError(null);
    startTransition(async () => {
      const result = await reopenIntakeAction(intakeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // O link fica na tela; só depois atualizamos o status da página.
      setLink(result.link);
      setWhatsappUrl(result.whatsappUrl);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        O link vale por 7 dias e é de uso único: depois que a cliente envia os dados, ele fica bloqueado. Para corrigir dados, use REABRIR COLETA (gera um novo link).
      </p>

      {canReopen && (
        <div>
          <Button type="button" variant="secondary" onClick={reopen} disabled={pending}>
            REABRIR COLETA
          </Button>
        </div>
      )}

      {link && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4">
          <p className="break-all font-mono text-xs text-text">{link}</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-surface p-3 text-xs text-text">
            {buildIntakeLinkMessage(customerName, link)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={link} label="COPIAR LINK" />
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                ABRIR WHATSAPP
              </a>
            ) : (
              <p className="text-sm text-text-muted">
                {customerWhatsapp ? "WhatsApp inválido." : "Sem WhatsApp cadastrado: copie o link e envie manualmente."}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
