import type { Metadata } from "next";
import { FridgeTetris } from "@/components/lab/FridgeTetris";

export const metadata: Metadata = {
  title: "Fridge Tetris",
  description: "Squeeze oddly shaped leftovers into the fridge, around shelves and mystery jars, before the door swings shut.",
};

export default function Page() {
  return <FridgeTetris />;
}
