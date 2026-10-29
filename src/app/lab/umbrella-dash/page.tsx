import type { Metadata } from "next";
import { UmbrellaDash } from "@/components/lab/UmbrellaDash";

export const metadata: Metadata = { title: "Umbrella Dash" };

export default function Page() {
  return <UmbrellaDash />;
}
