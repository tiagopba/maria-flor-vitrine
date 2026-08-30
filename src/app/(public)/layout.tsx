import { NavigationTracker } from "@/components/layout/NavigationTracker";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FavoritesDiscoveryTip } from "@/components/catalog/FavoritesDiscoveryTip";
import { getVisibleCategoriesPublic } from "@/lib/db/categories";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const categories = await getVisibleCategoriesPublic();

  return (
    <>
      <NavigationTracker />
      <SiteHeader categories={categories} />
      <FavoritesDiscoveryTip />
      {children}
      <SiteFooter />
    </>
  );
}
