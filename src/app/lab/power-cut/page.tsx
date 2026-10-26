import type { Metadata } from "next";
import { PowerCut } from "@/components/lab/PowerCut";

export const metadata: Metadata = { title: "Power Cut" };

export default function Page() {
  return <PowerCut />;
}
