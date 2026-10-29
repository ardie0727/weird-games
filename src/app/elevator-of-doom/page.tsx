import type { Metadata } from "next";
import { ElevatorOfDoom } from "@/components/lab/ElevatorOfDoom";

export const metadata: Metadata = {
  title: "Elevator of Doom",
  description: "Run the lift for impatient suits, slow grannies, mind-changing clowns and a toddler who presses every button.",
};

export default function Page() {
  return <ElevatorOfDoom />;
}
