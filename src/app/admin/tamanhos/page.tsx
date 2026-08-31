import type { Metadata } from "next";
import { listSizeOptionsAdmin } from "@/lib/db/sizes";
import { SizesPageClient } from "./SizesPageClient";

export const metadata: Metadata = { title: "Tamanhos" };

export default async function SizesPage() {
  const sizes = await listSizeOptionsAdmin();
  return <SizesPageClient sizes={sizes} />;
}
