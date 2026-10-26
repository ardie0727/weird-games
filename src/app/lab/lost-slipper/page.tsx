import type { Metadata } from "next";
import { LostSlipper } from "@/components/lab/LostSlipper";

export const metadata: Metadata = { title: "Lost Slipper" };

export default function Page() {
  return <LostSlipper />;
}
