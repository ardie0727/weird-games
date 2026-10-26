import type { Metadata } from "next";
import { PressureCooker } from "@/components/lab/PressureCooker";

export const metadata: Metadata = { title: "Pressure Cooker" };

export default function Page() {
  return <PressureCooker />;
}
