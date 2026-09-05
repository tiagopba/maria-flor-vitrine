import Link from "next/link";
import { Camera, Mail } from "lucide-react";
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

        {/* Links reais de categoria no rodapé (presente em toda página
            pública) — reforço de SEO puramente aditivo: o carrossel
            "Explore por categoria" da Home continua exatamente como está,
            isso aqui é uma segunda superfície, sempre em HTML servido, sem
            depender de clique/drawer/portal como o Menu do header. */}
        <nav aria-label="Categorias">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Categorias</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text">
            <Link href="/novidades" className="hover:text-primary">
              Novidades
            </Link>
            <Link href="/categoria/vestidos" className="hover:text-primary">
              Vestidos
            </Link>
            <Link href="/categoria/calcas" className="hover:text-primary">
              Calças
            </Link>
            <Link href="/categoria/conjuntos" className="hover:text-primary">
              Conjuntos
            </Link>
            <Link href="/categoria/blusas" className="hover:text-primary">
              Blusas
            </Link>
          </div>
        </nav>

        <nav aria-label="Institucional" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text">
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
                className="flex items-center gap-1.5 hover:text-primary"
              >
                {link.label === "Instagram" && <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
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
            <p className="flex items-center gap-1.5 break-words">
              <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
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
