import { Lock } from "lucide-react";
import { getSiteUrl } from "@/lib/site";

/**
 * Faixa de confiança — só reforça que a conexão é HTTPS (nunca um selo de
 * terceiro nem certificação de pagamento; a loja não vende direto pelo
 * site, então isso seria enganoso). Montada uma vez em (public)/layout.tsx,
 * logo antes do SiteFooter, então aparece em toda página pública.
 *
 * Domínio exibido vem de getSiteUrl() (mesma fonte usada em canonical/JSON-LD)
 * em vez de um texto fixo — mostra o host real do ambiente (produção,
 * Preview, local), nunca um domínio errado fora de produção.
 */
export function TrustBar() {
  const host = new URL(getSiteUrl()).host;

  return (
    <div className="border-t border-border bg-muted/50">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-1 px-4 py-5 text-center sm:px-6">
        <div className="flex items-center gap-1.5 text-sm font-medium text-text">
          <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Navegação segura
        </div>
        <p className="text-xs text-text-muted">Conexão protegida por HTTPS</p>
        <p className="text-[11px] text-text-muted">{host} • conexão segura</p>
      </div>
    </div>
  );
}
