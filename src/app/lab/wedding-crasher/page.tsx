import type { Metadata } from "next";
import { WeddingCrasher } from "@/components/lab/WeddingCrasher";

export const metadata: Metadata = { title: "Wedding Crasher" };

export default function Page() {
  return <WeddingCrasher />;
}
