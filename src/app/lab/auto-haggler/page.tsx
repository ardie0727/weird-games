import type { Metadata } from "next";
import { AutoHaggler } from "@/components/lab/AutoHaggler";

export const metadata: Metadata = { title: "Auto Haggler" };

export default function Page() {
  return <AutoHaggler />;
}
