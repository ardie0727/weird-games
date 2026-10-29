import type { Metadata } from "next";
import { EscalatorPanic } from "@/components/lab/EscalatorPanic";

export const metadata: Metadata = { title: "Escalator Panic" };

export default function Page() {
  return <EscalatorPanic />;
}
