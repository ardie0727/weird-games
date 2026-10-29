import type { Metadata } from "next";
import { KiteCutter } from "@/components/lab/KiteCutter";

export const metadata: Metadata = { title: "Kite Cutter" };

export default function Page() {
  return <KiteCutter />;
}
