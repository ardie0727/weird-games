import type { Metadata } from "next";
import { BalloonDoctor } from "@/components/lab/BalloonDoctor";

export const metadata: Metadata = { title: "Balloon Doctor" };

export default function Page() {
  return <BalloonDoctor />;
}
