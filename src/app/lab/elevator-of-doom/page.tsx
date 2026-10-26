import type { Metadata } from "next";
import { ElevatorOfDoom } from "@/components/lab/ElevatorOfDoom";

export const metadata: Metadata = { title: "Elevator of Doom" };

export default function Page() {
  return <ElevatorOfDoom />;
}
