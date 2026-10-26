import type { Metadata } from "next";
import { TiffinStack } from "@/components/lab/TiffinStack";

export const metadata: Metadata = { title: "Tiffin Stack" };

export default function Page() {
  return <TiffinStack />;
}
