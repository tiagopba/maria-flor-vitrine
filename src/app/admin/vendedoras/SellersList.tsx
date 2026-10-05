import type { Seller } from "@/lib/db/sellers";
import { SellerRow } from "./SellerRowActions";
import type { SellerFormState } from "./actions";

type SellerListItem = Pick<Seller, "id" | "name" | "active" | "round_robin" | "whatsapp_number">;

export interface SellersListActions {
  rename: (id: string) => (state: SellerFormState, formData: FormData) => Promise<SellerFormState>;
  reactivate: (id: string) => (state: SellerFormState, formData: FormData) => Promise<SellerFormState>;
  setActive: (id: string, active: boolean) => () => Promise<void>;
  move: (id: string, direction: "up" | "down") => () => Promise<void>;
}

/** Lista simples: Nome · Situação · ações. Nenhuma ação apaga vendedora. */
export function SellersList({ sellers, actions }: { sellers: SellerListItem[]; actions: SellersListActions }) {
  return (
    <ul className="flex flex-col gap-2">
      {sellers.map((seller, index) => (
        <SellerRow
          key={seller.id}
          seller={{ id: seller.id, name: seller.name, active: seller.active, round_robin: seller.round_robin }}
          hasWhatsapp={Boolean(seller.whatsapp_number)}
          reactivateAction={actions.reactivate(seller.id)}
          isFirst={index === 0}
          isLast={index === sellers.length - 1}
          renameAction={actions.rename(seller.id)}
          activeAction={actions.setActive(seller.id, !seller.active)}
          moveUpAction={actions.move(seller.id, "up")}
          moveDownAction={actions.move(seller.id, "down")}
        />
      ))}
    </ul>
  );
}
