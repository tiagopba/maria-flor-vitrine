import { NavigationTracker } from "@/components/layout/NavigationTracker";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getActiveCategoriesPublic } from "@/lib/db/categories";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const categories = await getActiveCategoriesPublic();

  return (
    <>
      <NavigationTracker />
      <SiteHeader categories={categories} />
      {children}
    </>
  );
}
