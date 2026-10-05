"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { SellerFormState } from "./actions";

const initialState: SellerFormState = {};

export interface SellerRowProps {
  seller: { id: string; name: string; active: boolean; round_robin: boolean };
  isFirst: boolean;
  isLast: boolean;
  renameAction: (state: SellerFormState, formData: FormData) => Promise<SellerFormState>;
  activeAction: () => Promise<void>;
  moveUpAction: () => Promise<void>;
  moveDownAction: () => Promise<void>;
}

/**
 * Uma linha da lista: Nome · Situação · ações. Nenhuma ação apaga vendedora.
 *
 * EDITAR NOME — só para corrigir a grafia da MESMA pessoa (ex: Bruniane →
 * Bruniani); o id e todos os pedidos antigos continuam ligados a ela.
 * Substituir uma ex-funcionária por outra pessoa é NOVA VENDEDORA.
 */
export function SellerRow({ seller, isFirst, isLast, renameAction, activeAction, moveUpAction, moveDownAction }: SellerRowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(seller.name);
  const [state, formAction, pending] = useActionState(renameAction, initialState);

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={seller.active ? "font-medium text-text" : "font-medium text-text-muted"}>{seller.name}</span>
          <Badge tone={seller.active ? "success" : "neutral"}>{seller.active ? "Ativa" : "Inativa"}</Badge>
          {seller.active && seller.round_robin && <Badge tone="neutral">Rodízio WhatsApp</Badge>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <form action={moveUpAction}>
            <button
              type="submit"
              disabled={isFirst}
              aria-label="Mover para cima"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-muted disabled:opacity-30"
            >
              ↑
            </button>
          </form>
          <form action={moveDownAction}>
            <button
              type="submit"
              disabled={isLast}
              aria-label="Mover para baixo"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-muted disabled:opacity-30"
            >
              ↓
            </button>
          </form>

          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-muted"
            >
              EDITAR NOME
            </button>
          )}

          <Link
            href={`/admin/vendedoras/${seller.id}`}
            className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-muted"
          >
            CONTATO
          </Link>

          {/* DESATIVAR pede confirmação (some das novas vendas e do WhatsApp); REATIVAR é direto. */}
          <form action={activeAction}>
            <button
              type="submit"
              onClick={(event) => {
                if (
                  seller.active &&
                  !window.confirm(
                    `Desativar ${seller.name}?\n\nEla deixa de aparecer para novas vendas e no WhatsApp. Os pedidos antigos continuam mostrando o nome dela. Dá para reativar depois.`
                  )
                ) {
                  event.preventDefault();
                }
              }}
              className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-muted"
            >
              {seller.active ? "DESATIVAR" : "REATIVAR"}
            </button>
          </form>
        </div>
      </div>

      {editing && (
        <form action={formAction} className="mt-3 flex flex-col gap-2 rounded-xl bg-muted p-3 sm:max-w-md">
          <label htmlFor={`name-${seller.id}`} className="text-xs font-medium text-text">
            Corrigir o nome
          </label>
          <input
            id={`name-${seller.id}`}
            name="name"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={80}
            required
            autoComplete="off"
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-xs text-text-muted">
            Use só para corrigir a grafia da <strong>mesma pessoa</strong>. Para outra pessoa, use NOVA VENDEDORA —
            os pedidos antigos continuam com o nome atual.
          </p>
          {state.fieldErrors?.name && <p className="text-xs text-red-600">{state.fieldErrors.name}</p>}
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Salvando..." : "SALVAR NOME"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setValue(seller.name);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
