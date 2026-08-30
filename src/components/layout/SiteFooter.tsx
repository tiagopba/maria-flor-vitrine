import Link from "next/link";
import { getInstitutionalInfo } from "@/lib/site-settings/institutional";

/**
 * Rodapé público global — montado uma vez em `(public)/layout.tsx`, então
 * aparece em toda página pública (Home, Novidades, Categoria, Busca,
 * Produto, Favoritos, Seleção compartilhável, institucionais) sem precisar
 * repetir em cada uma. Server Component: busca os dados institucionais uma
 * vez no servidor, nada disso precisa de JS no cliente.
 */
export async function SiteFooter() {
  const info = await getInstitutionalInfo();
  const year = new Date().getFullYear();
  const locationLine = [info.tagline, info.city && info.state ? `${info.city}/${info.state}` : null]
    .filter(Boolean)
    .join(" • ");

  const socialLinks = [
    ...(info.instagramUrl ? [{ label: "Instagram", url: info.instagramUrl }] : []),
    ...info.socialLinks,
  ];

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div>
          <p className="font-display text-lg text-text">{info.tradeName.toUpperCase()}</p>
          {locationLine && <p className="mt-1 text-sm text-text-muted">{locationLine}</p>}
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text">
          <Link href="/" className="hover:text-primary">
            Início
          </Link>
          <Link href="/quem-somos" className="hover:text-primary">
            Quem Somos
          </Link>
          <Link href="/ofertas" className="hover:text-primary">
            Grupo de Ofertas
          </Link>
          <Link href="/como-chegar" className="hover:text-primary">
            Como Chegar
          </Link>
        </nav>

        {socialLinks.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
            {socialLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        <div className="border-t border-border pt-6 text-xs leading-relaxed text-text-muted">
          <p className="break-words">
            © Copyright {year}
            {info.legalName ? ` – ${info.legalName}` : ""}
          </p>
          {info.cnpj && <p className="break-words">CNPJ: {info.cnpj}</p>}
          {info.publicContactEmail && (
            <p className="break-words">
              <a href={`mailto:${info.publicContactEmail}`} className="hover:text-primary hover:underline">
                {info.publicContactEmail}
              </a>
            </p>
          )}
          <p>Todos os direitos reservados</p>
        </div>
      </div>
    </footer>
  );
}
