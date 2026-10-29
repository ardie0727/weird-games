import type { Metadata } from "next";
import { DabbawalaRush } from "@/components/lab/DabbawalaRush";

export const metadata: Metadata = {
  title: "Dabbawala Rush",
  description: "Sort colour-coded tiffins onto the right local train before it pulls out. Lunch for the whole city depends on it.",
};

export default function Page() {
  return <DabbawalaRush />;
}
