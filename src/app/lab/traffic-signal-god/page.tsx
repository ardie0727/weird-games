import type { Metadata } from "next";
import { TrafficSignalGod } from "@/components/lab/TrafficSignalGod";

export const metadata: Metadata = { title: "Traffic Signal God" };

export default function Page() {
  return <TrafficSignalGod />;
}
