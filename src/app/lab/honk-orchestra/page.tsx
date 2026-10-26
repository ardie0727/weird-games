import type { Metadata } from "next";
import { HonkOrchestra } from "@/components/lab/HonkOrchestra";

export const metadata: Metadata = { title: "Honk Orchestra" };

export default function Page() {
  return <HonkOrchestra />;
}
