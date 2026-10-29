import type { Metadata } from "next";
import { ChaiSpill } from "@/components/lab/ChaiSpill";

export const metadata: Metadata = { title: "Chai Spill" };

export default function Page() {
  return <ChaiSpill />;
}
