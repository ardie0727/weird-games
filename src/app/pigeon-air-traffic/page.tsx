import type { Metadata } from "next";
import { PigeonAirTraffic } from "@/components/lab/PigeonAirTraffic";

export const metadata: Metadata = {
  title: "Pigeon Air Traffic",
  description: "Draw flight paths so pigeons land on the right part of the statue without flying into each other.",
};

export default function Page() {
  return <PigeonAirTraffic />;
}
