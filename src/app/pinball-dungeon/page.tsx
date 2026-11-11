import type { Metadata } from "next";
import { PinballDungeon } from "@/components/pinball/PinballDungeon";

export const metadata: Metadata = {
  title: "Pinball Dungeon",
  description: "A pinball roguelike: you are the ball. Smash monsters across 12 dungeon rooms and pick an upgrade after each one.",
};

export default function Page() {
  return <PinballDungeon />;
}
