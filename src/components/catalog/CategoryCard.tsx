import Image from "next/image";
import Link from "next/link";

export function CategoryCard({
  category,
}: {
  category: { name: string; slug: string; cover_image: string | null };
}) {
  return (
    <Link href={`/categoria/${category.slug}`} className="group block">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
        {category.cover_image ? (
          <Image
            src={category.cover_image}
            alt=""
            fill
            sizes="(max-width: 640px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/40 to-primary/20">
            <span className="font-display text-lg text-primary/80">
              {category.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-center text-xs font-medium text-text sm:text-sm">{category.name}</p>
    </Link>
  );
}
