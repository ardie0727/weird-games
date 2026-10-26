import type { Metadata } from "next";
import { PigeonAirTraffic } from "@/components/lab/PigeonAirTraffic";

export const metadata: Metadata = { title: "Pigeon Air Traffic" };

export default function Page() {
  return <PigeonAirTraffic />;
}
