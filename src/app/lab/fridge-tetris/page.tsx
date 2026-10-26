import type { Metadata } from "next";
import { FridgeTetris } from "@/components/lab/FridgeTetris";

export const metadata: Metadata = { title: "Fridge Tetris" };

export default function Page() {
  return <FridgeTetris />;
}
