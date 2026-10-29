import type { Metadata } from "next";
import { BalloonDoctor } from "@/components/lab/BalloonDoctor";

export const metadata: Metadata = {
  title: "Balloon Doctor",
  description: "A leaky balloon drifts up a cactus canyon. Tap holes to patch them and tilt to steer. Every leak is a tiny jet.",
};

export default function Page() {
  return <BalloonDoctor />;
}
