import type { Metadata } from "next";
import { listColorsAdmin } from "@/lib/db/colors";
import { ColorsPageClient } from "./ColorsPageClient";

export const metadata: Metadata = { title: "Cores" };

export default async function ColorsPage() {
  const colors = await listColorsAdmin();
  return <ColorsPageClient colors={colors} />;
}
